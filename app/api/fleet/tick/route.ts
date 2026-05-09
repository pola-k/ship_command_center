import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { NAVIGABLE_WATER_LATLNG } from "@/lib/fleetConfig";
import { parsePoint } from "@/lib/geo";
import { advanceLatLng, mpsFromKnots } from "@/lib/kinematics";
import { pointInPolygon } from "@/lib/waterRouting";

const RING = NAVIGABLE_WATER_LATLNG as [number, number][];

/**
 * Optional authoritative motion tick. Call from cron with header:
 *   x-fleet-tick-secret: <FLEET_TICK_SECRET>
 * Requires SUPABASE_SERVICE_ROLE_KEY (recommended) or anon key if RLS allows updates.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-fleet-tick-secret");
  if (!secret || secret !== process.env.FLEET_TICK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Missing Supabase env" }, { status: 503 });
  }

  const supabase = createClient(url, key);
  const dt = 1; // seconds per tick

  const { data: rows, error } = await supabase
    .from("ship_state_current")
    .select("ship_id,position,speed_knots,heading_deg,status,fuel_tons");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let updated = 0;
  for (const row of rows ?? []) {
    if (row.status === "stopped" || row.status === "distressed" || row.status === "arrived") {
      continue;
    }
    const p = parsePoint(row.position);
    if (!p) continue;
    const distM = mpsFromKnots(Number(row.speed_knots) || 0) * dt;
    const next = advanceLatLng({
      lat: p.lat,
      lng: p.lng,
      headingDeg: Number(row.heading_deg) || 0,
      distanceM: distM,
    });
    if (!pointInPolygon({ lat: next.lat, lng: next.lng }, RING)) {
      continue;
    }

    const fuel = Math.max(0, Number(row.fuel_tons) - dt * 0.025);

    const { error: upErr } = await supabase
      .from("ship_state_current")
      .update({
        position: { type: "Point", coordinates: [next.lng, next.lat] },
        ts: new Date().toISOString(),
        fuel_tons: fuel,
      })
      .eq("ship_id", row.ship_id);

    if (!upErr) updated += 1;
  }

  return NextResponse.json({ ok: true, updated, total: (rows ?? []).length });
}
