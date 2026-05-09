/**
 * Water-constrained routing: PRM + A* inside a navigable polygon (lat/lng ring from fleet.json).
 * Ring format: [lat, lng][] with first point equal to last (closed).
 */

import { greatCircleInterpolate } from "@/lib/kinematics";

export type LatLng = { lat: number; lng: number };

const EARTH_R_M = 6371000;

/** ~1.5 km between samples along geodesic chords (non-convex-safe). */
const SEG_SAMPLE_METERS = 1500;
const SEG_STEPS_MIN = 32;
const SEG_STEPS_MAX = 512;
/** Densify route legs longer than this (m) for motion/drawing fidelity. */
const ROUTE_MAX_LEG_M = 18_000;

/** Deterministic PRNG (Mulberry32). */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la = (a.lat * Math.PI) / 180;
  const lb = (b.lat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Ray casting; ring vertices are [lat, lng]; test uses x=lng, y=lat. */
export function pointInPolygon(p: LatLng, ring: [number, number][]): boolean {
  if (ring.length < 3) return false;
  const x = p.lng;
  const y = p.lat;
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = ring[i][0];
    const xi = ring[i][1];
    const yj = ring[j][0];
    const xj = ring[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-14) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * If `p` lies outside the navigable ring (e.g. bad DB seed), pull it along a chord toward an interior reference point.
 */
export function snapLatLngIntoWater(p: LatLng, ring: [number, number][]): LatLng {
  if (pointInPolygon(p, ring)) return p;
  const open =
    ring.length >= 2 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring.slice();
  if (open.length < 3) return p;
  let sumLat = 0;
  let sumLng = 0;
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const [la, ln] of open) {
    sumLat += la;
    sumLng += ln;
    minLat = Math.min(minLat, la);
    maxLat = Math.max(maxLat, la);
    minLng = Math.min(minLng, ln);
    maxLng = Math.max(maxLng, ln);
  }
  let target: LatLng = {
    lat: sumLat / open.length,
    lng: sumLng / open.length,
  };
  if (!pointInPolygon(target, ring)) {
    target = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  }
  if (!pointInPolygon(target, ring)) {
    const rng = mulberry32(0x9e3779b9);
    for (let k = 0; k < 80; k++) {
      const la = minLat + rng() * (maxLat - minLat);
      const ln = minLng + rng() * (maxLng - minLng);
      const q = { lat: la, lng: ln };
      if (pointInPolygon(q, ring)) {
        target = q;
        break;
      }
    }
  }
  if (!pointInPolygon(target, ring)) return p;

  let lo = 0;
  let hi = 1;
  let best = target;
  for (let iter = 0; iter < 26; iter++) {
    const t = (lo + hi) / 2;
    const q: LatLng = {
      lat: p.lat + t * (target.lat - p.lat),
      lng: p.lng + t * (target.lng - p.lng),
    };
    if (pointInPolygon(q, ring)) {
      best = q;
      lo = t;
    } else {
      hi = t;
    }
  }
  return best;
}

/**
 * True if the great-circle segment a→b stays inside the polygon (adaptive sample count).
 */
export function segmentInPolygon(a: LatLng, b: LatLng, ring: [number, number][]): boolean {
  const d = haversineM(a, b);
  const steps = Math.min(
    SEG_STEPS_MAX,
    Math.max(SEG_STEPS_MIN, Math.ceil(d / SEG_SAMPLE_METERS))
  );
  for (let s = 0; s <= steps; s++) {
    const p = greatCircleInterpolate(a, b, s / steps);
    if (!pointInPolygon(p, ring)) return false;
  }
  return true;
}

/** Closed rings [lat, lng][] — same convention as navigable water (`fleet.json`). */
export type ObstacleRings = [number, number][][];

export function pointInAnyObstacle(p: LatLng, obstacles: ObstacleRings): boolean {
  for (const ring of obstacles) {
    if (pointInPolygon(p, ring)) return true;
  }
  return false;
}

export function pointInNavigableFree(
  p: LatLng,
  waterRing: [number, number][],
  obstacles: ObstacleRings
): boolean {
  return pointInPolygon(p, waterRing) && !pointInAnyObstacle(p, obstacles);
}

export function segmentInNavigableFree(
  a: LatLng,
  b: LatLng,
  waterRing: [number, number][],
  obstacles: ObstacleRings
): boolean {
  if (!segmentInPolygon(a, b, waterRing)) return false;
  if (obstacles.length === 0) return true;
  const d = haversineM(a, b);
  const steps = Math.min(
    SEG_STEPS_MAX,
    Math.max(SEG_STEPS_MIN, Math.ceil(d / SEG_SAMPLE_METERS))
  );
  for (let s = 0; s <= steps; s++) {
    const p = greatCircleInterpolate(a, b, s / steps);
    if (pointInAnyObstacle(p, obstacles)) return false;
  }
  return true;
}

export function clampPointTowardPreviousFree(
  p: LatLng,
  prev: LatLng,
  waterRing: [number, number][],
  obstacles: ObstacleRings
): LatLng {
  if (pointInNavigableFree(p, waterRing, obstacles)) return p;
  let lo = 0;
  let hi = 1;
  let best = prev;
  for (let k = 0; k < 22; k++) {
    const t = (lo + hi) / 2;
    const q: LatLng = {
      lat: prev.lat + t * (p.lat - prev.lat),
      lng: prev.lng + t * (p.lng - prev.lng),
    };
    if (pointInNavigableFree(q, waterRing, obstacles)) {
      best = q;
      lo = t;
    } else {
      hi = t;
    }
  }
  return best;
}

/**
 * Snap into water, then if the point lies in a restricted zone, ease it back toward
 * `referenceSafe` (e.g. ship position) along a chord until it lies in free navigable water.
 */
export function snapLatLngIntoFreeWater(
  p: LatLng,
  waterRing: [number, number][],
  obstacles: ObstacleRings,
  referenceSafe: LatLng
): LatLng {
  let q = snapLatLngIntoWater(p, waterRing);
  if (obstacles.length === 0 || pointInNavigableFree(q, waterRing, obstacles)) return q;
  let ref = referenceSafe;
  if (!pointInNavigableFree(ref, waterRing, obstacles)) {
    ref = snapLatLngIntoWater(ref, waterRing);
  }
  if (!pointInNavigableFree(ref, waterRing, obstacles)) return q;
  let lo = 0;
  let hi = 1;
  let best = ref;
  for (let k = 0; k < 22; k++) {
    const t = (lo + hi) / 2;
    const s: LatLng = {
      lat: ref.lat + t * (q.lat - ref.lat),
      lng: ref.lng + t * (q.lng - ref.lng),
    };
    if (pointInNavigableFree(s, waterRing, obstacles)) {
      best = s;
      lo = t;
    } else {
      hi = t;
    }
  }
  return best;
}

function densifyLegAlongRoute(
  a: LatLng,
  b: LatLng,
  ring: [number, number][],
  maxLegM: number,
  depth: number
): LatLng[] {
  if (depth > 18) return [b];
  const d = haversineM(a, b);
  const ok = segmentInPolygon(a, b, ring);
  if (d <= maxLegM && ok) return [b];
  const mid = greatCircleInterpolate(a, b, 0.5);
  const left = densifyLegAlongRoute(a, mid, ring, maxLegM, depth + 1);
  const right = densifyLegAlongRoute(mid, b, ring, maxLegM, depth + 1);
  return [...left, ...right.slice(1)];
}

/** Insert vertices so legs are short and geodesic-valid inside navigable water. */
export function densifyRouteCoordinates(
  coordinates: [number, number][],
  ring: [number, number][]
): [number, number][] {
  if (coordinates.length < 2) return coordinates;
  const pts: LatLng[] = coordinates.map(([lng, lat]) => ({ lat, lng }));
  const out: LatLng[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const chunk = densifyLegAlongRoute(
      out[out.length - 1],
      pts[i + 1],
      ring,
      ROUTE_MAX_LEG_M,
      0
    );
    for (const p of chunk) out.push(p);
  }
  return out.map((p) => [p.lng, p.lat]);
}

function ringBBox(ring: [number, number][]) {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const [lat, lng] of ring) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  return { minLat, maxLat, minLng, maxLng };
}

