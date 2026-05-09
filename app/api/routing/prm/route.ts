import { NextResponse } from "next/server";

import { NAVIGABLE_WATER_LATLNG } from "@/lib/fleetConfig";
import {
  buildPrmGraph,
  DEFAULT_OPTS,
  prmGraphToWire,
  type PrmGraphWireV1,
} from "@/lib/waterRouting";

let cached: PrmGraphWireV1 | null = null;

/** Deterministic PRM graph; built once per server process, same JSON every call. */
export async function GET() {
  if (cached) return NextResponse.json(cached);

  const ring = NAVIGABLE_WATER_LATLNG as [number, number][];
  const graph = buildPrmGraph(ring, DEFAULT_OPTS);
  cached = prmGraphToWire(ring.length, DEFAULT_OPTS, graph);
  return NextResponse.json(cached);
}
