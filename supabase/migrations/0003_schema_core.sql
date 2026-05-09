-- Core tables: scenario config, ports, ships, user profiles

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  coordinate_format text not null default '[lat, lng]',
  units jsonb not null default '{}'::jsonb,
  bounding_box jsonb not null default '{}'::jsonb,
  navigable_water geography(Polygon, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ports (
  id text primary key,
  name text not null,
  position geography(Point, 4326) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ports_position_gix on public.ports using gist (position);

create table if not exists public.ships (
  id text primary key,
  name text not null,
  destination_port_id text null references public.ports(id) on delete set null,
  cargo_type text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text null,
  role public.app_role not null,
  captain_ship_id text null references public.ships(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_ship_check check (
    (role = 'captain' and captain_ship_id is not null)
    or
    (role = 'command' and captain_ship_id is null)
  )
);

-- updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists scenarios_set_updated_at on public.scenarios;
create trigger scenarios_set_updated_at
before update on public.scenarios
for each row execute function public.set_updated_at();

drop trigger if exists ships_set_updated_at on public.ships;
create trigger ships_set_updated_at
before update on public.ships
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

