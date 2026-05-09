-- Helper functions (kept even before RLS; useful for later)
create or replace function public.current_role()
returns public.app_role
language sql
stable
as $$
  select p.role
  from public.profiles p
  where p.user_id = auth.uid()
$$;

create or replace function public.current_captain_ship_id()
returns text
language sql
stable
as $$
  select p.captain_ship_id
  from public.profiles p
  where p.user_id = auth.uid()
$$;

-- Realtime publication hookup (best-effort; safe if publication not present).
do $$
declare
  pub_exists boolean;
begin
  select exists(select 1 from pg_publication where pubname = 'supabase_realtime') into pub_exists;
  if pub_exists then
    -- Use dynamic SQL so migration doesn't error if tables already added.
    execute 'alter publication supabase_realtime add table public.ship_state_current';
    execute 'alter publication supabase_realtime add table public.restricted_zones';
    execute 'alter publication supabase_realtime add table public.directives';
    execute 'alter publication supabase_realtime add table public.directive_responses';
    execute 'alter publication supabase_realtime add table public.alerts';
    execute 'alter publication supabase_realtime add table public.directive_suggestions';
  end if;
exception
  when duplicate_object then
    -- Table already in publication; ignore.
    null;
  when others then
    -- Publication behavior differs between local/hosted; ignore to keep migrations portable.
    null;
end
$$;