function sampleFreeConfigs(
  ring: [number, number][],
  count: number,
  seed: number
): LatLng[] {
  const rng = mulberry32(seed);
  const { minLat, maxLat, minLng, maxLng } = ringBBox(ring);
  const nodes: LatLng[] = [];
  let guard = 0;
  const maxAttempts = count * 80;
  while (nodes.length < count && guard < maxAttempts) {
    guard++;
    const lat = minLat + rng() * (maxLat - minLat);
    const lng = minLng + rng() * (maxLng - minLng);
    const p = { lat, lng };
    if (pointInPolygon(p, ring)) nodes.push(p);
  }
  return nodes;
}

export function buildKnnEdges(
  nodes: LatLng[],
  ring: [number, number][],
  k: number,
  maxEdgeM: number
): Array<Array<{ j: number; w: number }>> {
  const n = nodes.length;
  const adj: Array<Array<{ j: number; w: number }>> = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    const dists: { j: number; d: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = haversineM(nodes[i], nodes[j]);
      if (d <= maxEdgeM) dists.push({ j, d });
    }
    dists.sort((a, b) => a.d - b.d);
    const take = dists.slice(0, k);
    for (const { j, d } of take) {
      if (!segmentInPolygon(nodes[i], nodes[j], ring)) continue;
      adj[i].push({ j, w: d });
    }
  }

  for (let i = 0; i < n; i++) {
    for (const e of adj[i]) {
      if (!adj[e.j].some((x) => x.j === i)) {
        adj[e.j].push({ j: i, w: e.w });
      }
    }
  }

  return adj;
}

