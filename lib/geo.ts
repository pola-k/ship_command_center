import wkx from "wkx";

export type LngLat = { lng: number; lat: number };

export function parsePoint(pos: unknown): LngLat | null {
  if (!pos) return null;

  const tryWkx = (buf: Buffer): LngLat | null => {
    try {
      const geom: any = wkx.Geometry.parse(buf);
      if (
        geom?.constructor?.name === "Point" &&
        Number.isFinite(geom.x) &&
        Number.isFinite(geom.y)
      ) {
        return { lng: geom.x, lat: geom.y };
      }
    } catch {
      // ignore
    }
    return null;
  };

  if (typeof pos === "object") {
    const anyPos: any = pos;
    if (anyPos.type === "Buffer" && Array.isArray(anyPos.data)) {
      const p = tryWkx(Buffer.from(anyPos.data));
      if (p) return p;
    }
    if (anyPos.type === "Point" && Array.isArray(anyPos.coordinates)) {
      const [lng, lat] = anyPos.coordinates;
      if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
    }
  }

  const s = typeof pos === "string" ? pos : (pos as any)?.toString?.();
  if (typeof s === "string") {
    const s2 = s.startsWith("\\x") ? s.slice(2) : s;

    const ewkt = s2.match(/SRID=\\d+;POINT\\(([-0-9.]+)\\s+([-0-9.]+)\\)/i);
    if (ewkt) return { lng: Number(ewkt[1]), lat: Number(ewkt[2]) };

    const m = s2.match(/POINT\\(([-0-9.]+)\\s+([-0-9.]+)\\)/i);
    if (m) return { lng: Number(m[1]), lat: Number(m[2]) };

    const hexLike = /^[0-9a-fA-F]+$/.test(s2) && s2.length > 20;
    if (hexLike) {
      const p = tryWkx(Buffer.from(s2, "hex"));
      if (p) return p;
    }
  }

  return null;
}

export function parsePolygon(poly: unknown): number[][][] | null {
  if (!poly) return null;

  const tryWkx = (buf: Buffer): number[][][] | null => {
    try {
      const geom: any = wkx.Geometry.parse(buf);
      if (geom?.constructor?.name === "Polygon") {
        const rings: number[][][] = [];
        const exterior = geom.exteriorRing?.points ?? [];
        if (exterior.length) rings.push(exterior.map((pt: any) => [pt.x, pt.y]));
        const interiors = geom.interiorRings ?? [];
        for (const r of interiors) {
          const pts = r.points ?? [];
          if (pts.length) rings.push(pts.map((pt: any) => [pt.x, pt.y]));
        }
        if (rings.length) return rings;
      }
    } catch {
      // ignore
    }
    return null;
  };

  if (typeof poly === "object") {
    const anyPoly: any = poly;
    if (anyPoly.type === "Buffer" && Array.isArray(anyPoly.data)) {
      const p = tryWkx(Buffer.from(anyPoly.data));
      if (p) return p;
    }
    if (anyPoly.type === "Polygon" && Array.isArray(anyPoly.coordinates)) {
      return anyPoly.coordinates;
    }
  }

  const s = typeof poly === "string" ? poly : (poly as any)?.toString?.();
  if (typeof s === "string") {
    const s2 = s.startsWith("\\x") ? s.slice(2) : s;

    const wkt = s2.match(/^POLYGON\\s*\\(\\((.+)\\)\\)\\s*$/i);
    if (wkt) {
      const pts = wkt[1].split(",").map((p) => p.trim());
      const ring: number[][] = [];
      for (const pt of pts) {
        const [lngS, latS] = pt.split(/\\s+/);
        const lng = Number(lngS);
        const lat = Number(latS);
        if (Number.isFinite(lng) && Number.isFinite(lat)) ring.push([lng, lat]);
      }
      if (ring.length >= 3) return [ring];
    }

    const hexLike = /^[0-9a-fA-F]+$/.test(s2) && s2.length > 20;
    if (hexLike) {
      const p = tryWkx(Buffer.from(s2, "hex"));
      if (p) return p;
    }
  }

  return null;
}

function wkxToPolygonOrMultiGeom(geom: unknown): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  try {
    const gj = (geom as { toGeoJSON?: () => GeoJSON.Geometry }).toGeoJSON?.();
    if (gj?.type === "Polygon") return gj as GeoJSON.Polygon;
    if (gj?.type === "MultiPolygon") return gj as GeoJSON.MultiPolygon;
  } catch {
    /* ignore */
  }
  return null;
}

