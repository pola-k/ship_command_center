-- Let Command deactivate zones via normal PostgREST update (Hide on map).
-- Frontend uses: UPDATE restricted_zones SET is_active = false WHERE id = ...
-- Drops the blanket UPDATE denial from 0012 for authenticated users under this policy chain.

DROP POLICY IF EXISTS restricted_zones_command_update ON public.restricted_zones;
DROP POLICY IF EXISTS restricted_zones_update_block ON public.restricted_zones;

CREATE POLICY restricted_zones_command_update ON public.restricted_zones
FOR UPDATE TO authenticated
USING (public.current_role() = 'command')
WITH CHECK (public.current_role() = 'command');