type MinHeapItem = { f: number; i: number };

function heapPush(h: MinHeapItem[], x: MinHeapItem) {
  h.push(x);
  let c = h.length - 1;
  while (c > 0) {
    const p = (c - 1) >> 1;
    if (h[p].f <= h[c].f) break;
    [h[p], h[c]] = [h[c], h[p]];
    c = p;
  }
}

function heapPop(h: MinHeapItem[]): MinHeapItem | undefined {
  if (h.length === 0) return undefined;
  const top = h[0];
  const last = h.pop()!;
  if (h.length === 0) return top;
  h[0] = last;
  let i = 0;
  for (;;) {
    const l = i * 2 + 1;
    const r = l + 1;
    let m = i;
    if (l < h.length && h[l].f < h[m].f) m = l;
    if (r < h.length && h[r].f < h[m].f) m = r;
    if (m === i) break;
    [h[i], h[m]] = [h[m], h[i]];
    i = m;
  }
  return top;
}

/** If `p` is outside the polygon, pull it back toward `prev` (usually inside) until inside. */
export function clampPointTowardPreviousInside(
  p: LatLng,
  prev: LatLng,
  ring: [number, number][]
): LatLng {
  if (pointInPolygon(p, ring)) return p;
  let lo = 0;
  let hi = 1;
  let best = prev;
  for (let k = 0; k < 18; k++) {
    const t = (lo + hi) / 2;
    const q: LatLng = {
      lat: prev.lat + t * (p.lat - prev.lat),
      lng: prev.lng + t * (p.lng - prev.lng),
    };
    if (pointInPolygon(q, ring)) {
      best = q;
      lo = t;
    } else {
      hi = t;
    }
  }
  return best;
}

function densifyClosedRing(ring: [number, number][], maxEdgeM: number): LatLng[] {
  const closed =
    ring.length >= 2 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const open = closed ? ring.slice(0, -1) : ring.slice();
  if (open.length < 3) return [];
  const out: LatLng[] = [];
  for (let i = 0; i < open.length; i++) {
    const [la0, ln0] = open[i];
    const [la1, ln1] = open[(i + 1) % open.length];
    const a: LatLng = { lat: la0, lng: ln0 };
    const b: LatLng = { lat: la1, lng: ln1 };
    const d = haversineM(a, b);
    const n = Math.max(1, Math.ceil(d / maxEdgeM));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({
        lat: a.lat + t * (b.lat - a.lat),
        lng: a.lng + t * (b.lng - a.lng),
      });
    }
  }
  return out;
}

