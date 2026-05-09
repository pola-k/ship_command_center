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
import {
  boundingBox,
  initialFleet,
  navigableWater,
  ports,
  rocks,
  ShipState,
} from "../lib/tacticalScenario";

type HudPanel = "fleet" | "alerts" | "ports" | null;

type AlertItem = {
  shipId: string;
  shipName: string;
  rockName: string;
  distanceKm: number;
};

function degToRad(value: number) {
  return (value * Math.PI) / 180;
}

function haversineKm(a: [number, number], b: [number, number]) {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const r = 6371;
  const dLat = degToRad(lat2 - lat1);
  const dLon = degToRad(lon2 - lon1);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(s1 + s2));
}

function clampToBounds(point: [number, number]): [number, number] {
  return [
    Math.max(boundingBox.south, Math.min(boundingBox.north, point[0])),
    Math.max(boundingBox.west, Math.min(boundingBox.east, point[1])),
  ];
}

function advanceShip(ship: ShipState, deltaSec: number): ShipState {
  const distanceNm = (ship.speed / 3600) * deltaSec;
  const h = degToRad(ship.heading);
  const latRad = degToRad(ship.position[0]);

  const dLatDeg = (distanceNm * Math.cos(h)) / 60;
  const dLngDeg = (distanceNm * Math.sin(h)) / (60 * Math.max(0.25, Math.cos(latRad)));

  const nextPos = clampToBounds([ship.position[0] + dLatDeg, ship.position[1] + dLngDeg]);

  let nextHeading = ship.heading;
  if (nextPos[0] === boundingBox.south || nextPos[0] === boundingBox.north) {
    nextHeading = (180 - nextHeading + 360) % 360;
  }
  if (nextPos[1] === boundingBox.west || nextPos[1] === boundingBox.east) {
    nextHeading = (360 - nextHeading) % 360;
  }

  return {
    ...ship,
    position: nextPos,
    heading: nextHeading,
    fuel: Math.max(0, ship.fuel - deltaSec * 0.025),
  };
}

function fleetToGeoJson(fleet: ShipState[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: fleet.map((ship) => ({
      type: "Feature",
      properties: {
        shipId: ship.shipId,
        name: ship.name,
        speed: ship.speed,
        heading: ship.heading,
        destination: ship.destination,
        fuel: ship.fuel,
        cargo: ship.cargo,
        status: ship.status,
      },
      geometry: {
        type: "Point",
        coordinates: [ship.position[1], ship.position[0]],
      },
    })),
  };
}

function computeStatus(ship: ShipState, nearHazardKm: number): ShipState["status"] {
  if (ship.fuel < 1000 || nearHazardKm <= 2) return "distress";
  if (nearHazardKm <= 8 || ship.fuel < 2000) return "warning";
  return "normal";
}

const bounds: LngLatBoundsLike = [
  [boundingBox.west, boundingBox.south],
  [boundingBox.east, boundingBox.north],
];

