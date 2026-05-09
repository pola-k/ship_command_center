/** Great-circle step by heading (deg from north) and distance (meters). */

const EARTH_MEAN_R_M = 6_371_000;

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la = (a.lat * Math.PI) / 180;
  const lb = (b.lat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MEAN_R_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

function bearingDegBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (((θ * 180) / Math.PI + 360) % 360);
}

/** Point at fraction t in [0,1] along the great-circle arc from a to b. */
export function greatCircleInterpolate(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  t: number
): { lat: number; lng: number } {
  if (t <= 0) return { lat: a.lat, lng: a.lng };
  if (t >= 1) return { lat: b.lat, lng: b.lng };
  const dist = haversineMeters(a, b) * t;
  return advanceLatLng({
    lat: a.lat,
    lng: a.lng,
    headingDeg: bearingDegBetween(a, b),
    distanceM: dist,
  });
}

export function advanceLatLng({
  lat,
  lng,
  headingDeg,
  distanceM,
}: {
  lat: number;
  lng: number;
  headingDeg: number;
  distanceM: number;
}) {
  const R = 6378137;
  const brng = (headingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceM / R) +
      Math.cos(lat1) * Math.sin(distanceM / R) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(distanceM / R) * Math.cos(lat1),
      Math.cos(distanceM / R) - Math.sin(lat1) * Math.sin(lat2)
    );

  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

export function mpsFromKnots(knots: number) {
  return (knots * 1852) / 3600;
}
