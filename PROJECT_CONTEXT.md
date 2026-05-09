# Ship Command Center — Project Context

## Scenario (grading constraints)
- **Exactly 15 active ships**
- Simulator tick: **1 Hz or faster**
- State fanout: **≤500ms p95**
- Geofence breach alerts: **≤1s**
- Proximity warnings: **≤2km**
- Adverse weather: **+30% fuel burn**
- ≥5 concurrent watchers without drift
- Smooth motion between ticks (no teleporting)

Operational area: **Strait of Hormuz**.

## Roles
- **Command**: sees all ships, creates/edits restricted zones, sends directives, receives distress.
- **Captain**: scoped to one ship; responds `ACCEPT` or `ESCALATE_DISTRESS` (free text → AI extraction).

## Tech stack (current)
- Next.js (App Router) + TypeScript + Tailwind
- **Leaflet + React-Leaflet** for the tactical map (no tile basemap)
- Supabase (hosted Postgres + PostGIS) + Supabase Realtime

## Fleet config (`fleet.json`)
Repo file `fleet.json` contains:
- AO bounding box: north=30.5, south=22.0, east=60.0, west=47.5
- `navigableWater` polygon ring (lat/lng)
- 10 ports (`ports[]`)
- 15 starting ships (`fleet[]`)

## Database schema (Supabase migrations)
Migrations: `supabase/migrations/0001_...` through `0008_seed_fleet.sql`.

Key tables:
- `scenarios`: AO bounds + navigable polygon (PostGIS geography)
- `ports`: `position` geography(Point,4326)
- `ships`
- `ship_state_current`: authoritative live ship state (position geography(Point,4326), speed, heading, fuel, status)
- `ship_state_history` (playback buckets)
- `routes` (path waypoints + line)
- `restricted_zones` + `restricted_zone_targets`
- `directives` + `directive_responses`
- `alerts` + `alert_acknowledgements`
- `directive_suggestions`
- `weather_observations`

RLS: **not enabled yet** (deferred).

## Dashboard map (current implementation)
Route: `/dashboard` (`app/dashboard/page.tsx`)

Renderer: **Leaflet (no tiles)**. The map is a custom tactical plot:
- **Dark background** (`.leaflet-container` background in `app/globals.css`)
- **Blocked/land mask**: AO rectangle with a hole for the navigable-water polygon
- **Blocked area hatch**: SVG `<pattern id="blockedHatch">` injected into Leaflet SVG overlay
- **Navigable-water overlay**: cyan outline + subtle fill
- **Ports**: SVG icon markers + **permanent labels**
- **Ships**: SVG ship icons rotated by heading; color-coded by status; click selects ship for HUD details
- **Restricted zones**: polygons, color-coded by severity
- **Routes**: polyline for selected ship (when present in `routes`)
- **Camera locked**: no pan/zoom/keyboard/touch; fixed “zoomed-in” view (zoom boost applied once, then locked)
- **Live updates**: subscribes to `ship_state_current` via Supabase Realtime and smooths movement between 1Hz updates

Key files:
- `app/dashboard/tactical-map.tsx`
- `app/dashboard/page.tsx`
- `app/dashboard/ui/client-dashboard.tsx` (client-only wrapper; Leaflet requires `window`)
- `lib/supabaseClient.ts`
- `lib/fleetConfig.ts`
- `lib/geo.ts` (EWKB/WKT geometry decoding)

Env vars:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Next steps
- Command UI for drawing/editing restricted zones (and ship targeting)
- Simulator tick + routing + alerts pipeline
- Playback timeline backed by `ship_state_history`
- Add RLS for Command vs Captain

