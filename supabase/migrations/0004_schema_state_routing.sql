-- Live state, playback history, and routing

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  ship_id text not null references public.ships(id) on delete cascade,
  created_at timestamptz not null default now(),
  reason text not null,
  from_position geography(Point, 4326) not null,
  to_port_id text null references public.ports(id) on delete set null,
  to_position geography(Point, 4326) null,
  path_line geography(LineString, 4326) not null,
  path_waypoints jsonb not null,
  distance_m double precision not null,
  fuel_estimate_tons double precision not null,
  weather_cost_multiplier real not null default 1.0,
  is_valid boolean not null default true,
  invalid_reason text null
);

create index if not exists routes_ship_created_idx on public.routes (ship_id, created_at desc);
create index if not exists routes_path_line_gix on public.routes using gist (path_line);

create table if not exists public.ship_state_current (
  ship_id text primary key references public.ships(id) on delete cascade,
  ts timestamptz not null,
  position geography(Point, 4326) not null,
  speed_knots real not null,
  heading_deg real not null,
  fuel_tons real not null,
  status public.ship_status not null,
  active_route_id uuid null references public.routes(id) on delete set null,
  eta timestamptz null,
  extra jsonb not null default '{}'::jsonb,
  constraint ship_state_heading_check check (heading_deg >= 0 and heading_deg < 360),
  constraint ship_state_speed_check check (speed_knots >= 0),
  constraint ship_state_fuel_check check (fuel_tons >= 0)
);

create index if not exists ship_state_current_ts_idx on public.ship_state_current (ts desc);
create index if not exists ship_state_current_position_gix on public.ship_state_current using gist (position);

create table if not exists public.ship_state_history (
  id bigserial primary key,
  bucket_ts timestamptz not null,
  ship_id text not null references public.ships(id) on delete cascade,
  position geography(Point, 4326) not null,
  speed_knots real not null,
  heading_deg real not null,
  fuel_tons real not null,
  status public.ship_status not null,
  route_id uuid null references public.routes(id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  constraint ship_state_history_heading_check check (heading_deg >= 0 and heading_deg < 360),
  constraint ship_state_history_speed_check check (speed_knots >= 0),
  constraint ship_state_history_fuel_check check (fuel_tons >= 0),
  constraint ship_state_history_unique unique (ship_id, bucket_ts)
);

create index if not exists ship_state_history_bucket_idx on public.ship_state_history (bucket_ts desc);
create index if not exists ship_state_history_ship_bucket_idx on public.ship_state_history (ship_id, bucket_ts desc);
create index if not exists ship_state_history_position_gix on public.ship_state_history using gist (position);