function addUndirectedEdge(
  adj: Array<Array<{ j: number; w: number }>>,
  i: number,
  j: number,
  w: number
) {
  if (i === j || w <= 0) return;
  if (!adj[i].some((e) => e.j === j)) adj[i].push({ j, w });
  if (!adj[j].some((e) => e.j === i)) adj[j].push({ j: i, w });
}

/**
 * When PRM fails: route via the navigable polygon boundary (coastal following).
 * Graph = densified shoreline ring + start + goal with visibility edges.
 */
export function planBoundaryFallbackRouteLngLat(
  start: LatLng,
  goal: LatLng,
  ring: [number, number][]
): { ok: boolean; coordinates: [number, number][] } {
  if (!pointInPolygon(start, ring) || !pointInPolygon(goal, ring)) {
    return { ok: false, coordinates: [] };
  }

  const attempts = [55_000, 35_000, 22_000];
  for (const maxEdge of attempts) {
    const boundary = densifyClosedRing(ring, maxEdge);
    const B = boundary.length;
    if (B < 4) continue;

    const S = B;
    const G = B + 1;
    const nodes: LatLng[] = [...boundary, start, goal];
    const adj: Array<Array<{ j: number; w: number }>> = Array.from(
      { length: nodes.length },
      () => []
    );

    for (let i = 0; i < B; i++) {
      const j = (i + 1) % B;
      const w = haversineM(boundary[i], boundary[j]);
      addUndirectedEdge(adj, i, j, w);
    }

    for (let i = 0; i < B; i++) {
      const wS = haversineM(start, boundary[i]);
      if (wS <= maxEdge * 2.8 && segmentInPolygon(start, boundary[i], ring)) {
        addUndirectedEdge(adj, S, i, wS);
      }
      const wG = haversineM(boundary[i], goal);
      if (wG <= maxEdge * 2.8 && segmentInPolygon(boundary[i], goal, ring)) {
        addUndirectedEdge(adj, i, G, wG);
      }
    }

    const direct = haversineM(start, goal);
    if (direct <= maxEdge * 4 && segmentInPolygon(start, goal, ring)) {
      addUndirectedEdge(adj, S, G, direct);
    }

    const pathIdx = runAStar(nodes, adj, S, G);
    if (!pathIdx) continue;

    let pts = pathIdx.map((idx) => ({ ...nodes[idx] }));
    pts[0] = { ...start };
    pts[pts.length - 1] = { ...goal };

    let smoothed = shortcutPolyline(pts, ring);
    if (!polylineFullyInPolygon(smoothed, ring)) {
      smoothed = shortcutPolyline(pts, ring);
    }
    if (!polylineFullyInPolygon(smoothed, ring)) {
      smoothed = pts;
    }
    if (!polylineFullyInPolygon(smoothed, ring)) {
      continue;
    }

    return {
      ok: true,
      coordinates: densifyRouteCoordinates(
        smoothed.map((p) => [p.lng, p.lat]),
        ring
      ),
    };
  }

  return { ok: false, coordinates: [] };
}

function runAStar(
  nodes: LatLng[],
  adj: Array<Array<{ j: number; w: number }>>,
  start: number,
  goal: number
): number[] | null {
  const n = nodes.length;
  const g = new Array<number>(n).fill(Infinity);
  const parent = new Array<number>(n).fill(-1);
  const closed = new Array<boolean>(n).fill(false);
  g[start] = 0;
  const open: MinHeapItem[] = [];
  heapPush(open, { f: haversineM(nodes[start], nodes[goal]), i: start });

  while (open.length > 0) {
    const cur = heapPop(open)!.i;
    if (cur === goal) {
      const path: number[] = [];
      let x = goal;
      while (x !== -1) {
        path.push(x);
        x = parent[x];
      }
      path.reverse();
      return path;
    }
    if (closed[cur]) continue;
    closed[cur] = true;
    for (const e of adj[cur]) {
      if (closed[e.j]) continue;
      const ng = g[cur] + e.w;
      if (ng < g[e.j]) {
        g[e.j] = ng;
        parent[e.j] = cur;
        const f = ng + haversineM(nodes[e.j], nodes[goal]);
        heapPush(open, { f, i: e.j });
      }
    }
  }
  return null;
}

