-- Seed 15 captain users (auth + profiles), one per ship MV-1 .. MV-15. Idempotent.
--
-- Row 1: Captain Khawaja (existing stable UUID) -> MV-1
-- Rows 2-15: captain.mv2 .. captain.mv15 -> MV-2 .. MV-15
--
-- Credentials (dev — change in production):
--   captainkhawaja@marinex.demo / captainpass1  (MV-1)
--   captain.mv{N}@marinex.demo / captainpass1    (MV-2 .. MV-15)
--
-- Run via Supabase SQL editor or: npx supabase db push

with seed_captains as (
  select *
  from (
    values
      ('a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6'::uuid, 'captainkhawaja@marinex.demo'::text, 'Captain Khawaja'::text, 'captainpass1'::text, 'MV-1'::text),
      ('a1b2c3d4-0002-47a8-b9c0-000000000002'::uuid, 'captain.mv2@marinex.demo'::text, 'Captain MV-2'::text, 'captainpass1'::text, 'MV-2'::text),
      ('a1b2c3d4-0003-47a8-b9c0-000000000003'::uuid, 'captain.mv3@marinex.demo'::text, 'Captain MV-3'::text, 'captainpass1'::text, 'MV-3'::text),
      ('a1b2c3d4-0004-47a8-b9c0-000000000004'::uuid, 'captain.mv4@marinex.demo'::text, 'Captain MV-4'::text, 'captainpass1'::text, 'MV-4'::text),
      ('a1b2c3d4-0005-47a8-b9c0-000000000005'::uuid, 'captain.mv5@marinex.demo'::text, 'Captain MV-5'::text, 'captainpass1'::text, 'MV-5'::text),
      ('a1b2c3d4-0006-47a8-b9c0-000000000006'::uuid, 'captain.mv6@marinex.demo'::text, 'Captain MV-6'::text, 'captainpass1'::text, 'MV-6'::text),
      ('a1b2c3d4-0007-47a8-b9c0-000000000007'::uuid, 'captain.mv7@marinex.demo'::text, 'Captain MV-7'::text, 'captainpass1'::text, 'MV-7'::text),
      ('a1b2c3d4-0008-47a8-b9c0-000000000008'::uuid, 'captain.mv8@marinex.demo'::text, 'Captain MV-8'::text, 'captainpass1'::text, 'MV-8'::text),
      ('a1b2c3d4-0009-47a8-b9c0-000000000009'::uuid, 'captain.mv9@marinex.demo'::text, 'Captain MV-9'::text, 'captainpass1'::text, 'MV-9'::text),
      ('a1b2c3d4-0010-47a8-b9c0-000000000010'::uuid, 'captain.mv10@marinex.demo'::text, 'Captain MV-10'::text, 'captainpass1'::text, 'MV-10'::text),
      ('a1b2c3d4-0011-47a8-b9c0-000000000011'::uuid, 'captain.mv11@marinex.demo'::text, 'Captain MV-11'::text, 'captainpass1'::text, 'MV-11'::text),
      ('a1b2c3d4-0012-47a8-b9c0-000000000012'::uuid, 'captain.mv12@marinex.demo'::text, 'Captain MV-12'::text, 'captainpass1'::text, 'MV-12'::text),
      ('a1b2c3d4-0013-47a8-b9c0-000000000013'::uuid, 'captain.mv13@marinex.demo'::text, 'Captain MV-13'::text, 'captainpass1'::text, 'MV-13'::text),
      ('a1b2c3d4-0014-47a8-b9c0-000000000014'::uuid, 'captain.mv14@marinex.demo'::text, 'Captain MV-14'::text, 'captainpass1'::text, 'MV-14'::text),
      ('a1b2c3d4-0015-47a8-b9c0-000000000015'::uuid, 'captain.mv15@marinex.demo'::text, 'Captain MV-15'::text, 'captainpass1'::text, 'MV-15'::text)
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
  from seed_captains sc
  on conflict (id) do update
    set
      email = excluded.email,
      encrypted_password = excluded.encrypted_password,
      raw_user_meta_data =
        coalesce(auth.users.raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object(
          'role', 'captain',
          'display_name', excluded.raw_user_meta_data->>'display_name'
        ),
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
from seed_captains sc
left join upsert_auth ua on ua.id = sc.user_id
on conflict (user_id) do update
  set
    display_name = excluded.display_name,
    role = 'captain'::public.app_role,
    captain_ship_id = excluded.captain_ship_id,
    updated_at = now();
