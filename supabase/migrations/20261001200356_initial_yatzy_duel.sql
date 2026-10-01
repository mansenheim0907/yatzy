-- Capability-based guest sessions, following Ordduellen. No Auth account required.
create schema yatzy_private;
revoke all on schema yatzy_private from public;
grant usage on schema yatzy_private to anon, authenticated;
create table yatzy_private.rooms (
 id uuid primary key default gen_random_uuid(), code text unique not null,
 mode text not null check(mode in ('private','online')),
 hashes text[] not null, names text[] not null,
 status text not null default 'waiting', turn integer not null default 0,
 dice integer[] not null default '{1,1,1,1,1}', held boolean[] not null default '{false,false,false,false,false}',
 rolls integer not null default 0, cards jsonb not null default '[{},{}]',
 version integer not null default 0, winner integer,
 touched timestamptz not null default clock_timestamp()
);
alter table yatzy_private.rooms enable row level security;
create index waiting_yatzy on yatzy_private.rooms(touched) where status='waiting' and mode='online';

create function yatzy_private.points(k text, d integer[]) returns integer
language plpgsql immutable set search_path='' as $$
declare c integer[] := array[0,0,0,0,0,0]; n integer; s integer:=0; pairs integer[]:='{}'; upper integer;
begin
 if cardinality(d)<>5 or exists(select 1 from unnest(d) v where v is null or v<1 or v>6) then raise exception 'Ogiltiga tärningar'; end if;
 foreach n in array d loop c[n]:=c[n]+1; s:=s+n; end loop;
 upper:=array_position(array['ones','twos','threes','fours','fives','sixes'],k);
 if upper is not null then return c[upper]*upper; end if;
 for n in reverse 6..1 loop
  if c[n]>=2 then pairs:=array_append(pairs,n); end if;
  if k='three' and c[n]>=3 then return n*3; end if;
  if k='four' and c[n]>=4 then return n*4; end if;
 end loop;
 case k
 when 'pair' then return coalesce(pairs[1]*2,0);
 when 'two_pairs' then return coalesce((pairs[1]+pairs[2])*2,0);
 when 'three','four' then return 0;
 when 'small' then return case when c[1:5]=array[1,1,1,1,1] then 15 else 0 end;
 when 'large' then return case when c[2:6]=array[1,1,1,1,1] then 20 else 0 end;
 when 'house' then return case when 3=any(c) and 2=any(c) then s else 0 end;
 when 'chance' then return s;
 when 'yatzy' then return case when 5=any(c) then 50 else 0 end;
 else raise exception 'Ogiltig kategori'; end case;
end $$;
create function yatzy_private.total(card jsonb) returns integer language sql immutable set search_path='' as $$
 select coalesce(sum(value::integer),0)::integer + case when coalesce(sum(value::integer) filter(where key=any(array['ones','twos','threes','fours','fives','sixes'])),0)>=63 then 50 else 0 end from jsonb_each_text(card)
$$;
create function yatzy_private.channel_allowed(topic text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from yatzy_private.rooms where 'yatzy:'||id::text||':'||hashes[1]=topic or 'yatzy:'||id::text||':'||hashes[2]=topic)
$$;
revoke all on function yatzy_private.channel_allowed(text) from public;
grant execute on function yatzy_private.channel_allowed(text) to anon,authenticated;
create policy yatzy_receive on realtime.messages for select to anon,authenticated using(extension='broadcast' and yatzy_private.channel_allowed((select realtime.topic())));

