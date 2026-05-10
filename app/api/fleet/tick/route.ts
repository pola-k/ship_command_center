import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { FUEL_TONS_PER_SIM_STEP, NAVIGABLE_WATER_LATLNG } from "@/lib/fleetConfig";
import { parsePoint } from "@/lib/geo";
import { advanceLatLng, mpsFromKnots } from "@/lib/kinematics";
import { pointInPolygon } from "@/lib/waterRouting";

const RING = NAVIGABLE_WATER_LATLNG as [number, number][];

type RouteBrief = {
  ship_id: string;
  is_valid: boolean;
  fuel_estimate_tons: number;
};

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

  const { data: routeRows } = await supabase
    .from("routes")
    .select("ship_id,is_valid,fuel_estimate_tons,created_at")
    .order("created_at", { ascending: false })
    .limit(600);

  const routeByShip = new Map<string, RouteBrief>();
  for (const r of routeRows ?? []) {
    const sid = r.ship_id as string;
    if (!routeByShip.has(sid)) {
      routeByShip.set(sid, {
        ship_id: sid,
        is_valid: Boolean(r.is_valid),
        fuel_estimate_tons: Number(r.fuel_estimate_tons),
      });
    }
  }

  let updated = 0;
  for (const row of rows ?? []) {
    if (
      row.status === "stopped" ||
      row.status === "distressed" ||
      row.status === "stranded" ||
      row.status === "out_of_fuel" ||
      row.status === "arrived"
    ) {
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

    const prevFuel = Number(row.fuel_tons);
    const burn = FUEL_TONS_PER_SIM_STEP;
    const fuel = Math.max(0, prevFuel - burn);

    let nextStatus = row.status as string;
    let nextSpeed = Number(row.speed_knots) || 0;

    if (fuel <= 0 && prevFuel > 0) {
      nextStatus = "out_of_fuel";
      nextSpeed = 0;
    } else if (fuel <= 0) {
      nextStatus = "out_of_fuel";
      nextSpeed = 0;
    } else if (nextStatus === "normal" || nextStatus === "insufficient_fuel") {
      const rt = routeByShip.get(row.ship_id);
      if (
        rt?.is_valid === true &&
        Number.isFinite(rt.fuel_estimate_tons) &&
        rt.fuel_estimate_tons > 0
      ) {
        if (fuel < rt.fuel_estimate_tons) nextStatus = "insufficient_fuel";
        else nextStatus = "normal";
      }
    }

    const { error: upErr } = await supabase
      .from("ship_state_current")
      .update({
        position: { type: "Point", coordinates: [next.lng, next.lat] },
        ts: new Date().toISOString(),
        fuel_tons: fuel,
        speed_knots: nextSpeed,
        status: nextStatus,
      })
      .eq("ship_id", row.ship_id);

    if (!upErr) updated += 1;
  }

  return NextResponse.json({ ok: true, updated, total: (rows ?? []).length });
}
