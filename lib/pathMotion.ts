import { advanceLatLng, greatCircleInterpolate } from "@/lib/kinematics";
import {
  clampPointTowardPreviousInside,
  haversineM,
  pointInPolygon,
  segmentInPolygon,
  type LatLng,
} from "@/lib/waterRouting";

/** Initial bearing from `from` to `to` (degrees, 0–360, clockwise from north). */
export function initialBearingDeg(from: LatLng, to: LatLng): number {
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (((θ * 180) / Math.PI + 360) % 360);
}

/** Smallest angle between two compass bearings (degrees). */
function bearingSeparationDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function latLngFromPath(pathLngLat: [number, number][], i: number): LatLng {
  const [lng, lat] = pathLngLat[i];
  return { lat, lng };
}

/** Closest point on segment a–b to p; t in [0,1] along chord in lat/lng (fine for short legs). */
function closestOnSegmentChord(a: LatLng, b: LatLng, p: LatLng): { q: LatLng; t: number } {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return { q: { ...a }, t: 0 };
  let t = ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return {
    q: { lat: a.lat + t * dy, lng: a.lng + t * dx },
    t,
  };
}

/** Cumulative distance from path start to each vertex; `cum[0]=0`, length = pathLngLat.length. */
export function vertexCumulativeMeters(pathLngLat: [number, number][]): number[] {
  const cum: number[] = [0];
  for (let i = 0; i < pathLngLat.length - 1; i++) {
    const d = haversineM(latLngFromPath(pathLngLat, i), latLngFromPath(pathLngLat, i + 1));
    cum.push(cum[cum.length - 1] + d);
  }
  return cum;
}

export function projectAlongPolylineMeters(
  pathLngLat: [number, number][],
  p: LatLng
): { along: number; bearingDeg: number } {
  if (pathLngLat.length < 2) return { along: 0, bearingDeg: 0 };
  const cum = vertexCumulativeMeters(pathLngLat);
  let bestAlong = 0;
  let bestD = Infinity;
  let bestBear = 0;
  for (let i = 0; i < pathLngLat.length - 1; i++) {
    const a = latLngFromPath(pathLngLat, i);
    const b = latLngFromPath(pathLngLat, i + 1);
    const { q, t } = closestOnSegmentChord(a, b, p);
    const d = haversineM(p, q);
    const segLen = cum[i + 1] - cum[i];
    const along = cum[i] + t * segLen;
    if (d < bestD) {
      bestD = d;
      bestAlong = along;
      bestBear = initialBearingDeg(a, b);
    }
  }
  return { along: bestAlong, bearingDeg: bestBear };
}

export function stepAlongPolylineLngLat(
  pathLngLat: [number, number][],
  along: number,
  deltaM: number
): { along: number; position: LatLng; bearingDeg: number; ended: boolean } {
  if (pathLngLat.length < 2) {
    const p = latLngFromPath(pathLngLat, 0);
    return { along: 0, position: p, bearingDeg: 0, ended: true };
  }
  const cum = vertexCumulativeMeters(pathLngLat);
  const total = cum[cum.length - 1];
  const target = along + deltaM;
  if (target >= total - 1e-6) {
    const last = latLngFromPath(pathLngLat, pathLngLat.length - 1);
    const prev = latLngFromPath(pathLngLat, pathLngLat.length - 2);
    return {
      along: total,
      position: last,
      bearingDeg: initialBearingDeg(prev, last),
      ended: true,
    };
  }
  let i = 0;
  while (i < cum.length - 1 && cum[i + 1] < target) i++;
  const a = latLngFromPath(pathLngLat, i);
  const b = latLngFromPath(pathLngLat, i + 1);
  const segLen = cum[i + 1] - cum[i];
  const frac = segLen > 1e-9 ? (target - cum[i]) / segLen : 1;
  const position = greatCircleInterpolate(a, b, Math.max(0, Math.min(1, frac)));
  return {
    along: target,
    position,
    bearingDeg: initialBearingDeg(a, b),
    ended: false,
  };
}