/** Geography / geometry values from PostgREST → MapLibre Polygon or MultiPolygon coordinates. */
export function geographyToMapGeometry(
  poly: unknown
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (poly == null) return null;

  if (typeof poly === "object" && poly !== null) {
    const o = poly as Record<string, unknown>;
    if (o.type === "Buffer" && Array.isArray(o.data)) {
      try {
        const geom = wkx.Geometry.parse(Buffer.from(o.data as number[]));
        return wkxToPolygonOrMultiGeom(geom);
      } catch {
        /* ignore */
      }
    }
    if (
      (o.type === "Polygon" || o.type === "MultiPolygon") &&
      Array.isArray(o.coordinates)
    ) {
      return poly as GeoJSON.Polygon | GeoJSON.MultiPolygon;
    }
  }

  if (typeof poly === "string") {
    let t = poly.trim();
    if (t.startsWith("{")) {
      try {
        return geographyToMapGeometry(JSON.parse(t) as unknown);
      } catch {
        return null;
      }
    }
    if (t.startsWith("\\x")) t = t.slice(2);
    if (/^(SRID=\d+;)?(POLYGON|MULTIPOLYGON)\b/i.test(t)) {
      try {
        const geom = wkx.Geometry.parse(t);
        return wkxToPolygonOrMultiGeom(geom);
      } catch {
        /* ignore */
      }
    }
    const hexLike = /^[0-9a-fA-F]+$/.test(t) && t.length > 40;
    if (hexLike) {
      try {
        const geom = wkx.Geometry.parse(Buffer.from(t, "hex"));
        return wkxToPolygonOrMultiGeom(geom);
      } catch {
        /* ignore */
      }
    }
  }

  const rings = parsePolygon(poly);
  if (rings?.length) {
    return { type: "Polygon", coordinates: rings };
  }
  return null;
}

/** Parse PostGIS geography / EWKT LineString-ish payloads into lng-lat vertices. */
export function parseLineString(line: unknown): [number, number][] | null {
  if (!line) return null;

  const tryWkxLine = (buf: Buffer): [number, number][] | null => {
    try {
      const geom: any = wkx.Geometry.parse(buf);
      if (
        geom?.constructor?.name === "LineString" &&
        Array.isArray(geom.points) &&
        geom.points.length > 1
      ) {
        const coords: [number, number][] = geom.points.map((pt: any) => [Number(pt.x), Number(pt.y)]);
        if (coords.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b))) return coords;
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  if (typeof line === "object") {
    const anyLine: any = line;
    if (anyLine.type === "Buffer" && Array.isArray(anyLine.data)) {
      const p = tryWkxLine(Buffer.from(anyLine.data));
      if (p) return p;
    }
    if (anyLine.type === "LineString" && Array.isArray(anyLine.coordinates)) {
      const coords = anyLine.coordinates as unknown[];
      const out: [number, number][] = [];
      for (const xy of coords) {
        if (Array.isArray(xy) && xy.length >= 2) {
          const lng = Number(xy[0]);
          const lat = Number(xy[1]);
          if (Number.isFinite(lng) && Number.isFinite(lat)) out.push([lng, lat]);
        }
      }
      return out.length > 1 ? out : null;
    }
  }

  const s = typeof line === "string" ? line : (line as any)?.toString?.();
  if (typeof s === "string") {
    const s2 = s.startsWith("\\x") ? s.slice(2) : s;

    const ewkt = s2.match(/SRID=\d+;LINESTRING\((.+)\)/i);
    const m = ewkt ?? s2.match(/^LINESTRING\((.+)\)/i);
    if (m?.[1]) {
      const parts = m[1].split(",").map((part) => part.trim());
      const verts: [number, number][] = [];
      for (const part of parts) {
        const seg = part.split(/\s+/);
        const lng = Number(seg[0]);
        const lat = Number(seg[1]);
        if (Number.isFinite(lng) && Number.isFinite(lat)) verts.push([lng, lat]);
      }
      return verts.length > 1 ? verts : null;
    }

    const hexLike = /^[0-9a-fA-F]+$/.test(s2) && s2.length > 20;
    if (hexLike) {
      const p = tryWkxLine(Buffer.from(s2, "hex"));
      if (p) return p;
    }
  }

  return null;
}

