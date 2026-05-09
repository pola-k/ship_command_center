-- Domain enums (kept in public schema for simplicity)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('command', 'captain');
  end if;

  if not exists (select 1 from pg_type where typname = 'ship_status') then
    create type public.ship_status as enum (
      'normal',
      'rerouting',
      'distressed',
      'stopped',
      'stranded',
      'insufficient_fuel',
      'arrived',
      'out_of_fuel'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'directive_type') then
    create type public.directive_type as enum (
      'reroute_port',
      'divert_waypoint',
      'hold_position',
      'resume',
      'custom'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'directive_status') then
    create type public.directive_status as enum (
      'pending',
      'accepted',
      'escalated_distress',
      'cancelled',
      'expired'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'alert_type') then
    create type public.alert_type as enum (
      'geofence_breach',
      'proximity_warning',
      'weather_adverse',
      'stranded',
      'insufficient_fuel',
      'distress_message',
      'system'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'alert_status') then
    create type public.alert_status as enum (
      'active',
      'acknowledged',
      'resolved'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'suggestion_status') then
    create type public.suggestion_status as enum (
      'queued',
      'approved',
      'rejected',
      'expired',
      'sent'
    );
  end if;
end
$$;

