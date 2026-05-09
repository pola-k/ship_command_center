-- RLS: command-wide reads vs captain-scoped alerts; inserts via SECURITY DEFINER RPC for zones/alerts.

ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_self_select ON public.profiles;
CREATE POLICY profiles_self_select ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS ports_read_authenticated ON public.ports;
ALTER TABLE IF EXISTS public.ports ENABLE ROW LEVEL SECURITY;
CREATE POLICY ports_read_authenticated ON public.ports FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS ships_read_authenticated ON public.ships;
ALTER TABLE IF EXISTS public.ships ENABLE ROW LEVEL SECURITY;
CREATE POLICY ships_read_authenticated ON public.ships FOR SELECT TO authenticated USING (true);

-- Live ship positions: Command or owning Captain (service_role bypasses for simulators).
DROP POLICY IF EXISTS ship_state_current_select_role ON public.ship_state_current;
ALTER TABLE IF EXISTS public.ship_state_current ENABLE ROW LEVEL SECURITY;
CREATE POLICY ship_state_current_select_role ON public.ship_state_current FOR SELECT TO authenticated USING (
  public.current_role() = 'command'
  OR ship_id IS NOT DISTINCT FROM public.current_captain_ship_id()
);

-- Restricted zones: read for UI; mutate only via SECURITY DEFINER functions.
DROP POLICY IF EXISTS restricted_zones_select ON public.restricted_zones;
DROP POLICY IF EXISTS restricted_zones_insert_block ON public.restricted_zones;
DROP POLICY IF EXISTS restricted_zones_update_block ON public.restricted_zones;
DROP POLICY IF EXISTS restricted_zones_delete_block ON public.restricted_zones;
ALTER TABLE IF EXISTS public.restricted_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY restricted_zones_select ON public.restricted_zones FOR SELECT TO authenticated USING (true);
CREATE POLICY restricted_zones_insert_block ON public.restricted_zones FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY restricted_zones_update_block ON public.restricted_zones FOR UPDATE TO authenticated USING (false);
CREATE POLICY restricted_zones_delete_block ON public.restricted_zones FOR DELETE TO authenticated USING (false);

-- Routes: client read-only; Command UI still sees paths for overlays.
DROP POLICY IF EXISTS routes_select ON public.routes;
DROP POLICY IF EXISTS routes_insert_block ON public.routes;
DROP POLICY IF EXISTS routes_update_block ON public.routes;
DROP POLICY IF EXISTS routes_delete_block ON public.routes;
ALTER TABLE IF EXISTS public.routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY routes_select ON public.routes FOR SELECT TO authenticated USING (true);
CREATE POLICY routes_insert_block ON public.routes FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY routes_update_block ON public.routes FOR UPDATE TO authenticated USING (false);
CREATE POLICY routes_delete_block ON public.routes FOR DELETE TO authenticated USING (false);

-- Alerts: Command sees all; Captain sees broadcasts (null ship) or assigned ship rows.
DROP POLICY IF EXISTS alerts_select_role ON public.alerts;
DROP POLICY IF EXISTS alerts_insert_block ON public.alerts;
DROP POLICY IF EXISTS alerts_update_ack ON public.alerts;
ALTER TABLE IF EXISTS public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY alerts_select_role ON public.alerts FOR SELECT TO authenticated USING (
  public.current_role() = 'command'
  OR (
    public.current_role() = 'captain'
    AND (
      ship_id IS NULL
      OR ship_id IS NOT DISTINCT FROM public.current_captain_ship_id()
    )
  )
);
CREATE POLICY alerts_insert_block ON public.alerts FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY alerts_update_ack ON public.alerts FOR UPDATE TO authenticated USING (
  public.current_role() = 'command'
  OR (
    public.current_role() = 'captain'
    AND ship_id IS NOT DISTINCT FROM public.current_captain_ship_id()
  )
)
WITH CHECK (true);

-- Acknowledgements: users insert their own; Command can browse all for situational audit.
DROP POLICY IF EXISTS alert_ack_select ON public.alert_acknowledgements;
DROP POLICY IF EXISTS alert_ack_insert ON public.alert_acknowledgements;
ALTER TABLE IF EXISTS public.alert_acknowledgements ENABLE ROW LEVEL SECURITY;
CREATE POLICY alert_ack_select ON public.alert_acknowledgements FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.current_role() = 'command'
);
CREATE POLICY alert_ack_insert ON public.alert_acknowledgements FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.alerts a
    WHERE a.id = alert_id AND (
      public.current_role() = 'command'
      OR (
        public.current_role() = 'captain'
        AND (a.ship_id IS NULL OR a.ship_id IS NOT DISTINCT FROM public.current_captain_ship_id())
      )
    )
  )
);