function shortcutPolyline(pts: LatLng[], ring: [number, number][]): LatLng[] {
  if (pts.length < 3) return pts;
  const out: LatLng[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !segmentInPolygon(pts[i], pts[j], ring)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

function polylineFullyInPolygon(pts: LatLng[], ring: [number, number][]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (!segmentInPolygon(pts[i], pts[i + 1], ring)) return false;
  }
  return true;
}

/** True if every leg of a GeoJSON [lng,lat][] route stays inside navigable water. */
export function coordinatesFullyInPolygon(
  coordinates: [number, number][],
  ring: [number, number][]
): boolean {
  if (coordinates.length < 2) return true;
  const pts: LatLng[] = coordinates.map(([lng, lat]) => ({ lat, lng }));
  return polylineFullyInPolygon(pts, ring);
}

export type WaterRouteOptions = {
  sampleCount?: number;
  kNeighbors?: number;
  maxEdgeMeters?: number;
  seed?: number;
  /** When set, skip client PRM build and use this graph (e.g. from GET /api/routing/prm). */
  prebuilt?: PrebuiltPrmGraph | null;
};

export type PrmBuildParams = Required<Omit<WaterRouteOptions, "prebuilt">>;

/** Serializable PRM graph (v1 wire format for API + client hydrate). */
export type PrmGraphWireV1 = {
  v: 1;
  params: PrmBuildParams;
  /** Ring vertex count from fleet config (sanity / cache bust). */
  ringVertexCount: number;
  /** [lat, lng][] sample nodes */
  samples: [number, number][];
  /** For each sample index i, neighbor indices j (undirected graph; both directions present). */
  neighbors: number[][];
};

export type PrebuiltPrmGraph = {
  samples: LatLng[];
  adj: Array<Array<{ j: number; w: number }>>;
};

/** Default PRM params (used by client fallback and GET /api/routing/prm). */
export const DEFAULT_OPTS: PrmBuildParams = {
  sampleCount: 900,
  kNeighbors: 12,
  maxEdgeMeters: 95_000,
  seed: 42,
};

/** Deterministic PRM sample + k-NN edges inside the navigable polygon. */
export function buildPrmGraph(ring: [number, number][], o: PrmBuildParams): PrebuiltPrmGraph {
  const samples = sampleFreeConfigs(ring, o.sampleCount, o.seed);
  const adj = buildKnnEdges(samples, ring, o.kNeighbors, o.maxEdgeMeters);
  return { samples, adj };
}

export function prmGraphToWire(
  ringVertexCount: number,
  params: PrmBuildParams,
  graph: PrebuiltPrmGraph
): PrmGraphWireV1 {
  return {
    v: 1,
    ringVertexCount,
    params,
    samples: graph.samples.map((s) => [s.lat, s.lng]),
    neighbors: graph.adj.map((row) => row.map((e) => e.j)),
  };
}

export function hydratePrmGraph(wire: PrmGraphWireV1): PrebuiltPrmGraph {
  const samples: LatLng[] = wire.samples.map(([lat, lng]) => ({ lat, lng }));
  const adj: Array<Array<{ j: number; w: number }>> = wire.neighbors.map((nbrs, i) =>
    nbrs.map((j) => ({ j, w: haversineM(samples[i], samples[j]) }))
  );
  return { samples, adj };
}

type PrmCache = {
  ringRef: [number, number][];
  key: string;
  samples: LatLng[];
  adj: Array<Array<{ j: number; w: number }>>;
};

let prmCache: PrmCache | null = null;

function cacheKey(ring: [number, number][], o: PrmBuildParams): string {
  return `${ring.length}:${o.sampleCount}:${o.kNeighbors}:${o.maxEdgeMeters}:${o.seed}`;
}

function getOrBuildPrm(ring: [number, number][], o: PrmBuildParams): PrmCache {
  const key = cacheKey(ring, o);
  if (prmCache && prmCache.key === key && prmCache.ringRef === ring) return prmCache;

  const samples = sampleFreeConfigs(ring, o.sampleCount, o.seed);
  const adj = buildKnnEdges(samples, ring, o.kNeighbors, o.maxEdgeMeters);
  prmCache = { ringRef: ring, key, samples, adj };
  return prmCache;
}

function tryAStarOnPrm(
  start: LatLng,
  goal: LatLng,
  ring: [number, number][],
  samples: LatLng[],
  baseAdj: Array<Array<{ j: number; w: number }>>,
  maxEdgeMeters: number
): { ok: true; coordinates: [number, number][] } | null {
  const n = samples.length;
  const S = n;
  const G = n + 1;
  const nodes: LatLng[] = [...samples, start, goal];

  const adj: Array<Array<{ j: number; w: number }>> = baseAdj.map((row) =>
    row.map((e) => ({ ...e }))
  );
  adj.push([]);
  adj.push([]);

  for (let i = 0; i < n; i++) {
    const d = haversineM(samples[i], goal);
    if (d <= maxEdgeMeters * 1.8 && segmentInPolygon(samples[i], goal, ring)) {
      adj[i].push({ j: G, w: d });
    }
  }

  for (let i = 0; i < n; i++) {
    const d = haversineM(start, samples[i]);
    if (d <= maxEdgeMeters * 1.8 && segmentInPolygon(start, samples[i], ring)) {
      adj[S].push({ j: i, w: d });
    }
  }

  const direct = haversineM(start, goal);
  if (direct <= maxEdgeMeters * 2.5 && segmentInPolygon(start, goal, ring)) {
    adj[S].push({ j: G, w: direct });
  }

  const pathIdx = runAStar(nodes, adj, S, G);
  if (!pathIdx) return null;

  let pts = pathIdx.map((idx) => nodes[idx]);
  pts[0] = { ...start };
  pts[pts.length - 1] = { ...goal };

  let smoothed = shortcutPolyline(pts, ring);
  if (!polylineFullyInPolygon(smoothed, ring)) {
    smoothed = shortcutPolyline(pts, ring);
  }
  if (!polylineFullyInPolygon(smoothed, ring)) {
    return null;
  }

  const coordinates: [number, number][] = densifyRouteCoordinates(
    smoothed.map((p) => [p.lng, p.lat]),
    ring
  );
  return { ok: true, coordinates };
}

/**
 * Plan a route from start to goal inside the navigable polygon.
 * Returns coordinates as GeoJSON order [lng, lat][].
 */
export function planWaterRouteLngLat(
  start: LatLng,
  goal: LatLng,
  ring: [number, number][],
  options: WaterRouteOptions = {}
): { ok: boolean; coordinates: [number, number][] } {
  const { prebuilt, ...rest } = options;
  const o = { ...DEFAULT_OPTS, ...rest };

  if (!pointInPolygon(start, ring) || !pointInPolygon(goal, ring)) {
    return { ok: false, coordinates: [] };
  }

  // Shortest path in open water when the straight chord is entirely inside the polygon.
  if (segmentInPolygon(start, goal, ring)) {
    return {
      ok: true,
      coordinates: densifyRouteCoordinates(
        [
          [start.lng, start.lat],
          [goal.lng, goal.lat],
        ],
        ring
      ),
    };
  }

  if (prebuilt && prebuilt.samples.length > 0) {
    const got = tryAStarOnPrm(start, goal, ring, prebuilt.samples, prebuilt.adj, o.maxEdgeMeters);
    if (got) return got;
  } else {
    const attempts: PrmBuildParams[] = [
      o,
      { ...o, sampleCount: Math.min(2200, o.sampleCount * 2), kNeighbors: Math.max(o.kNeighbors, 16) },
      { ...o, sampleCount: 2800, kNeighbors: 20, maxEdgeMeters: 120_000 },
    ];

    for (const tryOpts of attempts) {
      const { samples, adj: baseAdj } = getOrBuildPrm(ring, tryOpts);
      const got = tryAStarOnPrm(start, goal, ring, samples, baseAdj, tryOpts.maxEdgeMeters);
      if (got) return got;
    }
  }

  const boundary = planBoundaryFallbackRouteLngLat(start, goal, ring);
  if (boundary.ok) return boundary;

  return { ok: false, coordinates: [] };
}