export default function TacticalMap() {
  const mapRef = useRef<MlMap | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [fleet, setFleet] = useState<ShipState[]>(initialFleet);
  const fleetRef = useRef<ShipState[]>(initialFleet);
  const [selectedShipId, setSelectedShipId] = useState<string | null>(null);
  const [hudPanel, setHudPanel] = useState<HudPanel>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [hoverCard, setHoverCard] = useState<{
    x: number;
    y: number;
    shipId: string;
    speed: number;
    status: ShipState["status"];
  } | null>(null);
  const pulsePhaseRef = useRef(0);

  const selectedShip = useMemo(
    () => fleet.find((ship) => ship.shipId === selectedShipId) ?? null,
    [fleet, selectedShipId]
  );

  const alerts = useMemo(() => {
    const nextAlerts: AlertItem[] = [];
    for (const ship of fleet) {
      for (const rock of rocks) {
        const d = haversineKm(ship.position, rock.position);
        if (d <= 18) {
          nextAlerts.push({
            shipId: ship.shipId,
            shipName: ship.name,
            rockName: rock.name,
            distanceKm: Number(d.toFixed(1)),
          });
        }
      }
    }
    nextAlerts.sort((a, b) => a.distanceKm - b.distanceKm);
    return nextAlerts.slice(0, 8);
  }, [fleet]);

  const distressShipIds = useMemo(() => {
    const ids = new Set<string>();
    for (const alert of alerts) {
      if (alert.distanceKm <= 2) ids.add(alert.shipId);
    }
    for (const ship of fleet) {
      if (ship.fuel < 1000) ids.add(ship.shipId);
    }
    return ids;
  }, [alerts, fleet]);

  const fleetStatusCounts = useMemo(() => {
    let normal = 0;
    let warning = 0;
    let distress = 0;
    for (const ship of fleet) {
      const nearest = rocks
        .map((rock) => haversineKm(ship.position, rock.position))
        .sort((a, b) => a - b)[0];
      const status = computeStatus(ship, nearest ?? 999);
      if (status === "normal") normal += 1;
      if (status === "warning") warning += 1;
      if (status === "distress") distress += 1;
    }
    return { normal, warning, distress };
  }, [fleet]);

  const portById = useMemo(() => {
    const m = new Map<string, (typeof ports)[number]>();
    for (const port of ports) m.set(port.id, port);
    return m;
  }, []);

  useEffect(() => {
    fleetRef.current = fleet;
  }, [fleet]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#2d4a2f" } }],
      },
      center: [54.5, 26.2],
      zoom: 5.6,
      minZoom: 5.2,
      maxZoom: 8.8,
      maxBounds: bounds,
      attributionControl: false,
      cooperativeGestures: true,
    });

    mapRef.current = map;

    map.on("load", () => {
      const waterCoords = navigableWater.map(([lat, lng]) => [lng, lat]);

      const hatchFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
      const step = 0.7;
      for (let lat = boundingBox.south - 1; lat <= boundingBox.north + 1; lat += step) {
        hatchFeatures.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [boundingBox.west - 1, lat],
              [boundingBox.east + 1, lat + 1.1],
            ],
          },
        });
      }
      for (let lng = boundingBox.west - 1; lng <= boundingBox.east + 1; lng += step * 1.5) {
        hatchFeatures.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [lng, boundingBox.south - 1],
              [lng + 1.1, boundingBox.north + 1],
            ],
          },
        });
      }

      map.addSource("land-hatch", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: hatchFeatures,
        },
      });
      map.addLayer({
        id: "land-hatch",
        type: "line",
        source: "land-hatch",
        paint: {
          "line-color": "#486a41",
          "line-opacity": 0.22,
          "line-width": 1,
        },
      });

      map.addSource("water", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [waterCoords],
          },
        },
      });
      map.addLayer({
        id: "water-fill",
        type: "fill",
        source: "water",
        paint: {
          "fill-color": "#1a365d",
          "fill-opacity": 0.78,
        },
      });
      map.addLayer({
        id: "water-depth",
        type: "fill",
        source: "water",
        paint: {
          "fill-color": "#1d4b73",
          "fill-opacity": 0.24,
        },
      });
      map.addLayer({
        id: "water-outline",
        type: "line",
        source: "water",
        paint: {
          "line-color": "#58c7ee",
          "line-opacity": 0.36,
          "line-width": 1.5,
        },
      });

      map.addSource("ports", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: ports.map((port) => ({
            type: "Feature",
            properties: { id: port.id, name: port.name },
            geometry: { type: "Point", coordinates: [port.position[1], port.position[0]] },
          })),
        },
      });
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
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
        },
        paint: { "text-color": "#f8fafc", "text-halo-color": "#022338", "text-halo-width": 1.2 },
      });

      map.addSource("rocks", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: rocks.map((rock) => ({
            type: "Feature",
            properties: { id: rock.id, name: rock.name },
            geometry: { type: "Point", coordinates: [rock.position[1], rock.position[0]] },
          })),
        },
      });
      map.addLayer({
        id: "rocks-ring",
        type: "circle",
        source: "rocks",
        paint: {
          "circle-color": "#ef4444",
          "circle-opacity": 0.12,
          "circle-radius": 11,
          "circle-stroke-color": "#fca5a5",
          "circle-stroke-width": 1.2,
        },
      });
      map.addLayer({
        id: "rocks",
        type: "symbol",
        source: "rocks",
        layout: {
          "text-field": "▲",
          "text-size": 15,
        },
        paint: { "text-color": "#f87171" },
      });

      map.addSource("ships", { type: "geojson", data: fleetToGeoJson(fleetRef.current) });
      map.addLayer({
        id: "ship-ring",
        type: "circle",
        source: "ships",
        paint: {
          "circle-color": "#38bdf8",
          "circle-radius": 7,
          "circle-opacity": 0.25,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#7dd3fc",
        },
      });
      map.addSource("ship-pulse", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
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
      map.addLayer({
        id: "ship-heading",
        type: "symbol",
        source: "ships",
        layout: {
          "text-field": "➤",
          "text-size": 18,
          "text-rotate": ["get", "heading"],
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#e2e8f0" },
      });

      map.addSource("selected-route", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
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

      map.on("click", "ship-heading", (e) => {
        const shipId = e.features?.[0]?.properties?.shipId as string | undefined;
        if (shipId) setSelectedShipId(shipId);
      });
      map.on("mousemove", "ship-heading", (e) => {
        const feature = e.features?.[0];
        if (!feature?.properties) return;
        const p = feature.properties as { shipId: string; speed: number; status: ShipState["status"] };
        setHoverCard({
          x: e.point.x,
          y: e.point.y,
          shipId: p.shipId,
          speed: Number(p.speed),
          status: p.status,
        });
      });
      map.on("mouseenter", "ship-heading", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "ship-heading", () => {
        map.getCanvas().style.cursor = "";
        setHoverCard(null);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;

      const nextFleet = fleetRef.current.map((ship) => {
        const moved = advanceShip(ship, dt);
        const nearest = rocks
          .map((rock) => haversineKm(moved.position, rock.position))
          .sort((a, b) => a - b)[0];
        return { ...moved, status: computeStatus(moved, nearest ?? 999) };
      });
      fleetRef.current = nextFleet;
      setFleet(nextFleet);

      const source = mapRef.current?.getSource("ships") as GeoJSONSource | undefined;
      if (source) source.setData(fleetToGeoJson(nextFleet));

      const pulseSource = mapRef.current?.getSource("ship-pulse") as GeoJSONSource | undefined;
      if (pulseSource) {
        pulseSource.setData({
          type: "FeatureCollection",
          features: nextFleet
            .filter((ship) => distressShipIds.has(ship.shipId))
            .map((ship) => ({
              type: "Feature" as const,
              properties: {},
              geometry: {
                type: "Point" as const,
                coordinates: [ship.position[1], ship.position[0]],
              },
            })),
        });
      }
      if (mapRef.current?.getLayer("ship-pulse-ring")) {
        pulsePhaseRef.current += dt * 2.8;
        const wave = 10 + (Math.sin(pulsePhaseRef.current) + 1) * 4;
        const op = 0.18 + (Math.sin(pulsePhaseRef.current) + 1) * 0.15;
        mapRef.current.setPaintProperty("ship-pulse-ring", "circle-radius", wave);
        mapRef.current.setPaintProperty("ship-pulse-ring", "circle-opacity", op);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [distressShipIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;

    const routeSource = map.getSource("selected-route") as GeoJSONSource | undefined;
    if (!routeSource) return;

    if (!selectedShip) {
      routeSource.setData({ type: "FeatureCollection", features: [] });
      map.easeTo({ padding: { left: 0, right: 0, top: 0, bottom: 0 }, duration: 350 });
      return;
    }

    const destinationPort = portById.get(selectedShip.destination);
    if (!destinationPort) return;

    routeSource.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [selectedShip.position[1], selectedShip.position[0]],
              [destinationPort.position[1], destinationPort.position[0]],
            ],
          },
        },
      ],
    });
    map.easeTo({
      center: [selectedShip.position[1], selectedShip.position[0]],
      duration: 420,
      padding: { left: 90, right: 350, top: 90, bottom: 90 },
    });
  }, [selectedShip, portById]);

  function statusTone(status: ShipState["status"]) {
    if (status === "distress") return "text-red-200 border-red-400/40 bg-red-500/15";
    if (status === "warning") return "text-amber-100 border-amber-400/40 bg-amber-500/15";
    return "text-cyan-100 border-cyan-400/30 bg-cyan-500/10";
  }

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
                  Active Ships: <span className="font-semibold">{fleet.length}</span>
                </div>
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2">
                  Normal: <span className="font-semibold">{fleetStatusCounts.normal}</span>
                </div>
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2">
                  Warning: <span className="font-semibold">{fleetStatusCounts.warning}</span>
                </div>
                <div className="rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2">
                  Distress: <span className="font-semibold">{fleetStatusCounts.distress}</span>
                </div>
              </div>
            ) : null}

            {hudPanel === "alerts" ? (
              <div className="space-y-2 text-xs">
                {alerts.length === 0 ? (
                  <p className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-emerald-100">
                    No active geofence/proximity warnings.
                  </p>
                ) : (
                  alerts.map((alert) => (
                    <div
                      key={`${alert.shipId}-${alert.rockName}`}
                      className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-100"
                    >
                      {alert.shipName} near {alert.rockName} ({alert.distanceKm} km)
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {hudPanel === "ports" ? (
              <div className="max-h-80 space-y-2 overflow-auto pr-1 text-xs">
                {ports.map((port) => (
                  <div key={port.id} className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">
                    <p className="font-semibold text-white">{port.name}</p>
                    <p className="text-white/70">{port.id}</p>
                    <p className="text-white/70">
                      [{port.position[0].toFixed(2)}, {port.position[1].toFixed(2)}]
                    </p>
                  </div>
                ))}
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
            <p>Speed: {Math.round(hoverCard.speed)} kn</p>
            <p>Status: {hoverCard.status}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {selectedShip ? (
          <motion.aside
            initial={{ x: 360 }}
            animate={{ x: 0 }}
            exit={{ x: 360 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="absolute right-0 top-0 z-30 h-full w-[340px] border-l border-white/20 bg-slate-900/65 p-4 text-white backdrop-blur-md"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide">Ship Detail</h2>
              <button
                onClick={() => setSelectedShipId(null)}
                className="rounded-md p-1 hover:bg-white/10"
              >
                <X size={15} />
              </button>
            </div>
            <div className="space-y-2 text-sm text-white/85">
              <p className="text-lg font-semibold text-white">{selectedShip.name}</p>
              <p>Ship ID: {selectedShip.shipId}</p>
              <p>Cargo: {selectedShip.cargo}</p>
              <p>Fuel: {Math.round(selectedShip.fuel)} tons</p>
              <p>Destination: {selectedShip.destination}</p>
              <p>Speed: {selectedShip.speed} knots</p>
              <p>Heading: {Math.round(selectedShip.heading)}°</p>
              <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${statusTone(selectedShip.status)}`}>
                Operational Status: {selectedShip.status.toUpperCase()}
              </div>
            </div>
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
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" /> Warning / Rerouting
              </p>
              <p className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Distress / Proximity
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

