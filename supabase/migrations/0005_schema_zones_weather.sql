-- Restricted zones + targeting and weather cache (optional but useful)

create table if not exists public.restricted_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid null references public.profiles(user_id) on delete set null,
  polygon geography(Polygon, 4326) not null,
  is_active boolean not null default true,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists restricted_zones_polygon_gix on public.restricted_zones using gist (polygon);
create index if not exists restricted_zones_active_idx on public.restricted_zones (is_active);

drop trigger if exists restricted_zones_set_updated_at on public.restricted_zones;
create trigger restricted_zones_set_updated_at
before update on public.restricted_zones
for each row execute function public.set_updated_at();

create table if not exists public.restricted_zone_targets (
  zone_id uuid not null references public.restricted_zones(id) on delete cascade,
  ship_id text not null references public.ships(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (zone_id, ship_id)
);

create table if not exists public.weather_observations (
  id bigserial primary key,
  ts timestamptz not null,
  position geography(Point, 4326) not null,
  provider text not null,
  data jsonb not null,
  is_adverse boolean not null,
  adverse_reason text null
);

create index if not exists weather_observations_ts_idx on public.weather_observations (ts desc);
create index if not exists weather_observations_position_gix on public.weather_observations using gist (position);

