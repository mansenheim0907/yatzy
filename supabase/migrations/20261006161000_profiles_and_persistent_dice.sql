-- Selectable player avatars and persistent dice between turns.
alter table yatzy_private.rooms
  add column if not exists avatars integer[] not null default '{}'::integer[];

update yatzy_private.rooms
set avatars=case
  when cardinality(names)=1 then array[0]
  when cardinality(names)>=2 then array[0,10]
  else '{}'::integer[]
end
where cardinality(avatars)<>cardinality(names);

-- Support several simultaneous duels per player and expose an active-match list.
-- Private invitations always create a new room. Online matchmaking may reuse only
-- the player's own still-waiting matchmaking room.
create or replace function yatzy_private.command(p_action text,p_token text,p_room uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 r yatzy_private.rooms%rowtype;
 h text;
 seat integer;
 n integer;
 points integer;
 key text;
 a integer;
 b integer;
 name text;
 result jsonb := '[]'::jsonb;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Ogiltig spelarnyckel'; end if;
 h:=encode(sha256(convert_to(p_token,'UTF8')),'hex');

 -- List every waiting/playing duel belonging to this player. A list read also
 -- resolves any one-hour timeout so stale matches disappear immediately.
 if p_action='list' then
  for r in
   select *
   from yatzy_private.rooms
   where h=any(hashes)
     and (
       status='playing'
       or (status='waiting' and touched>clock_timestamp()-interval '24 hours')
     )
   order by
     case when status='playing' and turn=array_position(hashes,h)-1 then 0 else 1 end,
     action_at asc,
     touched desc
   for update
  loop
   seat:=array_position(r.hashes,h)-1;

   if r.status='playing' and r.action_at<=clock_timestamp()-interval '1 hour' then
    update yatzy_private.rooms
      set status='timeout',
          winner=1-r.turn,
          version=version+1,
          touched=clock_timestamp()
      where id=r.id
      returning * into r;

    foreach key in array r.hashes loop
     perform realtime.send(
       jsonb_build_object('version',r.version),
       'room_changed',
       'yatzy:'||r.id::text||':'||key,
       true
     );
    end loop;
   end if;

   if r.status in ('waiting','playing') then
    result:=result||jsonb_build_array(
      (to_jsonb(r)-'hashes'-'touched'-'action_at')
      ||jsonb_build_object(
        'seat',seat,
        'deadline_at',case when r.status='playing' then r.action_at+interval '1 hour' else null end
      )
    );
   end if;
  end loop;
  return result;
 end if;

 if p_action='create' then
  name:=trim(coalesce(p_payload->>'name','Spelare'));
  if length(name)<1 or length(name)>20 then raise exception 'Namnet ska vara 1–20 tecken'; end if;

  -- Every invitation is its own duel, even if this player already has others.
  loop
   begin
    insert into yatzy_private.rooms(code,mode,hashes,names,avatars)
    values(
      upper(substr(replace(gen_random_uuid()::text,'-',''),1,5)),
      'private',
      array[h],
      array[name],
      array[greatest(0,least(19,coalesce((p_payload->>'avatar')::integer,0)))]
    ) returning * into r;
    exit;
   exception when unique_violation then null; end;
  end loop;

 elsif p_action='find' then
  name:=trim(coalesce(p_payload->>'name','Spelare'));
  if length(name)<1 or length(name)>20 then raise exception 'Namnet ska vara 1–20 tecken'; end if;
  perform pg_advisory_xact_lock(7183926);

  -- Reuse only this player's existing matchmaking request, never a playing duel.
  select * into r
  from yatzy_private.rooms
  where h=any(hashes)
    and status='waiting'
    and mode='online'
    and touched>clock_timestamp()-interval '30 seconds'
  order by touched desc
  limit 1
  for update;

  if not found then
   select * into r
   from yatzy_private.rooms
   where status='waiting'
     and mode='online'
     and cardinality(hashes)=1
     and not (h=any(hashes))
     and touched>clock_timestamp()-interval '30 seconds'
   order by touched
   limit 1
   for update;

   if found then
    update yatzy_private.rooms
      set hashes=array_append(hashes,h),
          names=array_append(names,name),
          avatars=array_append(avatars,greatest(0,least(19,coalesce((p_payload->>'avatar')::integer,0)))),
          status='playing',
          version=version+1,
          touched=clock_timestamp(),
          action_at=clock_timestamp()
      where id=r.id
      returning * into r;
   else
    loop
     begin
      insert into yatzy_private.rooms(code,mode,hashes,names,avatars)
      values(
       upper(substr(replace(gen_random_uuid()::text,'-',''),1,5)),
       'online',
       array[h],
       array[name],
       array[greatest(0,least(19,coalesce((p_payload->>'avatar')::integer,0)))]
      ) returning * into r;
      exit;
     exception when unique_violation then null; end;
    end loop;
   end if;
  end if;

 elsif p_action='join' then
  name:=trim(coalesce(p_payload->>'name','Spelare'));
  if length(name)<1 or length(name)>20 then raise exception 'Namnet ska vara 1–20 tecken'; end if;
  perform pg_advisory_xact_lock(7183926);

  select * into r
  from yatzy_private.rooms
  where code=upper(trim(p_payload->>'code'))
    and mode='private'
    and touched>clock_timestamp()-interval '24 hours'
  for update;

  if not found then raise exception 'Rummet hittades inte eller är fullt'; end if;

  if not (h=any(r.hashes)) then
   if r.status<>'waiting' or cardinality(r.hashes)<>1 then raise exception 'Rummet hittades inte eller är fullt'; end if;
   update yatzy_private.rooms
     set hashes=array_append(hashes,h),
         names=array_append(names,name),
         avatars=array_append(avatars,greatest(0,least(19,coalesce((p_payload->>'avatar')::integer,0)))),
         status='playing',
         version=version+1,
         touched=clock_timestamp(),
         action_at=clock_timestamp()
     where id=r.id
     returning * into r;
  end if;

 else
  select * into r from yatzy_private.rooms where id=p_room for update;
  if not found then raise exception 'Rummet finns inte längre'; end if;
 end if;

 seat:=array_position(r.hashes,h)-1;
 if seat is null then raise exception 'Ogiltig spelarnyckel'; end if;

 -- Playing duels time out before the generic room-age check.
 if r.status='playing' and r.action_at<=clock_timestamp()-interval '1 hour' then
  update yatzy_private.rooms
    set status='timeout',
        winner=1-r.turn,
        version=version+1,
        touched=clock_timestamp()
    where id=r.id
    returning * into r;

  foreach key in array r.hashes loop
   perform realtime.send(
     jsonb_build_object('version',r.version),
     'room_changed',
     'yatzy:'||r.id::text||':'||key,
     true
   );
  end loop;

  return (to_jsonb(r)-'hashes'-'touched'-'action_at')
    ||jsonb_build_object('seat',seat,'deadline_at',null);
 end if;

 if r.status='waiting' and r.touched<clock_timestamp()-interval '24 hours' then raise exception 'Rummet har gått ut'; end if;

 if p_action in ('roll','hold','score','leave') then
  if (p_payload->>'version')::integer is distinct from r.version then raise exception 'Spelet har uppdaterats. Försök igen'; end if;

  if p_action='leave' then
   if r.status='playing' then r.winner:=1-seat; end if;
   if r.status not in ('waiting','playing') then raise exception 'Matchen är redan avslutad'; end if;
   r.status:='abandoned';
  else
   if r.status<>'playing' or r.turn<>seat then raise exception 'Vänta på din tur'; end if;

   if p_action='roll' then
    if r.rolls>=3 then raise exception 'Du har redan kastat tre gånger'; end if;
    if r.rolls>0 and r.held=array[true,true,true,true,true] then raise exception 'Lås upp minst en tärning'; end if;
    for n in 1..5 loop
     if not r.held[n] then r.dice[n]:=floor(random()*6)::integer+1; end if;
    end loop;
    r.rolls:=r.rolls+1;
    r.action_at:=clock_timestamp();

   elsif p_action='hold' then
    n:=(p_payload->>'index')::integer+1;
    if n is null or n<1 or n>5 or r.rolls<1 or r.rolls>=3 then raise exception 'Tärningen kan inte låsas nu'; end if;
    r.held[n]:=not r.held[n];

   elsif p_action='score' then
    key:=p_payload->>'category';
    if r.rolls<1 then raise exception 'Kasta först'; end if;
    if key is null or r.cards->seat ? key then raise exception 'Kategorin är redan använd eller saknas'; end if;
    points:=yatzy_private.points(key,r.dice);
    r.cards:=jsonb_set(r.cards,array[seat::text,key],to_jsonb(points));
    r.turn:=1-seat;
    r.rolls:=0;
    r.held:=array[false,false,false,false,false];
    r.action_at:=clock_timestamp();

    if (select count(*) from jsonb_object_keys(r.cards->0))=15
       and (select count(*) from jsonb_object_keys(r.cards->1))=15 then
     r.status:='finished';
     a:=yatzy_private.total(r.cards->0);
     b:=yatzy_private.total(r.cards->1);
     r.winner:=case when a>b then 0 when b>a then 1 else null end;
    end if;
   end if;
  end if;

  update yatzy_private.rooms
    set status=r.status,
        turn=r.turn,
        dice=r.dice,
        held=r.held,
        rolls=r.rolls,
        cards=r.cards,
        winner=r.winner,
        version=version+1,
        touched=clock_timestamp(),
        action_at=r.action_at
    where id=r.id
    returning * into r;

 elsif p_action='get' then
  update yatzy_private.rooms set touched=clock_timestamp() where id=r.id returning * into r;
 elsif p_action not in ('create','find','join') then
  raise exception 'Okänd åtgärd';
 end if;

 if p_action<>'get' then
  foreach key in array r.hashes loop
   perform realtime.send(
     jsonb_build_object('version',r.version),
     'room_changed',
     'yatzy:'||r.id::text||':'||key,
     true
   );
  end loop;
 end if;

 return (to_jsonb(r)-'hashes'-'touched'-'action_at')
   ||jsonb_build_object(
     'seat',seat,
     'deadline_at',case when r.status='playing' then r.action_at+interval '1 hour' else null end
   );
end $$;
