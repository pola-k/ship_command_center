import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

import { AO_BOUNDS, NAVIGABLE_WATER_LATLNG, fleetConfig } from "@/lib/fleetConfig";

/** Coarse tactical grid (~0.1°) per plan. */
export const ZONE_GRID_STEP_DEG = 0.1;

export type ZoneCellKey = `${number}:${number}`;

export function navigableLngLatPolygon(): Feature<Polygon> {
  const ring = NAVIGABLE_WATER_LATLNG.map(([lat, lng]): [number, number] => [lng, lat]);
  const closed =
    ring[0]?.[0] === ring[ring.length - 1]?.[0] && ring[0]?.[1] === ring[ring.length - 1]?.[1]
      ? ring
      : [...ring, ring[0]!];
  return turf.polygon([closed]);
}

function cellCorner(i: number, j: number, step: number): { west: number; south: number } {
  const boxWest = AO_BOUNDS[0][0];
  const boxSouth = AO_BOUNDS[0][1];
  return { west: boxWest + i * step, south: boxSouth + j * step };
}

export function cellKey(i: number, j: number): ZoneCellKey {
  return `${i}:${j}`;
}

export function parseCellKey(key: string): { i: number; j: number } | null {
  const [a, b] = key.split(":");
  const i = Number(a);
  const j = Number(b);
  if (!Number.isFinite(i) || !Number.isFinite(j)) return null;
  return { i, j };
}

/** Intersection of grid cell with navigable water (clipped polygon for map + commit). */
export function waterClippedCellPolygon(
  nav: Feature<Polygon>,
  i: number,
  j: number,
  step: number
): Feature<Polygon | MultiPolygon> | null {
  const { west, south } = cellCorner(i, j, step);
  const east = west + step;
  const north = south + step;
  const cell = turf.bboxPolygon([west, south, east, north]);
  const c = turf.centroid(cell);
  if (!turf.booleanPointInPolygon(c, nav)) return null;
  try {
    const inter = turf.intersect(turf.featureCollection([nav, cell]));
    return inter ?? null;
  } catch {
    return null;
  }
}

export type ClippedCellCache = Map<ZoneCellKey, Feature<Polygon | MultiPolygon> | null>;

export function getOrComputeClippedCell(
  cache: ClippedCellCache,
  nav: Feature<Polygon>,
  key: ZoneCellKey,
  step: number = ZONE_GRID_STEP_DEG
): Feature<Polygon | MultiPolygon> | null {
  if (cache.has(key)) return cache.get(key) ?? null;
  const parsed = parseCellKey(key);
  if (!parsed) {
    cache.set(key, null);
    return null;
  }
  const clipped = waterClippedCellPolygon(nav, parsed.i, parsed.j, step);
  cache.set(key, clipped);
  return clipped;
}

export function selectedCellsToFeatureCollection(
  selected: Iterable<ZoneCellKey>,
  cache: ClippedCellCache
): FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const key of selected) {
    const f = cache.get(key);
    if (!f) continue;
    features.push({ ...f, properties: { ...f.properties, cellKey: key } });
  }
  return turf.featureCollection(features);
}

/** GeoJSON geometry objects suitable for commit_restricted_zone RPC. */
export function cellGeometriesForCommit(selected: Iterable<ZoneCellKey>, cache: ClippedCellCache): GeoJSON.Geometry[] {
  const out: GeoJSON.Geometry[] = [];
  for (const key of selected) {
    const f = cache.get(key);
    if (!f?.geometry) continue;
    out.push(f.geometry);
  }
  return out;
}

export function hitTestCellKey(lng: number, lat: number, step: number = ZONE_GRID_STEP_DEG): ZoneCellKey | null {
  const boxWest = fleetConfig.boundingBox.west;
  const boxEast = fleetConfig.boundingBox.east;
  const boxSouth = fleetConfig.boundingBox.south;
  const boxNorth = fleetConfig.boundingBox.north;
  if (lng < boxWest || lng > boxEast || lat < boxSouth || lat > boxNorth) return null;
  const i = Math.floor((lng - boxWest) / step);
  const j = Math.floor((lat - boxSouth) / step);
  return cellKey(i, j);
}
