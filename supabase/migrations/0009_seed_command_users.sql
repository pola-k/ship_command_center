-- Seed three command users for initial access testing.
-- This migration is idempotent and can be re-run safely.
-- pgcrypto provides crypt() / gen_salt(); ensure it exists if 0001 did not run first.
create extension if not exists pgcrypto;

with seed_users as (
  select *
  from (
    values
      (
        'a2fbc6f4-a1f0-4f13-b8fb-a29f3d95b851'::uuid,
        'aabdullahsalimm24@gmail.com'::text,
        'Commander One'::text,
        'qwertypoiu'::text
      ),
      (
        '8be19ea7-2076-4f3e-a852-67f1f59471a0'::uuid,
        'sameerkhan41@gmail.com'::text,
        'Commander Two'::text,
        'qwertypoiu1'::text
      ),
      (
        '4e95c01c-3e98-4ad3-bb76-8b86f241e9d9'::uuid,
        'mahrukhrajpoot22@gmail.com'::text,
        'Commander Three'::text,
        'qwertypoiu2'::text
      )
  ) as t(user_id, email, display_name, plain_password)
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
    su.user_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    su.email,
    crypt(su.plain_password::text, gen_salt('bf'::text)),
    now(),
    '',
    '',
    '',
    '',
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('role', 'command', 'display_name', su.display_name),
    now(),
    now()
  from seed_users su
  on conflict (id) do update
    set
      email = excluded.email,
      encrypted_password = excluded.encrypted_password,
      raw_user_meta_data =
        coalesce(auth.users.raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', 'command'),
      raw_app_meta_data =
        coalesce(auth.users.raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('provider', 'email', 'providers', array['email']),
      email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()),
      updated_at = now()
  returning id
)
insert into public.profiles (user_id, display_name, role, captain_ship_id)
select
  su.user_id,
  su.display_name,
  'command'::public.app_role,
  null
from seed_users su
left join upsert_auth ua on ua.id = su.user_id
on conflict (user_id) do update
  set
    display_name = excluded.display_name,
    role = 'command'::public.app_role,
    captain_ship_id = null,
    updated_at = now();