/**
 * Advance along a polyline in small chunks so we do not jump across land in one frame;
 * clamps each sub-step to stay inside `ring`.
 */
export function stepAlongPolylineInWater(
  pathLngLat: [number, number][],
  along: number,
  deltaM: number,
  ring: [number, number][],
  lastInside: LatLng
): { along: number; position: LatLng; bearingDeg: number; ended: boolean } {
  if (deltaM <= 1e-9) {
    const cur = stepAlongPolylineLngLat(pathLngLat, along, 0);
    const position = pointInPolygon(cur.position, ring)
      ? cur.position
      : clampPointTowardPreviousInside(cur.position, lastInside, ring);
    return { ...cur, position };
  }
  const n = Math.max(1, Math.ceil(deltaM / 80));
  const stepM = deltaM / n;
  let a = along;
  let prev = { ...lastInside };
  let bearingDeg = 0;
  let ended = false;
  for (let k = 0; k < n; k++) {
    const step = stepAlongPolylineLngLat(pathLngLat, a, stepM);
    a = step.along;
    bearingDeg = step.bearingDeg;
    ended = step.ended;
    let q = step.position;
    if (!pointInPolygon(q, ring)) {
      q = clampPointTowardPreviousInside(q, prev, ring);
    }
    prev = q;
    if (ended) break;
  }
  return { along: a, position: prev, bearingDeg, ended };
}

const STEER_CHUNK_M = 380;

/**
 * Among all integer headings, pick the leg of length `legM` that ends in water and minimizes
 * distance to `dest` (tie-break: closer to great-circle bearing to `dest`).
 */
function findBestLegalHeadingLeg(
  prev: LatLng,
  dest: LatLng,
  legM: number,
  ring: [number, number][]
): { position: LatLng; bearingDeg: number } | null {
  if (legM <= 1e-9) return null;
  const distToDest = haversineM(prev, dest);
  if (distToDest <= Math.max(legM * 1.02, 5) && pointInPolygon(dest, ring)) {
    return {
      position: { lat: dest.lat, lng: dest.lng },
      bearingDeg: initialBearingDeg(prev, dest),
    };
  }
  const goalBear = initialBearingDeg(prev, dest);
  let best: { position: LatLng; bearingDeg: number; distAfter: number } | null = null;
  for (let hdg = 0; hdg < 360; hdg++) {
    const next = advanceLatLng({
      lat: prev.lat,
      lng: prev.lng,
      headingDeg: hdg,
      distanceM: legM,
    });
    const q: LatLng = { lat: next.lat, lng: next.lng };
    if (!pointInPolygon(q, ring) || !segmentInPolygon(prev, q, ring)) continue;
    const distAfter = haversineM(q, dest);
    if (
      !best ||
      distAfter < best.distAfter - 1e-6 ||
      (Math.abs(distAfter - best.distAfter) <= 1e-6 &&
        bearingSeparationDeg(hdg, goalBear) < bearingSeparationDeg(best.bearingDeg, goalBear))
    ) {
      best = { position: q, bearingDeg: hdg, distAfter };
    }
  }
  if (!best) return null;
  return { position: best.position, bearingDeg: best.bearingDeg };
}

export type SteerCommitment = {
  destinationPortId: string | null;
  /** Heading held until the next chunk would cross land; then recomputed via `findBestLegalHeadingLeg`. */
  committedBearingDeg: number | null;
};

/**
 * Move up to `travelM` toward `dest` in water. Reuses `commit.committedBearingDeg` for each chunk
 * until that heading is blocked; then searches all headings and commits to the one that minimizes
 * distance to the goal. Repeats within the same frame until `travelM` is spent.
 */
