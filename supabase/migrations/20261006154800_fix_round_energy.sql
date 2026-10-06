-- Make round energy resolution explicit and symmetric.
-- Damage is always based on the two category scores from the just-completed round.
create or replace function yatzy_private.energy_after_score() returns trigger
language plpgsql set search_path='' as $$
declare
  scoring_seat integer;
  added_points integer;
  p0 integer;
  p1 integer;
  loser integer;
  damage integer;
  skipped integer;
  pass integer;
begin
  if new.cards is not distinct from old.cards then return new; end if;

  if new.cards->0 is distinct from old.cards->0 then
    scoring_seat:=0;
  elsif new.cards->1 is distinct from old.cards->1 then
    scoring_seat:=1;
  else
    return new;
  end if;

  select e.value::integer into added_points
  from jsonb_each_text(new.cards->scoring_seat) e
  where not (old.cards->scoring_seat ? e.key)
  limit 1;

  if added_points is null then return new; end if;

  new.last_damage:=0;
  new.last_damaged:=null;
  new.last_skip:=null;
  new.round_points[scoring_seat+1]:=added_points;

  for pass in 1..2 loop
    p0:=new.round_points[1];
    p1:=new.round_points[2];

    if p0 is not null and p1 is not null then
      if p0<p1 then
        loser:=0;
        damage:=p1-p0;
      elsif p1<p0 then
        loser:=1;
        damage:=p0-p1;
      else
        loser:=null;
        damage:=0;
      end if;

      if loser is not null then
        new.energy[loser+1]:=greatest(0,new.energy[loser+1]-damage);
        new.last_damage:=damage;
        new.last_damaged:=loser;

        if new.energy[loser+1]=0 then
          if new.energy_max[loser+1]<=5 then
            new.status:='knockout';
            new.winner:=1-loser;
            new.knocked[loser+1]:=false;
          else
            new.energy_max[loser+1]:=greatest(5,new.energy_max[loser+1]-5);
            new.knocked[loser+1]:=true;
          end if;
        end if;
      end if;

      new.round_points:=array[null::integer,null::integer];
    end if;

    exit when new.status<>'playing';
    exit when not new.knocked[new.turn+1];

    skipped:=new.turn;
    new.knocked[skipped+1]:=false;
    new.energy[skipped+1]:=new.energy_max[skipped+1];
    new.round_points[skipped+1]:=0;
    new.last_skip:=skipped;
    new.turn:=1-skipped;
  end loop;

  return new;
end $$;
