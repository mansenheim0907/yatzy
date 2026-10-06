-- Energy/knockout layer for Yatzyduellen.
alter table yatzy_private.rooms
  add column if not exists energy integer[] not null default array[50,50],
  add column if not exists energy_max integer[] not null default array[50,50],
  add column if not exists knocked boolean[] not null default array[false,false],
  add column if not exists round_points integer[] default array[null::integer,null::integer],
  add column if not exists last_damage integer not null default 0,
  add column if not exists last_damaged integer,
  add column if not exists last_skip integer;

create or replace function yatzy_private.energy_after_score() returns trigger
language plpgsql set search_path='' as $$
declare
  scoring_seat integer;
  added_points integer;
  loser integer;
  damage integer;
  skipped integer;
  pass integer;
begin
  if new.cards is not distinct from old.cards then return new; end if;

  scoring_seat := case
    when new.cards->0 is distinct from old.cards->0 then 0
    when new.cards->1 is distinct from old.cards->1 then 1
    else null
  end;
  if scoring_seat is null then return new; end if;

  select value::integer into added_points
  from jsonb_each_text(new.cards->scoring_seat)
  where not (old.cards->scoring_seat ? key)
  limit 1;
  if added_points is null then return new; end if;

  new.last_damage := 0;
  new.last_damaged := null;
  new.last_skip := null;
  new.round_points[scoring_seat+1] := added_points;

  for pass in 1..2 loop
    if new.round_points[1] is not null and new.round_points[2] is not null then
      if new.round_points[1] <> new.round_points[2] then
        loser := case when new.round_points[1] < new.round_points[2] then 0 else 1 end;
        damage := abs(new.round_points[1]-new.round_points[2]);
        new.energy[loser+1] := greatest(0,new.energy[loser+1]-damage);
        new.last_damage := damage;
        new.last_damaged := loser;

        if new.energy[loser+1] = 0 then
          if new.energy_max[loser+1] <= 5 then
            new.status := 'knockout';
            new.winner := 1-loser;
            new.knocked[loser+1] := false;
          else
            new.energy_max[loser+1] := greatest(5,new.energy_max[loser+1]-5);
            new.knocked[loser+1] := true;
          end if;
        end if;
      end if;
      new.round_points := array[null::integer,null::integer];
    end if;

    exit when new.status <> 'playing';
    exit when not new.knocked[new.turn+1];

    skipped := new.turn;
    new.knocked[skipped+1] := false;
    new.energy[skipped+1] := new.energy_max[skipped+1];
    new.round_points[skipped+1] := 0;
    new.last_skip := skipped;
    new.turn := 1-skipped;
  end loop;

  return new;
end $$;

drop trigger if exists yatzy_energy_after_score on yatzy_private.rooms;
create trigger yatzy_energy_after_score
before update of cards on yatzy_private.rooms
for each row execute function yatzy_private.energy_after_score();