-- Only this guarded entry point may modify rooms. Hashes never leave the database.
create function yatzy_private.command(p_action text,p_token text,p_room uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r yatzy_private.rooms%rowtype; h text; seat integer; n integer; points integer; key text; a integer; b integer; name text;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Ogiltig spelarnyckel'; end if;
 h:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if p_action in ('create','find','join') then
  -- Serialize admission to prevent double pairing and duplicate rooms on retries.
  perform pg_advisory_xact_lock(7183926);
  select * into r from yatzy_private.rooms where h=any(hashes) and status in ('waiting','playing') and touched>clock_timestamp()-interval '24 hours' order by touched desc limit 1 for update;
  if not found then
   name:=trim(coalesce(p_payload->>'name','Spelare'));
   if length(name)<1 or length(name)>20 then raise exception 'Namnet ska vara 1–20 tecken'; end if;
   if p_action='find' then
    select * into r from yatzy_private.rooms where status='waiting' and mode='online' and touched>clock_timestamp()-interval '30 seconds' order by touched limit 1 for update;
   elsif p_action='join' then
    select * into r from yatzy_private.rooms where code=upper(trim(p_payload->>'code')) and mode='private' and status='waiting' and touched>clock_timestamp()-interval '24 hours' for update;
    if not found then raise exception 'Rummet hittades inte eller är fullt'; end if;
   end if;
   if r.id is null then
    loop
     begin
      insert into yatzy_private.rooms(code,mode,hashes,names) values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,5)),case when p_action='find' then 'online' else 'private' end,array[h],array[name]) returning * into r;
      exit;
     exception when unique_violation then null; end;
    end loop;
   else
    update yatzy_private.rooms set hashes=array_append(hashes,h),names=array_append(names,name),status='playing',version=version+1,touched=clock_timestamp() where id=r.id returning * into r;
   end if;
  end if;
 else
  select * into r from yatzy_private.rooms where id=p_room for update;
  if not found then raise exception 'Rummet finns inte längre'; end if;
 end if;
 seat:=array_position(r.hashes,h)-1;
 if seat is null then raise exception 'Ogiltig spelarnyckel'; end if;
 if r.touched<clock_timestamp()-interval '24 hours' then raise exception 'Rummet har gått ut'; end if;
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
    for n in 1..5 loop if not r.held[n] then r.dice[n]:=floor(random()*6)::integer+1; end if; end loop;
    r.rolls:=r.rolls+1;
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
    r.turn:=1-seat; r.rolls:=0; r.dice:=array[1,1,1,1,1]; r.held:=array[false,false,false,false,false];
    if (select count(*) from jsonb_object_keys(r.cards->0))=15 and (select count(*) from jsonb_object_keys(r.cards->1))=15 then
     r.status:='finished'; a:=yatzy_private.total(r.cards->0); b:=yatzy_private.total(r.cards->1);
     r.winner:=case when a>b then 0 when b>a then 1 else null end;
    end if;
   end if;
  end if;
  update yatzy_private.rooms set status=r.status,turn=r.turn,dice=r.dice,held=r.held,rolls=r.rolls,cards=r.cards,winner=r.winner,version=version+1,touched=clock_timestamp() where id=r.id returning * into r;
 elsif p_action='get' then
  update yatzy_private.rooms set touched=clock_timestamp() where id=r.id;
 elsif p_action not in ('create','find','join') then raise exception 'Okänd åtgärd'; end if;
 if p_action<>'get' then
  foreach h in array r.hashes loop
   perform realtime.send(jsonb_build_object('version',r.version),'room_changed','yatzy:'||r.id::text||':'||h,true);
  end loop;
 end if;
 return (to_jsonb(r)-'hashes'-'touched')||jsonb_build_object('seat',seat);
end $$;
revoke all on all functions in schema yatzy_private from public;
grant execute on function yatzy_private.channel_allowed(text),yatzy_private.command(text,text,uuid,jsonb) to anon,authenticated;
create function public.yatzy_command(p_action text,p_token text,p_room uuid default null,p_payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select yatzy_private.command(p_action,p_token,p_room,p_payload) $$;
revoke all on function public.yatzy_command(text,text,uuid,jsonb) from public;
grant execute on function public.yatzy_command(text,text,uuid,jsonb) to anon,authenticated;
