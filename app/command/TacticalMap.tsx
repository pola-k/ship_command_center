"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Grid3x3,
  Info,
  Loader2,
  MapPin,
  Navigation,
  ShipWheel,
  Trash2,
  Undo2,
  Waves,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import maplibregl, { GeoJSONSource, LngLatBoundsLike, Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { AppRole } from "@/app/lib/authRole";
import { CaptainOrdersPanel } from "@/components/CaptainOrdersPanel";
import { CommandRejectionInbox } from "@/components/CommandRejectionInbox";
import { SendCaptainOrderModal } from "@/components/SendCaptainOrderModal";
import { captainDeclareDistress } from "@/app/lib/captainDistress";
import {
  createCriticalCaptainOrder,
  isShipCriticallyDistressed,
} from "@/app/lib/directiveOrders";
import {
  AO_BOUNDS,
  CAPTAIN_LOW_FUEL_DISTRESS_TONS,
  CAPTAIN_LOW_FUEL_RESET_HYSTERESIS,
  FUEL_TONS_PER_SIM_STEP,
  NAVIGABLE_WATER_LATLNG,
} from "@/lib/fleetConfig";
import { geographyToMapGeometry, parsePoint } from "@/lib/geo";
import {
  initialBearingDeg,
  steerPreviewLngLat,
  steerTowardPortWithCommitment,
  type SteerCommitment,
} from "@/lib/pathMotion";
import { mpsFromKnots } from "@/lib/kinematics";
import { supabase } from "@/lib/supabaseClient";
import { playTacticalChirp } from "@/lib/tacticalAudio";
import {
  cellGeometriesForCommit,
  getOrComputeClippedCell,
  hitTestCellKey,
  navigableLngLatPolygon,
  selectedCellsToFeatureCollection,
  type ClippedCellCache,
  ZONE_GRID_STEP_DEG,
  type ZoneCellKey,
} from "@/lib/zoneArchitect";
import {
  haversineM,
  pointInAnyObstacle,
  pointInNavigableFree,
  pointInPolygon,
  snapLatLngIntoFreeWater,
  snapLatLngIntoWater,
  type ObstacleRings,
} from "@/lib/waterRouting";

import { ShipDetailCard, type ShipDetail } from "./ui/ShipDetailCard";

type HudPanel = "fleet" | "alerts" | "ports" | null;

export type TacticalMapProps = {
  mode?: AppRole;
  captainShipId?: string | null;
  captainShipName?: string | null;
  captainDisplayName?: string | null;
  /** Logged-in user id (command) — required to send directives & review refusals. */
  commandUserId?: string | null;
  captainUserId?: string | null;
  /** Extra controls above Zone Architect (e.g. Threats launcher). */
  leadingRail?: ReactNode;
};

type ShipMetaRow = {
  id: string;
  name: string | null;
  cargo_type: string | null;
  destination_port_id: string | null;
};

type ShipStateRow = {
  ship_id: string;
  ts: string;
  position: unknown;
  speed_knots: number;
  heading_deg: number;
  fuel_tons: number | null;
  status: string;
};

type PortRow = { id: string; name: string; position: unknown };

type AlertRow = {
  id: string;
  title: string;
  severity: number;
  created_at: string;
  status: string;
  ship_id: string | null;
  type?: string | null;
};

type RouteRow = {
  id: string;
  ship_id: string;
  created_at: string;
  path_line: unknown;
  is_valid: boolean;
  distance_m: number;
  fuel_estimate_tons: number;
  weather_cost_multiplier: number;
  invalid_reason: string | null;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ringsFromRestrictedZoneFeatures(
  feats: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[]
): ObstacleRings {
  const rings: ObstacleRings = [];
  for (const f of feats) {
    const g = f.geometry;
    if (g.type === "Polygon") {
      const outer = g.coordinates[0];
      rings.push(outer.map(([lng, lat]) => [lat, lng] as [number, number]));
    } else {
      for (const poly of g.coordinates) {
        const outer = poly[0];
        rings.push(outer.map(([lng, lat]) => [lat, lng] as [number, number]));
      }
    }
  }
  return rings;
}

function formatSupabaseLikeError(err: unknown): string {
  if (err == null) return "Unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof o.message === "string" && o.message) parts.push(o.message);
    if (typeof o.details === "string" && o.details) parts.push(o.details);
    if (typeof o.hint === "string" && o.hint) parts.push(o.hint);
    if (typeof o.code === "string" && o.code) parts.unshift(`[${o.code}]`);
    if (parts.length) return parts.join(" · ");
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

type ShipFix = {
  ship_id: string;
  tsMs: number;
  lng: number;
  lat: number;
  heading_deg: number;
  speed_knots: number;
  fuel_tons: number | null;
  status: string;
};

function shipTone(status: string, speedKnots: number) {
  if (status === "distressed") return { fill: "#ef4444", stroke: "rgba(255,255,255,0.85)" };
  if (status === "insufficient_fuel" || status === "out_of_fuel")
    return { fill: "#f97316", stroke: "rgba(255,255,255,0.85)" };
  if (status === "stranded") return { fill: "#dc2626", stroke: "rgba(255,255,255,0.8)" };
  if (status === "rerouting") return { fill: "#f59e0b", stroke: "rgba(255,255,255,0.8)" };
  if (status === "stopped") return { fill: "#64748b", stroke: "rgba(255,255,255,0.55)" };
  if (speedKnots >= 15) return { fill: "#22c55e", stroke: "rgba(255,255,255,0.8)" };
  return { fill: "#38bdf8", stroke: "rgba(255,255,255,0.75)" };
}

function shipMarkerInnerHtml(headingDeg: number, fill: string, stroke: string) {
  return `
    <div style="width:34px;height:34px;transform:rotate(${headingDeg}deg);transform-origin:50% 50%;">
      <svg width="34" height="34" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <path d="M32 6 C38 14 43 24 46 36 L52 56 L32 50 L12 56 L18 36 C21 24 26 14 32 6 Z"
          fill="${fill}" stroke="${stroke}" stroke-width="2.8" stroke-linejoin="round"/>
        <path d="M32 10 L32 48" stroke="rgba(0,0,0,0.25)" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </div>`;
}

function createShipMarkerElement({
  shipId,
  headingDeg,
  status,
  speedKnots,
  yielding,
}: {
  shipId: string;
  headingDeg: number;
  status: string;
  speedKnots: number;
  yielding?: boolean;
}) {
  const tone = yielding
    ? { fill: "#475569", stroke: "rgba(255,255,255,0.5)" }
    : shipTone(status, speedKnots);
  const wrap = document.createElement("button");
  wrap.type = "button";
  wrap.setAttribute("aria-label", `Select ship ${shipId}`);
  wrap.className = "ship-dom-marker";
  wrap.style.width = "34px";
  wrap.style.height = "34px";
  wrap.style.background = "transparent";
  wrap.style.border = "none";
  wrap.style.padding = "0";
  wrap.style.cursor = "pointer";

  wrap.innerHTML = shipMarkerInnerHtml(headingDeg, tone.fill, tone.stroke);

  return {
    el: wrap,
    setHeading: (deg: number) => {
      const inner = wrap.firstElementChild as HTMLElement | null;
      if (inner) inner.style.transform = `rotate(${deg}deg)`;
    },
  };
}

function updateShipMarkerAppearance(
  wrap: HTMLElement,
  headingDeg: number,
  status: string,
  speedKnots: number,
  yielding: boolean
) {
  const tone = yielding
    ? { fill: "#475569", stroke: "rgba(255,255,255,0.5)" }
    : shipTone(status, speedKnots);
  wrap.innerHTML = shipMarkerInnerHtml(headingDeg, tone.fill, tone.stroke);
}

const bounds: LngLatBoundsLike = [
  [AO_BOUNDS[0][0], AO_BOUNDS[0][1]],
  [AO_BOUNDS[1][0], AO_BOUNDS[1][1]],
];

const PROXIMITY_IN_M = 800;
const PROXIMITY_OUT_M = 1300;
const ARB_INTERVAL_MS = 450;
const PROXIMITY_ARB_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PROXIMITY_ARB === "true";
const POSITION_SYNC_MS = 800;
const SIM_SPEED_MULTIPLIER = Math.max(
  1,
  Number.parseFloat(process.env.NEXT_PUBLIC_SIM_SPEED_MULT ?? "5000") || 5000
);

const PAIRWISE_SLOW_CLOSE_M = 700;
const PAIRWISE_SLOW_CLEAR_M = 4200;

function pairwiseProximitySpeedFactor(nearestNeighborM: number): number {
  if (nearestNeighborM >= PAIRWISE_SLOW_CLEAR_M) return 1;
  if (nearestNeighborM <= PAIRWISE_SLOW_CLOSE_M) return 0.3;
  const t =
    (nearestNeighborM - PAIRWISE_SLOW_CLOSE_M) /
    (PAIRWISE_SLOW_CLEAR_M - PAIRWISE_SLOW_CLOSE_M);
  const s = t * t * (3 - 2 * t);
  return 0.3 + 0.7 * s;
}

function pickStandOnShip(ida: string, fa: ShipFix, idb: string, fb: ShipFix): string {
  if (fa.speed_knots !== fb.speed_knots) return fa.speed_knots > fb.speed_knots ? ida : idb;
  return ida < idb ? ida : idb;
}

export default function TacticalMap({
  mode = "command",
  captainShipId = null,
  captainShipName = null,
  captainDisplayName = null,
  commandUserId = null,
  captainUserId = null,
  leadingRail = null,
}: TacticalMapProps) {
  const isCaptain = mode === "captain" && Boolean(captainShipId);
  const isCommand = mode === "command";

  const mapRef = useRef<MlMap | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapLoadedRef = useRef(false);

  const markersRef = useRef<
    Record<
      string,
      {
        marker: maplibregl.Marker;
        setHeading: (deg: number) => void;
        lastHeading: number;
        lastYielding?: boolean;
      }
    >
  >({});

  const fixesRef = useRef<Record<string, ShipFix>>({});
  const renderPosRef = useRef<Record<string, { lng: number; lat: number }>>({});
  const metaRef = useRef<Record<string, ShipMetaRow>>({});

  const simHeadingRef = useRef<Record<string, number>>({});
  const steerCommitRef = useRef<Record<string, SteerCommitment>>({});
  const lastRafMsRef = useRef<number | null>(null);
  const lastPosSyncMsRef = useRef(0);
  const lastFuelUiBumpMsRef = useRef(0);
  const yieldPartnersRef = useRef<Map<string, Set<string>>>(new Map());
  const arbitrationSavedRef = useRef<Map<string, { speed: number; status: string }>>(new Map());
  const lastArbMsRef = useRef(0);
  const restrictedZoneRingsRef = useRef<ObstacleRings>([]);
  const captainAutoDistressRef = useRef({ fuel: false, zone: false });

  const clippedCellCacheRef = useRef<ClippedCellCache>(new Map());
  const navPolygonRef = useRef(navigableLngLatPolygon());
  const selectedZoneCellsRef = useRef<Set<ZoneCellKey>>(new Set());
  const routesRef = useRef<Record<string, RouteRow>>({});
  const zonePaintActiveRef = useRef(false);

  const [ports, setPorts] = useState<PortRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  const [selectedShipId, setSelectedShipId] = useState<string | null>(null);
  const [hudPanel, setHudPanel] = useState<HudPanel>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [sendOrderOpen, setSendOrderOpen] = useState(false);
  const [hoverCard, setHoverCard] = useState<{
    x: number;
    y: number;
    shipId: string;
    speed: number;
    status: string;
  } | null>(null);

  const [dataState, setDataState] = useState<"loading" | "ready" | "error">("loading");
  const [detailTick, setDetailTick] = useState(0);
  const [zoneMode, setZoneMode] = useState(false);
  const [zoneErase, setZoneErase] = useState(false);
  const [selectionEpoch, setSelectionEpoch] = useState(0);
  const [selectionCount, setSelectionCount] = useState(0);
  const [routesEpoch, setRoutesEpoch] = useState(0);
  const [zoneCommitBusy, setZoneCommitBusy] = useState(false);
  const [zoneDeactivateBusyId, setZoneDeactivateBusyId] = useState<string | null>(null);
  const [zoneToast, setZoneToast] = useState<string | null>(null);
  const [committedZoneRows, setCommittedZoneRows] = useState<{ id: string; name: string }[]>([]);
  const [captainDistressDraft, setCaptainDistressDraft] = useState("");
  const [captainDistressBusy, setCaptainDistressBusy] = useState(false);

  const pulsePhaseRef = useRef(0);

  const bumpZoneSelectionPreview = useCallback(() => {
    setSelectionCount(selectedZoneCellsRef.current.size);
    setSelectionEpoch((x) => x + 1);
  }, []);

  const mergeLatestRoutes = useCallback((rows: RouteRow[]) => {
    const sorted = [...rows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const next: Record<string, RouteRow> = {};
    for (const row of sorted) {
      if (!next[row.ship_id]) next[row.ship_id] = row;
    }
    routesRef.current = next;
    setRoutesEpoch((e) => e + 1);
  }, []);

  const refreshZonesFromDb = useCallback(async () => {
    const rz = await supabase
      .from("restricted_zones")
      .select("id,name,is_active,polygon")
      .eq("is_active", true);
    if (rz.error) return;
    const rows = (rz.data ?? []) as Array<{ id: string; name: string; polygon: unknown }>;
    setCommittedZoneRows(rows.map((row) => ({ id: row.id, name: row.name })));

    const feats: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];
    for (const row of rows) {
      const geometry = geographyToMapGeometry(row.polygon);
      if (!geometry) continue;
      feats.push({
        type: "Feature",
        properties: { id: row.id, name: row.name },
        geometry,
      });
    }
    restrictedZoneRingsRef.current = ringsFromRestrictedZoneFeatures(feats);
    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: feats };
    const map = mapRef.current;
    const src = map?.getSource("restricted-zones-active") as GeoJSONSource | undefined;
    if (src) src.setData(fc);
    setDetailTick((t) => t + 1);
  }, []);

  const refreshRoutesFromDb = useCallback(async () => {
    const rr = await supabase
      .from("routes")
      .select("id,ship_id,created_at,path_line,is_valid,distance_m,fuel_estimate_tons,weather_cost_multiplier,invalid_reason")
      .order("created_at", { ascending: false })
      .limit(400);
    if (rr.error) return;
    mergeLatestRoutes((rr.data ?? []) as RouteRow[]);
  }, [mergeLatestRoutes]);

  const portById = useMemo(() => {
    const m = new Map<string, PortRow>();
    for (const p of ports) m.set(p.id, p);
    return m;
  }, [ports]);

  const hudButtons = useMemo(() => {
    const items: { key: HudPanel; label: string; icon: typeof ShipWheel }[] = [
      { key: "fleet", label: "Fleet", icon: ShipWheel },
      { key: "alerts", label: "Alerts", icon: AlertTriangle },
      { key: "ports", label: "Ports", icon: MapPin },
    ];
    if (isCaptain) return items.filter((i) => i.key !== "alerts");
    return items;
  }, [isCaptain]);

  const [fleetStatusCounts, setFleetStatusCounts] = useState({ normal: 0, warning: 0, distress: 0 });
  const [trackedShipCount, setTrackedShipCount] = useState(0);

  const selectedShipDetail: ShipDetail | null = useMemo(() => {
    if (!selectedShipId) return null;
    const fix = fixesRef.current[selectedShipId];
    const meta = metaRef.current[selectedShipId];
    if (!fix) return null;
    const destId = meta?.destination_port_id ?? null;
    const destPort = destId ? portById.get(destId) : undefined;
    const destPt = destPort ? parsePoint(destPort.position) : null;
    const ring = NAVIGABLE_WATER_LATLNG as [number, number][];
    const obstacles = restrictedZoneRingsRef.current;
    const destSnap =
      destPt && pointInPolygon({ lat: destPt.lat, lng: destPt.lng }, ring)
        ? snapLatLngIntoFreeWater(
            { lat: destPt.lat, lng: destPt.lng },
            ring,
            obstacles,
            { lat: fix.lat, lng: fix.lng }
          )
        : null;
    const route = routesRef.current[selectedShipId] ?? null;
    const alertRows = alerts.filter(
      (a) => a.status === "active" && (a.ship_id ?? null) === selectedShipId
    );
    return {
      ship_id: selectedShipId,
      name: meta?.name ?? selectedShipId,
      status: fix.status,
      speed_knots: fix.speed_knots,
      heading_deg: fix.heading_deg,
      fuel_tons: fix.fuel_tons,
      cargo_type: meta?.cargo_type ?? null,
      destination_port_id: destId,
      destination_port_name: destPort?.name ?? null,
      destination_lat: destSnap?.lat ?? destPt?.lat ?? null,
      destination_lng: destSnap?.lng ?? destPt?.lng ?? null,
      route_is_valid: route?.is_valid ?? null,
      route_distance_m: route?.distance_m ?? null,
      route_fuel_estimate_tons: route?.fuel_estimate_tons ?? null,
      route_weather_cost_multiplier: route?.weather_cost_multiplier ?? null,
      route_invalid_reason: route?.invalid_reason ?? null,
      active_alerts: alertRows.map((a) => ({
        id: a.id,
        title: a.title,
        severity: a.severity,
        type: a.type ?? null,
      })),
    };
  }, [selectedShipId, detailTick, dataState, portById, routesEpoch, alerts]);

  const ensurePortsLayer = (fc: GeoJSON.FeatureCollection<GeoJSON.Point>) => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    if (!map.getSource("ports")) {
      map.addSource("ports", { type: "geojson", data: fc });
      map.addLayer({
        id: "ports-circle",
        type: "circle",
        source: "ports",
        paint: {
          "circle-color": "#f59e0b",
          "circle-radius": 5,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#fff2cc",
        },
      });
      map.addLayer({
        id: "ports-label",
        type: "symbol",
        source: "ports",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 12,
          "text-offset": [0, 1.25],
          "text-anchor": "top",
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-optional": false,
        },
        paint: {
          "text-color": "#f8fafc",
          "text-halo-color": "#022338",
          "text-halo-width": 1.4,
        },
      });
    } else {
      const src = map.getSource("ports") as GeoJSONSource;
      src.setData(fc);
      if (map.getLayer("ports-label")) {
        map.setLayoutProperty("ports-label", "text-allow-overlap", true);
        map.setLayoutProperty("ports-label", "text-ignore-placement", true);
        map.setLayoutProperty("ports-label", "text-optional", false);
        map.setLayoutProperty("ports-label", "text-size", 12);
      }
    }
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#2d4a2f" } }],
      },
      center: [(AO_BOUNDS[0][0] + AO_BOUNDS[1][0]) / 2, (AO_BOUNDS[0][1] + AO_BOUNDS[1][1]) / 2],
      zoom: 5.6,
      minZoom: 5.2,
      maxZoom: 8.8,
      maxBounds: bounds,
      attributionControl: false,
      cooperativeGestures: true,
    });

    mapRef.current = map;

    map.on("load", () => {
      mapLoadedRef.current = true;

      const waterCoords = NAVIGABLE_WATER_LATLNG.map(([lat, lng]) => [lng, lat]);

      const west = AO_BOUNDS[0][0];
      const south = AO_BOUNDS[0][1];
      const east = AO_BOUNDS[1][0];
      const north = AO_BOUNDS[1][1];

      const hatchFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
      const step = 0.7;
      for (let lat = south - 1; lat <= north + 1; lat += step) {
        hatchFeatures.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [west - 1, lat],
              [east + 1, lat + 1.1],
            ],
          },
        });
      }
      for (let lng = west - 1; lng <= east + 1; lng += step * 1.5) {
        hatchFeatures.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [lng, south - 1],
              [lng + 1.1, north + 1],
            ],
          },
        });
      }

      map.addSource("land-hatch", {
        type: "geojson",
        data: { type: "FeatureCollection", features: hatchFeatures },
      });
      map.addLayer({
        id: "land-hatch",
        type: "line",
        source: "land-hatch",
        paint: { "line-color": "#486a41", "line-opacity": 0.22, "line-width": 1 },
      });

      map.addSource("water", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [waterCoords] },
        },
      });
      map.addLayer({
        id: "water-fill",
        type: "fill",
        source: "water",
        paint: { "fill-color": "#1a365d", "fill-opacity": 0.78 },
      });
      map.addLayer({
        id: "water-depth",
        type: "fill",
        source: "water",
        paint: { "fill-color": "#1d4b73", "fill-opacity": 0.24 },
      });
      map.addLayer({
        id: "water-outline",
        type: "line",
        source: "water",
        paint: { "line-color": "#58c7ee", "line-opacity": 0.36, "line-width": 1.5 },
      });

      map.addSource("restricted-preview", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "restricted-preview-fill",
        type: "fill",
        source: "restricted-preview",
        paint: {
          "fill-color": "#dc2626",
          "fill-opacity": 0.38,
          "fill-outline-color": "rgba(255,255,255,0.3)",
        },
      });
      map.addLayer({
        id: "restricted-preview-line",
        type: "line",
        source: "restricted-preview",
        paint: {
          "line-color": "#fca5a5",
          "line-width": 1.75,
          "line-opacity": 0.92,
          "line-blur": 0.35,
          "line-dasharray": [1.25, 1.25],
        },
      });

      map.addSource("ship-pulse", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "ship-pulse-ring",
        type: "circle",
        source: "ship-pulse",
        paint: {
          "circle-color": "#ef4444",
          "circle-opacity": 0.35,
          "circle-radius": 13,
          "circle-stroke-color": "#f87171",
          "circle-stroke-width": 1,
        },
      });

      map.addSource("all-routes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "all-routes-line",
        type: "line",
        source: "all-routes",
        paint: {
          "line-color": "#7dd3fc",
          "line-opacity": 0.45,
          "line-dasharray": [2, 3],
          "line-width": 1.5,
        },
      });

      map.addSource("selected-route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "selected-route-line",
        type: "line",
        source: "selected-route",
        paint: {
          "line-color": "#93c5fd",
          "line-opacity": 0.9,
          "line-dasharray": [2, 2],
          "line-width": 2,
        },
      });

      map.addSource("restricted-zones-active", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "restricted-zones-fill",
        type: "fill",
        source: "restricted-zones-active",
        paint: {
          "fill-color": "#dc2626",
          "fill-opacity": 0.34,
          "fill-outline-color": "rgba(255,255,255,0.35)",
        },
      });
      map.addLayer({
        id: "restricted-zones-outline",
        type: "line",
        source: "restricted-zones-active",
        paint: {
          "line-color": "#fecaca",
          "line-width": 2,
          "line-opacity": 0.88,
          "line-dasharray": [2, 2],
        },
      });

      void refreshZonesFromDb();
    });

    return () => {
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, [refreshZonesFromDb]);

  // Initial load: ships meta, ports, ship_state_current, alerts
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setDataState("loading");

        let metaQuery = supabase
          .from("ships")
          .select("id,name,cargo_type,destination_port_id");
        if (isCaptain && captainShipId) {
          metaQuery = metaQuery.eq("id", captainShipId);
        }
        const metaRes = await metaQuery;
        if (metaRes.error) throw metaRes.error;
        const metaMap: Record<string, ShipMetaRow> = {};
        for (const row of (metaRes.data ?? []) as ShipMetaRow[]) metaMap[row.id] = row;
        metaRef.current = metaMap;

        const portsRes = await supabase.from("ports").select("id,name,position");
        if (portsRes.error) throw portsRes.error;
        const portsParsed: PortRow[] = (portsRes.data ?? []) as PortRow[];
        if (cancelled) return;
        setPorts(portsParsed);

        const snapRing = NAVIGABLE_WATER_LATLNG as [number, number][];
        const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
        for (const row of portsParsed) {
          const p = parsePoint(row.position);
          if (!p) continue;
          const snapped = snapLatLngIntoWater({ lat: p.lat, lng: p.lng }, snapRing);
          features.push({
            type: "Feature",
            properties: { id: row.id, name: row.name },
            geometry: { type: "Point", coordinates: [snapped.lng, snapped.lat] },
          });
        }
        ensurePortsLayer({ type: "FeatureCollection", features });

        let shipsQuery = supabase
          .from("ship_state_current")
          .select("ship_id,ts,position,speed_knots,heading_deg,fuel_tons,status");
        if (isCaptain && captainShipId) {
          shipsQuery = shipsQuery.eq("ship_id", captainShipId);
        }
        const shipsRes = await shipsQuery;
        if (shipsRes.error) throw shipsRes.error;

        fixesRef.current = {};
        renderPosRef.current = {};

        const nowMs = Date.now();
        for (const row of (shipsRes.data ?? []) as ShipStateRow[]) {
          if (isCaptain && captainShipId && row.ship_id !== captainShipId) continue;
          const p = parsePoint(row.position);
          if (!p) continue;
          fixesRef.current[row.ship_id] = {
            ship_id: row.ship_id,
            tsMs: new Date(row.ts).getTime() || nowMs,
            lng: p.lng,
            lat: p.lat,
            heading_deg: row.heading_deg,
            speed_knots: row.speed_knots,
            fuel_tons: row.fuel_tons ?? null,
            status: row.status,
          };
          renderPosRef.current[row.ship_id] = { lng: p.lng, lat: p.lat };
        }

        if (isCaptain && captainShipId) {
          setSelectedShipId(captainShipId);
        } else {
          setSelectedShipId((prev) => {
            if (prev && fixesRef.current[prev]) return prev;
            return Object.keys(fixesRef.current)[0] ?? null;
          });
        }

        const allowedIds = new Set(Object.keys(fixesRef.current));
        for (const id of Object.keys(markersRef.current)) {
          if (!allowedIds.has(id)) {
            markersRef.current[id].marker.remove();
            delete markersRef.current[id];
          }
        }

        if (!isCaptain) {
          const alertsRes = await supabase
            .from("alerts")
            .select("id,title,severity,created_at,status,ship_id,type")
            .eq("status", "active")
            .order("severity", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(24);
          if (alertsRes.error) throw alertsRes.error;
          if (!cancelled) setAlerts((alertsRes.data ?? []) as AlertRow[]);
        } else if (captainShipId) {
          const capAlerts = await supabase
            .from("alerts")
            .select("id,title,severity,created_at,status,ship_id,type")
            .eq("status", "active")
            .eq("ship_id", captainShipId)
            .order("severity", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(24);
          if (capAlerts.error) throw capAlerts.error;
          if (!cancelled) setAlerts((capAlerts.data ?? []) as AlertRow[]);
        } else if (!cancelled) {
          setAlerts([]);
        }

        if (!cancelled) {
          await refreshRoutesFromDb();
          await refreshZonesFromDb();
        }

        if (!cancelled) {
          setTrackedShipCount(Object.keys(fixesRef.current).length);
          setDetailTick((t) => t + 1);
          setDataState("ready");
        }
      } catch {
        if (!cancelled) setDataState("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isCaptain, captainShipId, refreshRoutesFromDb, refreshZonesFromDb]);

  // Realtime ship updates
  useEffect(() => {
    const channel = supabase
      .channel("command_ship_state_current_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "ship_state_current" }, (payload) => {
        const row: Record<string, unknown> = payload.new as Record<string, unknown>;
        const sid = row.ship_id as string;
        if (isCaptain && captainShipId && sid !== captainShipId) return;
        const p = parsePoint(row.position);
        if (!p) return;
        const ringRt = NAVIGABLE_WATER_LATLNG as [number, number][];
        const snapped = snapLatLngIntoWater({ lat: p.lat, lng: p.lng }, ringRt);
        fixesRef.current[sid] = {
          ship_id: sid,
          tsMs: new Date(row.ts as string).getTime(),
          lng: snapped.lng,
          lat: snapped.lat,
          heading_deg: row.heading_deg as number,
          speed_knots: row.speed_knots as number,
          fuel_tons: (row.fuel_tons as number | null) ?? null,
          status: row.status as string,
        };
        if (isCaptain && captainShipId) {
          const allowed = new Set([captainShipId]);
          for (const id of Object.keys(fixesRef.current)) {
            if (!allowed.has(id)) {
              delete fixesRef.current[id];
              delete renderPosRef.current[id];
            }
          }
        }
        setTrackedShipCount(Object.keys(fixesRef.current).length);
        setDetailTick((t) => t + 1);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isCaptain, captainShipId]);

  useEffect(() => {
    if (!selectedShipId) setSendOrderOpen(false);
  }, [selectedShipId]);

  // Realtime alerts list refresh (command only)
  useEffect(() => {
    if (isCaptain) return;

    const channel = supabase
      .channel("command_alerts_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, async () => {
        const alertsRes = await supabase
          .from("alerts")
          .select("id,title,severity,created_at,status,ship_id,type")
          .eq("status", "active")
          .order("severity", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(24);
        if (!alertsRes.error) setAlerts((alertsRes.data ?? []) as AlertRow[]);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isCaptain]);

  useEffect(() => {
    if (!isCaptain || !captainShipId) return;

    async function loadCaptainAlerts() {
      const alertsRes = await supabase
        .from("alerts")
        .select("id,title,severity,created_at,status,ship_id,type")
        .eq("status", "active")
        .eq("ship_id", captainShipId)
        .order("severity", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(24);
      if (!alertsRes.error) setAlerts((alertsRes.data ?? []) as AlertRow[]);
    }

    void loadCaptainAlerts();

    const channel = supabase
      .channel(`captain_alerts_${captainShipId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alerts",
          filter: `ship_id=eq.${captainShipId}`,
        },
        () => {
          void loadCaptainAlerts();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isCaptain, captainShipId]);

  // Realtime overlays: committed zones + route replans for path styling
  useEffect(() => {
    const channel = supabase
      .channel("command_zones_routes_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "restricted_zones" }, () => {
        void refreshZonesFromDb();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "routes" }, () => {
        void refreshRoutesFromDb();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshRoutesFromDb, refreshZonesFromDb]);

  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("restricted-preview") as GeoJSONSource | undefined;
    if (!src) return;
    const fc = selectedCellsToFeatureCollection(selectedZoneCellsRef.current, clippedCellCacheRef.current);
    src.setData(fc);
  }, [selectionEpoch, zoneMode]);

  useEffect(() => {
    if (!zoneMode) return;
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduce = false;
    }
    if (reduce) return;
    let t = 0;
    const id = window.setInterval(() => {
      t += 1;
      const map = mapRef.current;
      if (!map?.getLayer("restricted-preview-line")) return;
      const wave = 0.38 + (Math.sin(t * 0.12) + 1) * 0.28;
      try {
        map.setPaintProperty("restricted-preview-line", "line-opacity", wave);
        map.setPaintProperty("restricted-preview-fill", "fill-opacity", 0.28 + (Math.sin(t * 0.09) + 1) * 0.1);
      } catch {
        /* style not ready */
      }
    }, 90);
    return () => window.clearInterval(id);
  }, [zoneMode, selectionEpoch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    if (!zoneMode) {
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
      return;
    }

    map.dragPan.disable();
    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";

    const bumpSel = () => {
      setSelectionCount(selectedZoneCellsRef.current.size);
      setSelectionEpoch((x) => x + 1);
    };

    const lngLatFromEvent = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      return map.unproject([x, y]);
    };

    const paintLngLat = (lng: number, lat: number, erase: boolean) => {
      const key = hitTestCellKey(lng, lat, ZONE_GRID_STEP_DEG);
      if (!key) return;
      const sel = selectedZoneCellsRef.current;
      if (erase) {
        if (sel.delete(key as ZoneCellKey)) bumpSel();
      } else {
        const clipped = getOrComputeClippedCell(
          clippedCellCacheRef.current,
          navPolygonRef.current,
          key as ZoneCellKey,
          ZONE_GRID_STEP_DEG
        );
        if (!clipped) return;
        if (!sel.has(key as ZoneCellKey)) {
          sel.add(key as ZoneCellKey);
          bumpSel();
        }
      }
    };

    const onDown = (ev: MouseEvent) => {
      if (ev.button !== 0) return;
      zonePaintActiveRef.current = true;
      const ll = lngLatFromEvent(ev);
      const erase = zoneErase || ev.ctrlKey || ev.altKey;
      paintLngLat(ll.lng, ll.lat, erase);
    };

    const onMove = (ev: MouseEvent) => {
      if (!(zonePaintActiveRef.current || ev.buttons === 1)) return;
      if (ev.buttons !== 1) return;
      const ll = lngLatFromEvent(ev);
      const erase = zoneErase || ev.ctrlKey || ev.altKey;
      paintLngLat(ll.lng, ll.lat, erase);
    };

    const onUp = () => {
      zonePaintActiveRef.current = false;
    };

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      canvas.style.cursor = "";
      map.dragPan.enable();
    };
  }, [zoneMode, zoneErase]);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user?.id) {
      setZoneToast("Sign in to acknowledge alerts");
      window.setTimeout(() => setZoneToast(null), 4000);
      return;
    }
    const ack = await supabase.from("alert_acknowledgements").insert({
      alert_id: alertId,
      user_id: user.id,
      note: "Acknowledged from Command TacticalMap",
    });
    if (ack.error) {
      setZoneToast(formatSupabaseLikeError(ack.error));
      window.setTimeout(() => setZoneToast(null), 5000);
      return;
    }
    const upd = await supabase.from("alerts").update({ status: "acknowledged" }).eq("id", alertId);
    if (upd.error) {
      setZoneToast(formatSupabaseLikeError(upd.error));
      window.setTimeout(() => setZoneToast(null), 5000);
      return;
    }
    const alertsRes = await supabase
      .from("alerts")
      .select("id,title,severity,created_at,status,ship_id,type")
      .eq("status", "active")
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(24);
    if (!alertsRes.error) setAlerts((alertsRes.data ?? []) as AlertRow[]);
    setDetailTick((t) => t + 1);
  }, []);

  const submitCaptainManualDistress = useCallback(async () => {
    if (!captainShipId) return;
    const msg = captainDistressDraft.trim();
    if (!msg) {
      setZoneToast("Describe the situation for command (required).");
      window.setTimeout(() => setZoneToast(null), 4000);
      return;
    }
    setCaptainDistressBusy(true);
    setZoneToast(null);
    try {
      await captainDeclareDistress(supabase, {
        shipId: captainShipId,
        reason: "manual",
        message: msg,
      });
      setCaptainDistressDraft("");
      setDetailTick((t) => t + 1);
      setZoneToast("Distress call sent to command.");
      window.setTimeout(() => setZoneToast(null), 4000);
      const alertsRes = await supabase
        .from("alerts")
        .select("id,title,severity,created_at,status,ship_id,type")
        .eq("status", "active")
        .eq("ship_id", captainShipId)
        .order("severity", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(24);
      if (!alertsRes.error) setAlerts((alertsRes.data ?? []) as AlertRow[]);
    } catch (e: unknown) {
      let errMsg = formatSupabaseLikeError(e);
      if (/could not find|does not exist|404/i.test(errMsg)) {
        errMsg +=
          " Apply migration 0021_captain_declare_distress.sql (captain_declare_distress RPC).";
      }
      setZoneToast(errMsg);
      window.setTimeout(() => setZoneToast(null), 8000);
    } finally {
      setCaptainDistressBusy(false);
    }
  }, [captainShipId, captainDistressDraft]);

  const commitZoneSelection = useCallback(async () => {
    if (selectedZoneCellsRef.current.size === 0) return;
    setZoneCommitBusy(true);
    setZoneToast(null);
    try {
      const geoms = cellGeometriesForCommit(selectedZoneCellsRef.current, clippedCellCacheRef.current);
      if (geoms.length === 0) {
        setZoneToast("No navigable cells in selection");
        return;
      }
      const name = `RZ ${new Date().toISOString().slice(11, 19).replace(/:/g, "")}`;
      const { error } = await supabase.rpc("commit_restricted_zone", {
        p_name: name,
        p_cell_polygons: geoms,
        p_scenario_id: "00000000-0000-0000-0000-000000000001",
        p_properties: {},
      });
      if (error) throw error;
      playTacticalChirp();
      selectedZoneCellsRef.current.clear();
      bumpZoneSelectionPreview();
      await refreshZonesFromDb();
      await refreshRoutesFromDb();
      const alertsRes = await supabase
        .from("alerts")
        .select("id,title,severity,created_at,status,ship_id,type")
        .eq("status", "active")
        .order("severity", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(24);
      if (!alertsRes.error) setAlerts((alertsRes.data ?? []) as AlertRow[]);
      setDetailTick((t) => t + 1);
      setZoneToast("Restricted zone committed");
      window.setTimeout(() => setZoneToast(null), 3200);
    } catch (e: unknown) {
      let msg = formatSupabaseLikeError(e);
      if (/404|could not find|not\s+found|function .* does not exist/i.test(msg)) {
        msg +=
          " Apply migration 0011_commit_restricted_zone.sql (e.g. supabase db reset or supabase db push).";
      }
      setZoneToast(msg);
      window.setTimeout(() => setZoneToast(null), 6000);
    } finally {
      setZoneCommitBusy(false);
    }
  }, [refreshRoutesFromDb, refreshZonesFromDb, bumpZoneSelectionPreview]);

  const discardZoneSelection = useCallback(() => {
    selectedZoneCellsRef.current.clear();
    bumpZoneSelectionPreview();
  }, [bumpZoneSelectionPreview]);

  const deactivateRestrictedZone = useCallback(
    async (zoneId: string) => {
      setZoneDeactivateBusyId(zoneId);
      setZoneToast(null);
      try {
        const { error } = await supabase.from("restricted_zones").update({ is_active: false }).eq("id", zoneId);
        if (error) throw error;
        await refreshZonesFromDb();
        setZoneToast("Zone hidden from map (inactive).");
        window.setTimeout(() => setZoneToast(null), 3200);
      } catch (e: unknown) {
        let msg = formatSupabaseLikeError(e);
        if (/permission denied|policy|42501|PGRST301/i.test(msg)) {
          msg +=
            ' Apply migration 0016_restricted_zones_command_update_policy.sql so Command users may UPDATE is_active.';
        }
        setZoneToast(msg);
        window.setTimeout(() => setZoneToast(null), 8000);
      } finally {
        setZoneDeactivateBusyId(null);
      }
    },
    [refreshZonesFromDb]
  );

  useEffect(() => {
    if (dataState !== "ready") return;
    void refreshZonesFromDb();
  }, [dataState, refreshZonesFromDb]);

  // RAF: water + restricted-zone-aware steering, route previews, proximity arbitration
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const now = Date.now();
      const map = mapRef.current;
      if (map) {
        let normal = 0;
        let warning = 0;
        let distress = 0;
        const nextDistress = new Set<string>();

        const ringPoly = NAVIGABLE_WATER_LATLNG as [number, number][];
        const obstacles = restrictedZoneRingsRef.current;
        const lastMs = lastRafMsRef.current ?? now;
        const dt = Math.min((now - lastMs) / 1000, 0.12);
        lastRafMsRef.current = now;

        const prevPositions: Record<string, { lat: number; lng: number }> = {};
        for (const sid of Object.keys(fixesRef.current)) {
          const f = fixesRef.current[sid];
          prevPositions[sid] = renderPosRef.current[sid] ?? { lng: f.lng, lat: f.lat };
        }
        const nearestNeighborM = (sid: string): number => {
          const p = prevPositions[sid];
          if (!p) return Infinity;
          let best = Infinity;
          for (const [other, q] of Object.entries(prevPositions)) {
            if (other === sid) continue;
            const d = haversineM(
              { lat: p.lat, lng: p.lng },
              { lat: q.lat, lng: q.lng }
            );
            if (d < best) best = d;
          }
          return best;
        };

        for (const [shipId, fix] of Object.entries(fixesRef.current)) {
          const speedKn = fix.speed_knots;
          const isHalted =
            fix.status === "stopped" ||
            fix.status === "distressed" ||
            fix.status === "stranded" ||
            fix.status === "insufficient_fuel" ||
            fix.status === "out_of_fuel" ||
            speedKn < 0.05;
          const prevRender =
            renderPosRef.current[shipId] ?? { lng: fix.lng, lat: fix.lat };

          const baseTravelM =
            mpsFromKnots(clamp(speedKn, 0, 40)) * dt * SIM_SPEED_MULTIPLIER;
          const proxFactor = pairwiseProximitySpeedFactor(nearestNeighborM(shipId));
          const travelM = baseTravelM * proxFactor;

          if (!isHalted && dataState === "ready") {
            const meta = metaRef.current[shipId];
            const destId = meta?.destination_port_id;
            const destPort = destId ? portById.get(destId) : undefined;
            const destPt = destPort ? parsePoint(destPort.position) : null;
            let cur = prevRender;
            if (!pointInPolygon({ lat: cur.lat, lng: cur.lng }, ringPoly)) {
              cur = snapLatLngIntoWater({ lat: cur.lat, lng: cur.lng }, ringPoly);
            }
            if (!pointInNavigableFree({ lat: cur.lat, lng: cur.lng }, ringPoly, obstacles)) {
              cur = snapLatLngIntoFreeWater(
                { lat: cur.lat, lng: cur.lng },
                ringPoly,
                obstacles,
                { lat: fix.lat, lng: fix.lng }
              );
            }
            if (destPt) {
              const destInWater = snapLatLngIntoFreeWater(
                { lat: destPt.lat, lng: destPt.lng },
                ringPoly,
                obstacles,
                { lat: cur.lat, lng: cur.lng }
              );
              const destKey = destId ?? null;
              if (!steerCommitRef.current[shipId]) {
                steerCommitRef.current[shipId] = {
                  destinationPortId: null,
                  committedBearingDeg: null,
                };
              }
              const st = steerCommitRef.current[shipId];
              if (st.destinationPortId !== destKey) {
                st.destinationPortId = destKey;
                st.committedBearingDeg = null;
              }
              const step = steerTowardPortWithCommitment(
                { lat: cur.lat, lng: cur.lng },
                destInWater,
                travelM,
                ringPoly,
                st,
                obstacles
              );
              simHeadingRef.current[shipId] = step.bearingDeg;
              renderPosRef.current[shipId] = {
                lng: step.position.lng,
                lat: step.position.lat,
              };
            } else {
              delete steerCommitRef.current[shipId];
              renderPosRef.current[shipId] = cur;
            }
          } else {
            renderPosRef.current[shipId] = prevRender;
            delete steerCommitRef.current[shipId];
          }

          if (!isHalted && dataState === "ready") {
            const st0 = fixesRef.current[shipId];
            if (st0.fuel_tons != null) {
              const burn = FUEL_TONS_PER_SIM_STEP;
              const prevFuel = st0.fuel_tons;
              const nextFuel = Math.max(0, prevFuel - burn);
              let nextStatus = st0.status;
              let nextSpeed = st0.speed_knots;
              if (nextFuel === 0 && prevFuel > 0) {
                nextStatus = "out_of_fuel";
                nextSpeed = 0;
              }
              fixesRef.current[shipId] = {
                ...st0,
                fuel_tons: nextFuel,
                status: nextStatus,
                speed_knots: nextSpeed,
              };
              if (shipId === selectedShipId && burn > 0) {
                if (now - lastFuelUiBumpMsRef.current > 450) {
                  lastFuelUiBumpMsRef.current = now;
                  setDetailTick((x) => x + 1);
                }
              }
              if (nextStatus === "out_of_fuel" && prevFuel > 0) {
                setDetailTick((x) => x + 1);
              }
            }
          }

          const curFix = fixesRef.current[shipId];
          if (
            curFix.status === "distressed" ||
            curFix.status === "stranded" ||
            curFix.status === "insufficient_fuel" ||
            curFix.status === "out_of_fuel"
          ) {
            distress += 1;
          } else if (curFix.status === "rerouting") warning += 1;
          else normal += 1;

          if (
            curFix.status === "distressed" ||
            curFix.status === "stranded" ||
            curFix.status === "insufficient_fuel" ||
            curFix.status === "out_of_fuel" ||
            (curFix.fuel_tons ?? 999999) < CAPTAIN_LOW_FUEL_DISTRESS_TONS
          ) {
            nextDistress.add(shipId);
          }
        }

        if (isCaptain && captainShipId && dataState === "ready") {
          const fix = fixesRef.current[captainShipId];
          const pos = renderPosRef.current[captainShipId];
          if (fix && pos) {
            const fuel = fix.fuel_tons ?? Number.POSITIVE_INFINITY;
            if (fuel <= CAPTAIN_LOW_FUEL_DISTRESS_TONS) {
              if (!captainAutoDistressRef.current.fuel) {
                captainAutoDistressRef.current.fuel = true;
                void (async () => {
                  try {
                    await captainDeclareDistress(supabase, {
                      shipId: captainShipId,
                      reason: "low_fuel",
                      message: `Automatic distress: fuel at or below ${CAPTAIN_LOW_FUEL_DISTRESS_TONS} t (fleet.json operationalRules).`,
                    });
                    setDetailTick((t) => t + 1);
                    const alertsRes = await supabase
                      .from("alerts")
                      .select("id,title,severity,created_at,status,ship_id,type")
                      .eq("status", "active")
                      .eq("ship_id", captainShipId)
                      .order("severity", { ascending: false })
                      .order("created_at", { ascending: false })
                      .limit(24);
                    if (!alertsRes.error) setAlerts((alertsRes.data ?? []) as AlertRow[]);
                  } catch (e: unknown) {
                    setZoneToast(formatSupabaseLikeError(e));
                    window.setTimeout(() => setZoneToast(null), 6000);
                  }
                })();
              }
            } else if (fuel > CAPTAIN_LOW_FUEL_DISTRESS_TONS * CAPTAIN_LOW_FUEL_RESET_HYSTERESIS) {
              captainAutoDistressRef.current.fuel = false;
            }

            const obs = restrictedZoneRingsRef.current;
            if (
              obs.length > 0 &&
              pointInAnyObstacle({ lat: pos.lat, lng: pos.lng }, obs)
            ) {
              if (!captainAutoDistressRef.current.zone) {
                captainAutoDistressRef.current.zone = true;
                void (async () => {
                  try {
                    await captainDeclareDistress(supabase, {
                      shipId: captainShipId,
                      reason: "restricted_zone",
                      message:
                        "Automatic distress: vessel position is inside an active command restricted zone.",
                    });
                    setDetailTick((t) => t + 1);
                    const alertsRes = await supabase
                      .from("alerts")
                      .select("id,title,severity,created_at,status,ship_id,type")
                      .eq("status", "active")
                      .eq("ship_id", captainShipId)
                      .order("severity", { ascending: false })
                      .order("created_at", { ascending: false })
                      .limit(24);
                    if (!alertsRes.error) setAlerts((alertsRes.data ?? []) as AlertRow[]);
                  } catch (e: unknown) {
                    setZoneToast(formatSupabaseLikeError(e));
                    window.setTimeout(() => setZoneToast(null), 6000);
                  }
                })();
              }
            } else {
              captainAutoDistressRef.current.zone = false;
            }
          }
        }

        const allRoutesSource = map.getSource("all-routes") as GeoJSONSource | undefined;
        if (allRoutesSource && dataState === "ready") {
          const routeFeatures: GeoJSON.Feature[] = [];
          for (const shipId of Object.keys(fixesRef.current)) {
            const shipPos = renderPosRef.current[shipId];
            if (!shipPos) continue;
            const meta = metaRef.current[shipId];
            const destId = meta?.destination_port_id;
            const destPort = destId ? portById.get(destId) : undefined;
            const destPt = destPort ? parsePoint(destPort.position) : null;
            if (!destPt) continue;
            const destSnap = snapLatLngIntoFreeWater(
              { lat: destPt.lat, lng: destPt.lng },
              ringPoly,
              obstacles,
              { lat: shipPos.lat, lng: shipPos.lng }
            );
            const hdg =
              simHeadingRef.current[shipId] ??
              initialBearingDeg(
                { lat: shipPos.lat, lng: shipPos.lng },
                destSnap
              );
            const coords = steerPreviewLngLat(
              { lat: shipPos.lat, lng: shipPos.lng },
              hdg,
              destSnap,
              ringPoly,
              obstacles
            );
            routeFeatures.push({
              type: "Feature",
              properties: { shipId },
              geometry: { type: "LineString", coordinates: coords },
            });
          }
          allRoutesSource.setData({ type: "FeatureCollection", features: routeFeatures });
        } else if (allRoutesSource) {
          allRoutesSource.setData({ type: "FeatureCollection", features: [] });
        }

        const pos = renderPosRef.current;
        if (
          !isCaptain &&
          PROXIMITY_ARB_ENABLED &&
          now - lastArbMsRef.current >= ARB_INTERVAL_MS
        ) {
          lastArbMsRef.current = now;
          const ids = Object.keys(fixesRef.current);

          for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
              const ida = ids[i];
              const idb = ids[j];
              const pa = pos[ida];
              const pb = pos[idb];
              if (!pa || !pb) continue;
              const fa = fixesRef.current[ida];
              const fb = fixesRef.current[idb];
              if (!fa || !fb) continue;
              if (
                fa.status === "distressed" ||
                fb.status === "distressed" ||
                fa.status === "insufficient_fuel" ||
                fb.status === "insufficient_fuel" ||
                fa.status === "stranded" ||
                fb.status === "stranded"
              ) {
                continue;
              }

              const d = haversineM(
                { lat: pa.lat, lng: pa.lng },
                { lat: pb.lat, lng: pb.lng }
              );

              if (d < PROXIMITY_IN_M) {
                const winner = pickStandOnShip(ida, fa, idb, fb);
                const loser = winner === ida ? idb : ida;
                let partners = yieldPartnersRef.current.get(loser);
                if (!partners) {
                  partners = new Set<string>();
                  yieldPartnersRef.current.set(loser, partners);
                }
                if (!partners.has(winner)) {
                  partners.add(winner);
                  if (!arbitrationSavedRef.current.has(loser)) {
                    const fl = fixesRef.current[loser];
                    arbitrationSavedRef.current.set(loser, {
                      speed: fl.speed_knots,
                      status: fl.status,
                    });
                  }
                  fixesRef.current[loser] = {
                    ...fixesRef.current[loser],
                    status: "stopped",
                    speed_knots: 0,
                  };
                  void supabase
                    .from("ship_state_current")
                    .update({
                      status: "stopped",
                      speed_knots: 0,
                      ts: new Date().toISOString(),
                      extra: { arbitration_yield_to: winner },
                    })
                    .eq("ship_id", loser);
                  void supabase.from("alerts").insert({
                    type: "proximity_warning",
                    severity: 3,
                    title: `Proximity: ${loser} yielding to ${winner}`,
                    source: "command_ui",
                    ship_id: loser,
                    related_ship_id: winner,
                    payload: { distance_m: Math.round(d) },
                  });
                  setDetailTick((t) => t + 1);
                }
              }

              if (d > PROXIMITY_OUT_M) {
                const tryClearPair = (loser: string, winner: string) => {
                  const ps = yieldPartnersRef.current.get(loser);
                  if (!ps?.has(winner)) return;
                  ps.delete(winner);
                  if (ps.size === 0) {
                    yieldPartnersRef.current.delete(loser);
                    const saved = arbitrationSavedRef.current.get(loser);
                    arbitrationSavedRef.current.delete(loser);
                    if (saved && fixesRef.current[loser]) {
                      fixesRef.current[loser] = {
                        ...fixesRef.current[loser],
                        status: saved.status,
                        speed_knots: saved.speed,
                      };
                      void supabase
                        .from("ship_state_current")
                        .update({
                          status: saved.status,
                          speed_knots: saved.speed,
                          ts: new Date().toISOString(),
                          extra: {},
                        })
                        .eq("ship_id", loser);
                      setDetailTick((t) => t + 1);
                    }
                  }
                };
                tryClearPair(ida, idb);
                tryClearPair(idb, ida);
              }
            }
          }
        }

        if (dataState === "ready" && now - lastPosSyncMsRef.current >= POSITION_SYNC_MS) {
          lastPosSyncMsRef.current = now;
          const syncIds =
            isCaptain && captainShipId ? [captainShipId] : Object.keys(fixesRef.current);
          for (const shipId of syncIds) {
            const fix = fixesRef.current[shipId];
            if (!fix) continue;
            const r = renderPosRef.current[shipId];
            if (!r) continue;
            const hdg = simHeadingRef.current[shipId] ?? fix.heading_deg;
            void supabase
              .from("ship_state_current")
              .update({
                position: { type: "Point", coordinates: [r.lng, r.lat] },
                heading_deg: hdg,
                fuel_tons: fix.fuel_tons,
                speed_knots: fix.speed_knots,
                status: fix.status,
                ts: new Date().toISOString(),
              })
              .eq("ship_id", shipId);
          }
        }

        const yieldingShips = new Set<string>();
        yieldPartnersRef.current.forEach((partners, loser) => {
          if (partners.size > 0) yieldingShips.add(loser);
        });

        for (const [shipId, fix] of Object.entries(fixesRef.current)) {
          const adv = renderPosRef.current[shipId];
          if (!adv) continue;

          const yielding = yieldingShips.has(shipId);
          const hdg = simHeadingRef.current[shipId] ?? fix.heading_deg;
          let m = markersRef.current[shipId];
          if (!m) {
            const { el, setHeading } = createShipMarkerElement({
              shipId,
              headingDeg: hdg,
              status: fix.status,
              speedKnots: fix.speed_knots,
              yielding,
            });
            el.addEventListener("click", () => setSelectedShipId(shipId));
            el.addEventListener("mouseenter", () => {
              map.getCanvas().style.cursor = "pointer";
            });
            el.addEventListener("mouseleave", () => {
              map.getCanvas().style.cursor = "";
              setHoverCard(null);
            });
            el.addEventListener("mousemove", (ev) => {
              const rect = mapContainerRef.current?.getBoundingClientRect();
              if (!rect) return;
              setHoverCard({
                x: ev.clientX - rect.left,
                y: ev.clientY - rect.top,
                shipId,
                speed: fix.speed_knots,
                status: fix.status,
              });
            });

            const marker = new maplibregl.Marker({ element: el, anchor: "center" })
              .setLngLat([adv.lng, adv.lat])
              .addTo(map);
            m = markersRef.current[shipId] = {
              marker,
              setHeading,
              lastHeading: hdg,
              lastYielding: yielding,
            };
          } else {
            m.marker.setLngLat([adv.lng, adv.lat]);
            if (Math.abs(m.lastHeading - hdg) > 0.1) {
              m.setHeading(hdg);
              m.lastHeading = hdg;
            }
            if (m.lastYielding !== yielding) {
              m.lastYielding = yielding;
              updateShipMarkerAppearance(
                m.marker.getElement(),
                hdg,
                fix.status,
                fix.speed_knots,
                yielding
              );
            }
          }
        }

        setFleetStatusCounts((prev) =>
          prev.normal === normal && prev.warning === warning && prev.distress === distress
            ? prev
            : { normal, warning, distress }
        );
        const pulseSource = map.getSource("ship-pulse") as GeoJSONSource | undefined;
        if (pulseSource) {
          pulseSource.setData({
            type: "FeatureCollection",
            features: Array.from(nextDistress).map((shipId) => {
              const p = renderPosRef.current[shipId];
              return {
                type: "Feature" as const,
                properties: {},
                geometry: {
                  type: "Point" as const,
                  coordinates: [p.lng, p.lat],
                },
              };
            }),
          });
        }
        if (map.getLayer("ship-pulse-ring")) {
          pulsePhaseRef.current += 0.016 * 2.8;
          const wave = 10 + (Math.sin(pulsePhaseRef.current) + 1) * 4;
          const op = 0.18 + (Math.sin(pulsePhaseRef.current) + 1) * 0.15;
          map.setPaintProperty("ship-pulse-ring", "circle-radius", wave);
          map.setPaintProperty("ship-pulse-ring", "circle-opacity", op);
        }

        const routeSource = map.getSource("selected-route") as GeoJSONSource | undefined;
        if (routeSource && selectedShipId && dataState === "ready") {
          const meta = metaRef.current[selectedShipId];
          const destId = meta?.destination_port_id;
          const destPort = destId ? portById.get(destId) : undefined;
          const destPos = destPort ? parsePoint(destPort.position) : null;
          const shipPos = renderPosRef.current[selectedShipId];
          const rr = routesRef.current[selectedShipId];
          const invalid = !!(rr && rr.is_valid === false);

          if (shipPos && destPos) {
            const destSnap = snapLatLngIntoFreeWater(
              { lat: destPos.lat, lng: destPos.lng },
              ringPoly,
              obstacles,
              { lat: shipPos.lat, lng: shipPos.lng }
            );
            const hdg =
              simHeadingRef.current[selectedShipId] ??
              initialBearingDeg(
                { lat: shipPos.lat, lng: shipPos.lng },
                destSnap
              );
            const coords = steerPreviewLngLat(
              { lat: shipPos.lat, lng: shipPos.lng },
              hdg,
              destSnap,
              ringPoly,
              obstacles
            );
            routeSource.setData({
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "LineString", coordinates: coords },
                },
              ],
            });
          } else {
            routeSource.setData({ type: "FeatureCollection", features: [] });
          }

          if (map.getLayer("selected-route-line")) {
            try {
              map.setPaintProperty(
                "selected-route-line",
                "line-dasharray",
                invalid ? ([1.6, 1.6] as [number, number]) : ([2, 2] as [number, number])
              );
              map.setPaintProperty("selected-route-line", "line-color", invalid ? "#fcd34d" : "#93c5fd");
            } catch {
              /* layer not styled yet */
            }
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [portById, selectedShipId, dataState, isCaptain, captainShipId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const routeSource = map.getSource("selected-route") as GeoJSONSource | undefined;
    if (!routeSource) return;

    if (!selectedShipId) {
      routeSource.setData({ type: "FeatureCollection", features: [] });
      map.easeTo({ padding: { left: 0, right: 0, top: 0, bottom: 0 }, duration: 350 });
      return;
    }

    const pos = renderPosRef.current[selectedShipId] ?? null;
    if (!pos) return;
    map.easeTo({
      center: [pos.lng, pos.lat],
      duration: 420,
      padding: isCaptain
        ? { left: 72, right: 72, top: 72, bottom: 72 }
        : { left: 90, right: 380, top: 90, bottom: 90 },
    });
  }, [selectedShipId, portById, isCaptain]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#183824]">
      <div ref={mapContainerRef} className="h-full w-full" />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 70% at 50% 50%, rgba(255,255,255,0) 0%, rgba(0,0,0,0.22) 58%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      <div className="absolute left-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-3">
        {leadingRail}
        {isCommand ? (
          <button
            type="button"
            onClick={() => {
              setZoneMode((prev) => {
                if (prev) {
                  selectedZoneCellsRef.current.clear();
                  zonePaintActiveRef.current = false;
                  setSelectionCount(0);
                  setSelectionEpoch((e) => e + 1);
                }
                return !prev;
              });
            }}
            aria-pressed={zoneMode}
            aria-label={zoneMode ? "Exit Zone Architect" : "Zone Architect"}
            className={`btn-glow flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/20 text-cyan-100 backdrop-blur-md transition hover:bg-slate-800/75 ${
              zoneMode ? "bg-amber-500/35 ring-2 ring-amber-200/55" : "bg-slate-900/70"
            }`}
          >
            <Grid3x3 size={17} />
          </button>
        ) : null}
        {hudButtons.map((item) => (
          <button
            key={item.key}
            onClick={() => setHudPanel((prev) => (prev === item.key ? null : item.key))}
            className="btn-glow flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-slate-900/70 text-cyan-100 backdrop-blur-md transition hover:bg-slate-800/75"
            aria-label={`${item.label} panel`}
          >
            <item.icon size={17} />
          </button>
        ))}
      </div>

      <AnimatePresence>
        {hudPanel ? (
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            className="absolute left-20 top-1/2 z-30 w-[290px] -translate-y-1/2 rounded-2xl border border-white/20 bg-slate-900/60 p-4 text-sm text-white shadow-2xl backdrop-blur-md"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold tracking-wide">
                {hudPanel === "fleet" && (isCaptain ? "My vessel" : "Fleet Statistics")}
                {hudPanel === "alerts" && "Live Alerts"}
                {hudPanel === "ports" && "Port Directory"}
              </p>
              <button onClick={() => setHudPanel(null)} className="rounded-md p-1 hover:bg-white/10">
                <X size={15} />
              </button>
            </div>

            {hudPanel === "fleet" ? (
              <div className="space-y-2 text-xs">
                {isCaptain && captainShipId ? (
                  <>
                    <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-cyan-200/70">
                        Your vessel
                      </p>
                      <p className="mt-1 font-semibold text-white">
                        {captainShipName ?? captainShipId}
                      </p>
                      <p className="text-[10px] text-white/50">{captainShipId}</p>
                      {captainDisplayName ? (
                        <p className="mt-1 text-white/70">Master: {captainDisplayName}</p>
                      ) : null}
                    </div>
                    <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">
                      Fleet-wide statistics are restricted on captain bridge.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">
                      Active Ships: <span className="font-semibold">{trackedShipCount}</span>
                    </div>
                    <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2">
                      Normal: <span className="font-semibold">{fleetStatusCounts.normal}</span>
                    </div>
                    <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2">
                      Rerouting: <span className="font-semibold">{fleetStatusCounts.warning}</span>
                    </div>
                    <div className="rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2">
                      Distressed: <span className="font-semibold">{fleetStatusCounts.distress}</span>
                    </div>
                  </>
                )}
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white/60">
                  Data:{" "}
                  <span className="text-white/85">
                    {dataState === "ready" ? "Supabase live" : dataState === "error" ? "error" : "loading"}
                  </span>
                </div>
              </div>
            ) : null}

            {hudPanel === "alerts" ? (
              <div className="space-y-2 text-xs">
                {alerts.length === 0 ? (
                  <p className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-emerald-100">
                    No active alerts.
                  </p>
                ) : (
                  alerts.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-100"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold">{a.title}</span>
                        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-white/70">
                          S{a.severity}
                        </span>
                      </div>
                      <div className="mt-1 text-[10px] text-red-100/70">
                        {new Date(a.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {hudPanel === "ports" ? (
              <div className="max-h-80 space-y-2 overflow-auto pr-1 text-xs">
                {ports.map((port) => {
                  const p = parsePoint(port.position);
                  return (
                    <div key={port.id} className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">
                      <p className="font-semibold text-white">{port.name}</p>
                      <p className="text-white/70">{port.id}</p>
                      <p className="text-white/70">
                        {p ? `${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}` : "position unavailable"}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {hoverCard ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="pointer-events-none absolute z-40 rounded-xl border border-white/20 bg-slate-900/75 px-3 py-2 text-xs text-white backdrop-blur-md"
            style={{
              left: hoverCard.x + 16,
              top: hoverCard.y + 16,
            }}
          >
            <p className="font-semibold">{hoverCard.shipId}</p>
            <p>Speed: {hoverCard.speed.toFixed(1)} kn</p>
            <p>Status: {hoverCard.status}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {selectedShipDetail || (isCaptain && captainShipId) ? (
          <motion.aside
            initial={{ x: 360 }}
            animate={{ x: 0 }}
            exit={{ x: 360 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="absolute right-0 top-0 z-30 flex h-full w-[380px] flex-col gap-3 border-l border-white/20 bg-slate-900/40 p-4 backdrop-blur-md">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {selectedShipDetail ? (
                <ShipDetailCard
                  ship={selectedShipDetail}
                  onClose={() => setSelectedShipId(null)}
                  showClose={!isCaptain}
                  onAcknowledgeAlert={isCaptain ? undefined : acknowledgeAlert}
                  commandFooter={
                    isCommand && commandUserId && selectedShipDetail ? (
                      isShipCriticallyDistressed(selectedShipDetail.status) ? (
                        <div className="space-y-2">
                          <p className="text-[10px] leading-relaxed text-amber-200/90">
                            Critical distress — transmit a formal order to the master of
                            this vessel.
                          </p>
                          <button
                            type="button"
                            onClick={() => setSendOrderOpen(true)}
                            className="w-full rounded-full bg-amber-500 py-2.5 text-xs font-bold text-[#1a0f00] shadow-[0_8px_24px_rgba(245,158,11,0.35)] hover:bg-amber-400"
                          >
                            Send order to captain
                          </button>
                        </div>
                      ) : (
                        <p className="text-[10px] leading-relaxed text-white/45">
                          Bridge orders unlock when this ship&apos;s status is{" "}
                          <span className="text-white/70">distressed</span> (critical).
                        </p>
                      )
                    ) : null
                  }
                  captainBridgeFooter={
                    isCaptain && captainShipId && selectedShipDetail?.ship_id === captainShipId ? (
                      <div className="space-y-3">
                        {selectedShipDetail.fuel_tons != null &&
                        selectedShipDetail.fuel_tons <= CAPTAIN_LOW_FUEL_DISTRESS_TONS ? (
                          <p className="text-[10px] font-semibold leading-relaxed text-amber-200/95">
                            Fuel is at or below the fleet threshold ({CAPTAIN_LOW_FUEL_DISTRESS_TONS}{" "}
                            t). An automatic distress call is sent once; add details below if needed.
                          </p>
                        ) : null}
                        <p className="text-[10px] leading-relaxed text-white/65">
                          Send a distress call to Command. Your vessel status is updated so the
                          operations floor can respond (orders, routing, tugs).
                        </p>
                        <textarea
                          value={captainDistressDraft}
                          onChange={(e) => setCaptainDistressDraft(e.target.value)}
                          rows={3}
                          placeholder="e.g. Main engine alarm — requesting instructions."
                          className="w-full resize-y rounded-lg border border-white/15 bg-black/35 px-2 py-2 text-[11px] text-white placeholder:text-white/35"
                        />
                        <button
                          type="button"
                          disabled={captainDistressBusy}
                          onClick={() => void submitCaptainManualDistress()}
                          className="flex w-full items-center justify-center rounded-full bg-rose-600 py-2.5 text-xs font-bold text-white shadow-[0_8px_24px_rgba(225,29,72,0.35)] hover:bg-rose-500 disabled:pointer-events-none disabled:opacity-45"
                        >
                          {captainDistressBusy ? (
                            <span className="inline-flex items-center justify-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                              Sending…
                            </span>
                          ) : (
                            "Declare distress to Command"
                          )}
                        </button>
                      </div>
                    ) : null
                  }
                />
              ) : isCaptain ? (
                <div className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-6 text-center text-xs text-white/50">
                  Loading your vessel…
                </div>
              ) : null}
            </div>
            {isCaptain && captainShipId && captainUserId ? (
              <CaptainOrdersPanel
                captainShipId={captainShipId}
                captainUserId={captainUserId}
              />
            ) : null}
          </motion.aside>
        ) : null}
      </AnimatePresence>

      {isCommand && commandUserId ? (
        <CommandRejectionInbox commandUserId={commandUserId} />
      ) : null}

      <AnimatePresence>
        {sendOrderOpen && selectedShipDetail && commandUserId ? (
          <SendCaptainOrderModal
            open
            shipId={selectedShipDetail.ship_id}
            shipName={selectedShipDetail.name}
            onClose={() => setSendOrderOpen(false)}
            onSend={async (title, instruction) => {
              await createCriticalCaptainOrder(supabase, {
                shipId: selectedShipDetail.ship_id,
                title,
                instruction,
                createdBy: commandUserId,
              });
            }}
          />
        ) : null}
      </AnimatePresence>

      <div className="absolute bottom-4 right-4 z-20">
        <button
          onClick={() => setShowLegend((prev) => !prev)}
          className="btn-glow flex items-center gap-2 rounded-xl border border-white/20 bg-slate-900/70 px-3 py-2 text-xs text-cyan-100 backdrop-blur-md hover:bg-slate-800/75"
        >
          <Info size={14} />
          Legend
        </button>
      </div>

      <AnimatePresence>
        {showLegend ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-16 right-4 z-20 w-60 rounded-xl border border-white/20 bg-slate-900/70 p-3 text-xs text-white backdrop-blur-md"
          >
            <p className="mb-2 font-semibold">Ship Status Legend</p>
            <div className="space-y-1.5 text-white/85">
              <p className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" /> Normal
              </p>
              <p className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" /> Rerouting
              </p>
              <p className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Low fuel / critical
              </p>
              <p className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Distressed / stranded
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {zoneToast && !zoneMode ? (
        <div className="pointer-events-none absolute left-1/2 top-16 z-[50] max-w-[min(92vw,420px)] -translate-x-1/2 px-3">
          <p className="pointer-events-auto rounded-xl border border-amber-300/40 bg-amber-500/15 px-3 py-2 text-center text-[11px] leading-snug text-amber-50 shadow-lg backdrop-blur-md">
            {zoneToast}
          </p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute left-1/2 top-4 z-10 max-w-[min(96vw,520px)] -translate-x-1/2 rounded-full border border-white/15 bg-slate-900/65 px-4 py-2 text-center text-xs text-white/80 backdrop-blur-md">
        <p className="flex flex-wrap items-center justify-center gap-2">
          <Navigation size={14} className="shrink-0" />
          {isCaptain && captainShipId ? (
            <>
              <span className="font-semibold text-cyan-100">
                {captainShipName ?? captainShipId}
              </span>
              <span className="text-white/50">·</span>
              <span>Captain bridge</span>
              {captainDisplayName ? (
                <>
                  <span className="text-white/50">·</span>
                  <span className="truncate text-white/70">{captainDisplayName}</span>
                </>
              ) : null}
            </>
          ) : (
            <>
              Strait of Hormuz Tactical Layer
              <Waves size={14} className="shrink-0" />
            </>
          )}
        </p>
      </div>

      <AnimatePresence>
        {zoneMode ? (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.22 }}
            className="pointer-events-auto absolute bottom-6 left-1/2 z-30 flex max-w-xl -translate-x-1/2 flex-col gap-2 rounded-2xl border border-white/20 bg-slate-950/72 px-4 py-3 text-xs text-white shadow-2xl backdrop-blur-lg"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold tracking-wide text-emerald-100/90">
                Zone Architect — paint navigable grid cells ({selectionCount} selected)
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-[10px] text-white/65">
                <input
                  type="checkbox"
                  checked={zoneErase}
                  onChange={(e) => setZoneErase(e.target.checked)}
                  className="rounded border-white/30 bg-transparent"
                />
                Erase brush (Ctrl/Alt temporarily erases too)
              </label>
            </div>
            {zoneToast ? (
              <p className="rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-1.5 text-amber-100">
                {zoneToast}
              </p>
            ) : null}
            {committedZoneRows.length > 0 ? (
              <div className="max-h-32 space-y-1 overflow-auto rounded-xl border border-white/10 bg-black/35 px-2 py-2 text-[11px] text-white/85">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/55">
                  Committed zones (stay on map)
                </p>
                <ul className="space-y-1">
                  {committedZoneRows.map((z) => (
                    <li
                      key={z.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2 py-1"
                    >
                      <span className="min-w-0 flex-1 truncate text-white/90">{z.name}</span>
                      <button
                        type="button"
                        disabled={zoneDeactivateBusyId !== null}
                        onClick={() => void deactivateRestrictedZone(z.id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-300/35 bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-100 transition hover:bg-rose-500/28 disabled:pointer-events-none disabled:opacity-40"
                        title="Hide zone from tactical map"
                      >
                        {zoneDeactivateBusyId === z.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                        Hide
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={zoneCommitBusy || selectionCount === 0}
                onClick={() => void commitZoneSelection()}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/35 bg-emerald-500/20 px-3 py-1.5 text-[11px] font-semibold text-emerald-50 transition hover:bg-emerald-500/35 disabled:pointer-events-none disabled:opacity-40"
              >
                {zoneCommitBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Commit restricted zone
              </button>
              <button
                type="button"
                onClick={() => discardZoneSelection()}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] text-white/80 transition hover:bg-white/10"
              >
                <Undo2 size={13} /> Discard preview
              </button>
              <span className="text-[10px] text-white/50">
                Coarse grid {ZONE_GRID_STEP_DEG.toFixed(2)}° · masked to AO navigable poly
              </span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}