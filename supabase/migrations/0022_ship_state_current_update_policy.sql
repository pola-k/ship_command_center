-- Allow Command to update any ship live state; Captain only their assigned ship (for position/fuel sim sync).

DROP POLICY IF EXISTS ship_state_current_update_role ON public.ship_state_current;
CREATE POLICY ship_state_current_update_role ON public.ship_state_current
FOR UPDATE TO authenticated
USING (
  public.current_role() = 'command'
  OR ship_id IS NOT DISTINCT FROM public.current_captain_ship_id()
)
WITH CHECK (
  public.current_role() = 'command'
  OR ship_id IS NOT DISTINCT FROM public.current_captain_ship_id()
);
