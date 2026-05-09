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

