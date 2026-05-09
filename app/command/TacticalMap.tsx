"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { GeoJSONSource, LngLatBoundsLike, Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  boundingBox,
  initialFleet,
  navigableWater,
  ports,
  rocks,
  ShipState,
} from "../lib/tacticalScenario";

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

const bounds: LngLatBoundsLike = [
  [boundingBox.west, boundingBox.south],
  [boundingBox.east, boundingBox.north],
];

export default function TacticalMap() {
  const mapRef = useRef<Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [fleet, setFleet] = useState<ShipState[]>(initialFleet);
  const fleetRef = useRef<ShipState[]>(initialFleet);
  const [selectedShipId, setSelectedShipId] = useState<string>(initialFleet[0].shipId);

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
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#031b28" } }],
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
      map.addSource("water", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [navigableWater.map(([lat, lng]) => [lng, lat])],
          },
        },
      });
      map.addLayer({
        id: "water-fill",
        type: "fill",
        source: "water",
        paint: {
          "fill-color": "#0c3b56",
          "fill-opacity": 0.48,
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

      map.on("click", "ship-heading", (e) => {
        const shipId = e.features?.[0]?.properties?.shipId as string | undefined;
        if (shipId) setSelectedShipId(shipId);
      });
      map.on("mouseenter", "ship-heading", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "ship-heading", () => {
        map.getCanvas().style.cursor = "";
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

      const nextFleet = fleetRef.current.map((ship) => advanceShip(ship, dt));
      fleetRef.current = nextFleet;
      setFleet(nextFleet);

      const source = mapRef.current?.getSource("ships") as GeoJSONSource | undefined;
      if (source) source.setData(fleetToGeoJson(nextFleet));

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)_330px]">
      <aside className="glass-surface rounded-2xl p-4">
        <h2 className="text-sm font-semibold tracking-wide text-white">Fleet Summary</h2>
        <div className="mt-3 space-y-2">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
            Active Ships: <span className="font-semibold text-white">{fleet.length}</span>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
            Ports Tracked: <span className="font-semibold text-white">{ports.length}</span>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
            Hazard Nodes: <span className="font-semibold text-white">{rocks.length}</span>
          </div>
        </div>
      </aside>

      <section className="relative overflow-hidden rounded-2xl border border-white/10">
        <div ref={mapContainerRef} className="h-full w-full" />
      </section>

      <aside className="glass-surface rounded-2xl p-4">
        <h2 className="text-sm font-semibold tracking-wide text-white">Ship Detail</h2>
        {selectedShip ? (
          <div className="mt-3 space-y-2 text-xs text-white/75">
            <p className="text-base font-semibold text-white">{selectedShip.name}</p>
            <p>Ship ID: {selectedShip.shipId}</p>
            <p>Destination: {selectedShip.destination}</p>
            <p>Cargo: {selectedShip.cargo}</p>
            <p>Speed: {selectedShip.speed} knots</p>
            <p>Heading: {Math.round(selectedShip.heading)}°</p>
            <p>Fuel: {Math.round(selectedShip.fuel)} tons</p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-white/60">Select a ship from the map.</p>
        )}

        <h3 className="mt-6 text-sm font-semibold tracking-wide text-white">Proximity Alerts</h3>
        <div className="mt-2 space-y-2">
          {alerts.length === 0 ? (
            <p className="text-xs text-emerald-300/90">No immediate hazard warnings.</p>
          ) : (
            alerts.map((alert) => (
              <div
                key={`${alert.shipId}-${alert.rockName}`}
                className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100"
              >
                {alert.shipName} near {alert.rockName} ({alert.distanceKm} km)
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