export function steerTowardPortWithCommitment(
  prev: LatLng,
  dest: LatLng,
  travelM: number,
  ring: [number, number][],
  commit: SteerCommitment
): { position: LatLng; bearingDeg: number; arrived: boolean } {
  if (travelM <= 1e-9) {
    const h = commit.committedBearingDeg ?? initialBearingDeg(prev, dest);
    return { position: { ...prev }, bearingDeg: h, arrived: false };
  }

  const dist0 = haversineM(prev, dest);
  if (dist0 <= Math.max(travelM * 1.02, 5) && pointInPolygon(dest, ring)) {
    commit.committedBearingDeg = null;
    return {
      position: { lat: dest.lat, lng: dest.lng },
      bearingDeg: initialBearingDeg(prev, dest),
      arrived: true,
    };
  }

  let cur = { ...prev };
  let remaining = travelM;
  let displayBearing = commit.committedBearingDeg ?? initialBearingDeg(prev, dest);

  while (remaining > 0.5) {
    const leg = Math.min(remaining, STEER_CHUNK_M);

    if (commit.committedBearingDeg != null) {
      const b = commit.committedBearingDeg;
      const next = advanceLatLng({
        lat: cur.lat,
        lng: cur.lng,
        headingDeg: b,
        distanceM: leg,
      });
      const q: LatLng = { lat: next.lat, lng: next.lng };
      if (pointInPolygon(q, ring) && segmentInPolygon(cur, q, ring)) {
        if (
          haversineM(q, dest) <= Math.max(leg * 1.02, 5) &&
          pointInPolygon(dest, ring)
        ) {
          commit.committedBearingDeg = null;
          return {
            position: { lat: dest.lat, lng: dest.lng },
            bearingDeg: b,
            arrived: true,
          };
        }
        cur = q;
        remaining -= leg;
        displayBearing = b;
        continue;
      }
      commit.committedBearingDeg = null;
    }

    const found = findBestLegalHeadingLeg(cur, dest, leg, ring);
    if (!found) {
      break;
    }
    commit.committedBearingDeg = found.bearingDeg;
    displayBearing = found.bearingDeg;
    if (
      haversineM(found.position, dest) <= Math.max(leg * 1.02, 5) &&
      pointInPolygon(dest, ring)
    ) {
      commit.committedBearingDeg = null;
      return {
        position: { lat: dest.lat, lng: dest.lng },
        bearingDeg: found.bearingDeg,
        arrived: true,
      };
    }
    cur = found.position;
    remaining -= leg;
  }

  return { position: cur, bearingDeg: displayBearing, arrived: false };
}

/** Short dotted-line preview along current steer bearing, clipped to water. */
export function steerPreviewLngLat(
  from: LatLng,
  bearingDeg: number,
  dest: LatLng,
  ring: [number, number][]
): [number, number][] {
  const cap = Math.min(55_000, haversineM(from, dest) * 0.45 + 4000);
  for (let leg = cap; leg >= 600; leg *= 0.55) {
    const tip = advanceLatLng({
      lat: from.lat,
      lng: from.lng,
      headingDeg: bearingDeg,
      distanceM: leg,
    });
    const q: LatLng = { lat: tip.lat, lng: tip.lng };
    if (segmentInPolygon(from, q, ring)) {
      return [
        [from.lng, from.lat],
        [q.lng, q.lat],
      ];
    }
  }
  const micro = advanceLatLng({
    lat: from.lat,
    lng: from.lng,
    headingDeg: bearingDeg,
    distanceM: 120,
  });
  return [
    [from.lng, from.lat],
    [micro.lng, micro.lat],
  ];
}

/** Move along a constant heading in short legs, staying inside navigable water. */
export function deadReckoningInWater(
  prev: LatLng,
  headingDeg: number,
  distanceM: number,
  ring: [number, number][]
): LatLng {
  if (distanceM <= 1e-9) return prev;
  const n = Math.max(1, Math.ceil(distanceM / 70));
  const stepM = distanceM / n;
  let cur = { ...prev };
  for (let k = 0; k < n; k++) {
    let next = advanceLatLng({
      lat: cur.lat,
      lng: cur.lng,
      headingDeg,
      distanceM: stepM,
    });
    if (!pointInPolygon(next, ring)) {
      next = clampPointTowardPreviousInside(
        { lat: next.lat, lng: next.lng },
        cur,
        ring
      );
    }
    cur = { lat: next.lat, lng: next.lng };
  }
  return cur;
}
