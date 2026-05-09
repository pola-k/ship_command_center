-- Captain-declared distress: insert alert + update ship status (RLS blocks direct alert INSERT).

create or replace function public.captain_declare_distress(
  p_ship_id text,
  p_reason text,
  p_message text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role;
  v_own_ship text;
  v_alert_type public.alert_type;
  v_title text;
  v_desc text;
  v_ship_status public.ship_status;
  v_reason text := lower(btrim(p_reason));
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select p.role into v_role from public.profiles p where p.user_id = v_uid;
  if v_role is distinct from 'captain' then
    raise exception 'forbidden: captain role required';
  end if;

  select p.captain_ship_id into v_own_ship from public.profiles p where p.user_id = v_uid;
  if v_own_ship is null or v_own_ship is distinct from p_ship_id then
    raise exception 'forbidden: not master of this vessel';
  end if;

  if v_reason not in ('low_fuel', 'restricted_zone', 'manual') then
    raise exception 'invalid reason';
  end if;

  if v_reason = 'manual' and btrim(p_message) = '' then
    raise exception 'manual distress requires a short message';
  end if;

  v_alert_type := case v_reason
    when 'low_fuel' then 'insufficient_fuel'::public.alert_type
    when 'restricted_zone' then 'geofence_breach'::public.alert_type
    else 'distress_message'::public.alert_type
  end;

  v_title := case v_reason
    when 'low_fuel' then 'Captain distress: low fuel'
    when 'restricted_zone' then 'Captain distress: vessel in restricted zone'
    else 'Captain declared distress'
  end;

  v_desc := case v_reason
    when 'manual' then nullif(btrim(p_message), '')
    when 'low_fuel' then
      format(
        'Master of %s reports critically low fuel (threshold from fleet rules).%s',
        p_ship_id,
        case when btrim(p_message) <> '' then ' Notes: ' || btrim(p_message) else '' end
      )
    else
      format(
        'Master of %s reports the vessel is inside an active restricted zone.%s',
        p_ship_id,
        case when btrim(p_message) <> '' then ' Notes: ' || btrim(p_message) else '' end
      )
  end;

  v_ship_status := case v_reason
    when 'low_fuel' then 'insufficient_fuel'::public.ship_status
    else 'distressed'::public.ship_status
  end;

  insert into public.alerts (
    ship_id,
    type,
    severity,
    title,
    description,
    status,
    source,
    payload
  ) values (
    p_ship_id,
    v_alert_type,
    5,
    v_title,
    v_desc,
    'active'::public.alert_status,
    'captain_bridge',
    jsonb_build_object('reason', v_reason, 'declared_by', v_uid)
  );

  update public.ship_state_current s
  set
    status = v_ship_status,
    ts = now(),
    extra = coalesce(s.extra, '{}'::jsonb) || jsonb_build_object(
      'captain_distress_reason', v_reason,
      'captain_distress_at', to_jsonb(now())
    )
  where s.ship_id = p_ship_id;

  return jsonb_build_object('ok', true, 'ship_id', p_ship_id, 'reason', v_reason);
end;
$$;

revoke all on function public.captain_declare_distress(text, text, text) from public;
grant execute on function public.captain_declare_distress(text, text, text) to authenticated;
