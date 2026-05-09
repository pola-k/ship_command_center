"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Info,
  MapPin,
  Navigation,
  ShipWheel,
  Waves,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { GeoJSONSource, LngLatBoundsLike, Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { AO_BOUNDS, NAVIGABLE_WATER_LATLNG } from "@/lib/fleetConfig";
import { parsePoint } from "@/lib/geo";
import { mpsFromKnots } from "@/lib/kinematics";
import {
  initialBearingDeg,
  steerPreviewLngLat,
  steerTowardPortWithCommitment,
  type SteerCommitment,
} from "@/lib/pathMotion";
import { haversineM, pointInPolygon, snapLatLngIntoWater } from "@/lib/waterRouting";
import { supabase } from "@/lib/supabaseClient";

import { ShipDetailCard, type ShipDetail } from "./ui/ShipDetailCard";

type HudPanel = "fleet" | "alerts" | "ports" | null;

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
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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
/** Off by default so dense seeds are not all stopped by arbitration; set NEXT_PUBLIC_ENABLE_PROXIMITY_ARB=true to enable. */
const PROXIMITY_ARB_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PROXIMITY_ARB === "true";
const POSITION_SYNC_MS = 800;
const SIM_SPEED_MULTIPLIER = Math.max(
  1,
  Number.parseFloat(process.env.NEXT_PUBLIC_SIM_SPEED_MULT ?? "5000") || 5000
);

/** When another ship is this close (m), speed scales down; beyond CLEAR_M, full nominal speed. */
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

export default function TacticalMap() {
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
  /** Per-ship: hold chosen bearing until land blocks; then re-search for closest-to-goal leg. */
  const steerCommitRef = useRef<Record<string, SteerCommitment>>({});
  const lastRafMsRef = useRef<number | null>(null);
  const lastPosSyncMsRef = useRef(0);

  const yieldPartnersRef = useRef<Map<string, Set<string>>>(new Map());
  const arbitrationSavedRef = useRef<Map<string, { speed: number; status: string }>>(new Map());
  const lastArbMsRef = useRef(0);

  const [ports, setPorts] = useState<PortRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  const [selectedShipId, setSelectedShipId] = useState<string | null>(null);
  const [hudPanel, setHudPanel] = useState<HudPanel>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [hoverCard, setHoverCard] = useState<{
    x: number;
    y: number;
    shipId: string;
    speed: number;
    status: string;
  } | null>(null);

  const [dataState, setDataState] = useState<"loading" | "ready" | "error">("loading");
  const [detailTick, setDetailTick] = useState(0);
  const pulsePhaseRef = useRef(0);

  const portById = useMemo(() => {
    const m = new Map<string, PortRow>();
    for (const p of ports) m.set(p.id, p);
    return m;
  }, [ports]);

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
    const destSnap = destPt
      ? snapLatLngIntoWater({ lat: destPt.lat, lng: destPt.lng }, ring)
      : null;
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
      destination_lat: destSnap?.lat ?? null,
      destination_lng: destSnap?.lng ?? null,
    };
  }, [selectedShipId, detailTick, dataState, portById]);

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
    });

    return () => {
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, []);

  // Initial load: ships meta, ports, ship_state_current, alerts
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setDataState("loading");

        const metaRes = await supabase.from("ships").select("id,name,cargo_type,destination_port_id");
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

        const shipsRes = await supabase
          .from("ship_state_current")
          .select("ship_id,ts,position,speed_knots,heading_deg,fuel_tons,status");
        if (shipsRes.error) throw shipsRes.error;

        const nowMs = Date.now();
        for (const row of (shipsRes.data ?? []) as ShipStateRow[]) {
          const p = parsePoint(row.position);
          if (!p) continue;
          const snapped = snapLatLngIntoWater({ lat: p.lat, lng: p.lng }, snapRing);
          fixesRef.current[row.ship_id] = {
            ship_id: row.ship_id,
            tsMs: new Date(row.ts).getTime() || nowMs,
            lng: snapped.lng,
            lat: snapped.lat,
            heading_deg: row.heading_deg,
            speed_knots: row.speed_knots,
            fuel_tons: row.fuel_tons ?? null,
            status: row.status,
          };
          renderPosRef.current[row.ship_id] = { lng: snapped.lng, lat: snapped.lat };
        }

        const alertsRes = await supabase
          .from("alerts")
          .select("id,title,severity,created_at,status")
          .eq("status", "active")
          .order("severity", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(8);
        if (alertsRes.error) throw alertsRes.error;
        if (!cancelled) setAlerts((alertsRes.data ?? []) as AlertRow[]);

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
  }, []);

  // Realtime ship updates
  useEffect(() => {
    const channel = supabase
      .channel("command_ship_state_current_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "ship_state_current" }, (payload) => {
        const row: any = payload.new;
        const p = parsePoint(row.position);
        if (!p) return;
        const ring = NAVIGABLE_WATER_LATLNG as [number, number][];
        const snapped = snapLatLngIntoWater({ lat: p.lat, lng: p.lng }, ring);
        fixesRef.current[row.ship_id] = {
          ship_id: row.ship_id,
          tsMs: new Date(row.ts).getTime(),
          lng: snapped.lng,
          lat: snapped.lat,
          heading_deg: row.heading_deg,
          speed_knots: row.speed_knots,
          fuel_tons: row.fuel_tons ?? null,
          status: row.status,
        };
        const sid = row.ship_id as string;
        renderPosRef.current[sid] = { lng: snapped.lng, lat: snapped.lat };
        setTrackedShipCount(Object.keys(fixesRef.current).length);
        setDetailTick((t) => t + 1);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Realtime alerts list refresh (lightweight)
  useEffect(() => {
    const channel = supabase
      .channel("command_alerts_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, async () => {
        const alertsRes = await supabase
          .from("alerts")
          .select("id,title,severity,created_at,status")
          .eq("status", "active")
          .order("severity", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(8);
        if (!alertsRes.error) setAlerts((alertsRes.data ?? []) as AlertRow[]);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // RAF smoothing + marker management + distress pulse + proximity arbitration
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
          const isHalted = fix.status === "stopped" || speedKn < 0.05;
          const prevRender =
            renderPosRef.current[shipId] ?? { lng: fix.lng, lat: fix.lat };

          const baseTravelM =
            mpsFromKnots(clamp(speedKn, 0, 40)) * dt * SIM_SPEED_MULTIPLIER;
          const travelM =
            baseTravelM * pairwiseProximitySpeedFactor(nearestNeighborM(shipId));

          if (!isHalted) {
            const meta = metaRef.current[shipId];
            const destId = meta?.destination_port_id;
            const destPort = destId ? portById.get(destId) : undefined;
            const destPt = destPort ? parsePoint(destPort.position) : null;
            let cur = prevRender;
            if (!pointInPolygon({ lat: cur.lat, lng: cur.lng }, ringPoly)) {
              cur = snapLatLngIntoWater({ lat: cur.lat, lng: cur.lng }, ringPoly);
            }
            if (destPt) {
              const destInWater = snapLatLngIntoWater(
                { lat: destPt.lat, lng: destPt.lng },
                ringPoly
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
                st
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

          if (fix.status === "distressed") distress += 1;
          else if (fix.status === "rerouting") warning += 1;
          else normal += 1;

          if (fix.status === "distressed" || (fix.fuel_tons ?? 999999) < 1000) nextDistress.add(shipId);
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
            const destSnap = snapLatLngIntoWater(
              { lat: destPt.lat, lng: destPt.lng },
              ringPoly
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
              ringPoly
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
              if (fa.status === "distressed" || fb.status === "distressed") continue;

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

        if (now - lastPosSyncMsRef.current >= POSITION_SYNC_MS) {
          lastPosSyncMsRef.current = now;
          for (const shipId of Object.keys(fixesRef.current)) {
            const fix = fixesRef.current[shipId];
            if (fix.status === "stopped") continue;
            const r = renderPosRef.current[shipId];
            if (!r) continue;
            void supabase
              .from("ship_state_current")
              .update({
                position: { type: "Point", coordinates: [r.lng, r.lat] },
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
          if (shipPos && destPos) {
            const destSnap = snapLatLngIntoWater(
              { lat: destPos.lat, lng: destPos.lng },
              ringPoly
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
              ringPoly
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
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [portById, selectedShipId, dataState]);

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
      padding: { left: 90, right: 380, top: 90, bottom: 90 },
    });
  }, [selectedShipId, portById]);

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

      <div className="absolute left-4 top-1/2 z-20 -translate-y-1/2 space-y-3">
        {[
          { key: "fleet" as const, label: "Fleet", icon: ShipWheel },
          { key: "alerts" as const, label: "Alerts", icon: AlertTriangle },
          { key: "ports" as const, label: "Ports", icon: MapPin },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setHudPanel((prev) => (prev === item.key ? null : item.key))}
            className="btn-glow flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-slate-900/70 text-cyan-100 backdrop-blur-md transition hover:bg-slate-800/75"
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
                {hudPanel === "fleet" && "Fleet Statistics"}
                {hudPanel === "alerts" && "Live Alerts"}
                {hudPanel === "ports" && "Port Directory"}
              </p>
              <button onClick={() => setHudPanel(null)} className="rounded-md p-1 hover:bg-white/10">
                <X size={15} />
              </button>
            </div>

            {hudPanel === "fleet" ? (
              <div className="space-y-2 text-xs">
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
        {selectedShipDetail ? (
          <motion.aside
            initial={{ x: 360 }}
            animate={{ x: 0 }}
            exit={{ x: 360 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="absolute right-0 top-0 z-30 h-full w-[380px] border-l border-white/20 bg-slate-900/40 p-4 backdrop-blur-md"
          >
            <ShipDetailCard ship={selectedShipDetail} onClose={() => setSelectedShipId(null)} />
          </motion.aside>
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
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Distressed
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-white/15 bg-slate-900/65 px-4 py-2 text-xs text-white/80 backdrop-blur-md">
        <p className="flex items-center gap-2">
          <Navigation size={14} />
          Strait of Hormuz Tactical Layer
          <Waves size={14} />
        </p>
      </div>
    </div>
  );
}
