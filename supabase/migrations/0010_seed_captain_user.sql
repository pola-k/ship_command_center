-- Seed one captain user (auth + profile). Idempotent.
-- Login lands on /command-dashboard same as commanders (app routing).
-- Credentials (change after first login if you like):
--   email:    captainkhawaja@marinex.demo
--   password: captainpass1
--
-- Profile uses a real ship id so profiles_role_ship_check passes for captains.

with seed_captain as (
  select *
  from (
    values
      (
        'a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6'::uuid,
        'captainkhawaja@marinex.demo'::text,
        'Captain 1'::text,
        'captainpass1'::text,
        'MV-1'::text
      )
  ) as t(user_id, email, display_name, plain_password, captain_ship_id)
),
upsert_auth as (
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  select
    sc.user_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    sc.email,
    crypt(sc.plain_password, gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('role', 'captain', 'display_name', sc.display_name),
    now(),
    now()
  from seed_captain sc
  on conflict (id) do update
    set
      email = excluded.email,
      encrypted_password = excluded.encrypted_password,
      raw_user_meta_data =
        coalesce(auth.users.raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', 'captain'),
      raw_app_meta_data =
        coalesce(auth.users.raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('provider', 'email', 'providers', array['email']),
      email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()),
      updated_at = now()
  returning id
)
insert into public.profiles (user_id, display_name, role, captain_ship_id)
select
  sc.user_id,
  sc.display_name,
  'captain'::public.app_role,
  sc.captain_ship_id
from seed_captain sc
left join upsert_auth ua on ua.id = sc.user_id
on conflict (user_id) do update
  set
    display_name = excluded.display_name,
    role = 'captain'::public.app_role,
    captain_ship_id = excluded.captain_ship_id,
    updated_at = now();
