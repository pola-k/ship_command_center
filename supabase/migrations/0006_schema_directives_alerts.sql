-- Directives, directive responses, alerts, and suggestions queue

create table if not exists public.directives (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid null references public.profiles(user_id) on delete set null,
  ship_id text not null references public.ships(id) on delete cascade,
  type public.directive_type not null,
  payload jsonb not null,
  status public.directive_status not null default 'pending',
  expires_at timestamptz null
);

create index if not exists directives_ship_created_idx on public.directives (ship_id, created_at desc);
create index if not exists directives_status_created_idx on public.directives (status, created_at desc);

create table if not exists public.directive_responses (
  id uuid primary key default gen_random_uuid(),
  directive_id uuid not null references public.directives(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid null references public.profiles(user_id) on delete set null,
  action text not null check (action in ('ACCEPT', 'ESCALATE_DISTRESS')),
  message text null,
  ai_extraction jsonb null,
  ai_severity int null
);

create index if not exists directive_responses_directive_created_idx on public.directive_responses (directive_id, created_at desc);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ship_id text null references public.ships(id) on delete cascade,
  type public.alert_type not null,
  severity int not null check (severity >= 1 and severity <= 5),
  title text not null,
  description text null,
  status public.alert_status not null default 'active',
  source text not null,
  related_zone_id uuid null references public.restricted_zones(id) on delete set null,
  related_ship_id text null references public.ships(id) on delete set null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists alerts_status_severity_created_idx on public.alerts (status, severity desc, created_at desc);
create index if not exists alerts_ship_status_idx on public.alerts (ship_id, status);

create table if not exists public.alert_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.alerts(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  ack_at timestamptz not null default now(),
  note text null
);

create index if not exists alert_ack_alert_idx on public.alert_acknowledgements (alert_id, ack_at desc);

create table if not exists public.directive_suggestions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ship_id text not null references public.ships(id) on delete cascade,
  reason text not null,
  suggested_directive_type public.directive_type not null,
  suggested_payload jsonb not null,
  status public.suggestion_status not null default 'queued',
  approved_by uuid null references public.profiles(user_id) on delete set null,
  approved_at timestamptz null,
  sent_directive_id uuid null references public.directives(id) on delete set null
);

create index if not exists directive_suggestions_status_created_idx on public.directive_suggestions (status, created_at desc);
create index if not exists directive_suggestions_ship_created_idx on public.directive_suggestions (ship_id, created_at desc);

