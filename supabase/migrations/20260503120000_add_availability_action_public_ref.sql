create extension if not exists pgcrypto;

alter table availability_actions
add column if not exists public_ref text;

create unique index if not exists availability_actions_public_ref_key
on availability_actions (public_ref)
where public_ref is not null;

create or replace function generate_availability_action_public_ref()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate :=
      'clm_' ||
      replace(
        replace(
          replace(encode(gen_random_bytes(24), 'base64'), '+', '-'),
          '/',
          '_'
        ),
        '=',
        ''
      );

    exit when not exists (
      select 1
      from availability_actions
      where public_ref = candidate
    );
  end loop;

  return candidate;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select id
    from availability_actions
    where public_ref is null
  loop
    loop
      begin
        update availability_actions
        set public_ref = generate_availability_action_public_ref()
        where id = r.id
          and public_ref is null;

        exit;
      exception when unique_violation then
        -- Extremely unlikely, but retry if random generation collides.
      end;
    end loop;
  end loop;
end;
$$;
