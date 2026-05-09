"use client";

import * as React from "react";
import { Anchor, Bell, Compass, Droplet, Package, Ship, X } from "lucide-react";

import { UserAccountAvatar } from "./UserAccountAvatar";

export type ShipAlertBrief = {
  id: string;
  title: string;
  severity: number;
  type: string | null;
};

export type ShipDetail = {
  ship_id: string;
  name: string;
  status: string;
  speed_knots: number;
  heading_deg: number;
  fuel_tons: number | null;
  cargo_type: string | null;
  destination_port_id: string | null;
  destination_port_name: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  route_is_valid?: boolean | null;
  route_distance_m?: number | null;
  route_fuel_estimate_tons?: number | null;
  route_weather_cost_multiplier?: number | null;
  route_invalid_reason?: string | null;
  active_alerts?: ShipAlertBrief[];
};

function statusTone(status: string): "ok" | "warn" | "danger" | "muted" {
  if (status === "distressed") return "danger";
  if (status === "rerouting") return "warn";
  if (status === "stranded") return "danger";
  if (status === "normal") return "ok";
  return "muted";
}

function severityLabel(severity: number): string {
  if (severity >= 5) return "critical";
  if (severity === 4) return "high";
  if (severity === 3) return "medium";
  if (severity === 2) return "low";
  return "info";
}

export function ShipDetailCard({
  ship,
  onClose,
  showClose = true,
  onAcknowledgeAlert,
  commandFooter,
}: {
  ship: ShipDetail;
  onClose: () => void;
  /** Command can dismiss; captain bridge keeps detail pinned. */
  showClose?: boolean;
  onAcknowledgeAlert?: (alertId: string) => void;
  /** Extra actions for command (e.g. send order to captain). */
  commandFooter?: React.ReactNode;
}) {
  const destTitle =
    ship.destination_port_name && ship.destination_port_id
      ? `${ship.destination_port_name} (${ship.destination_port_id})`
      : ship.destination_port_name ?? ship.destination_port_id ?? "—";

  const destPosition =
    ship.destination_lat != null && ship.destination_lng != null
      ? `${ship.destination_lat.toFixed(4)}°, ${ship.destination_lng.toFixed(4)}°`
      : null;

  const alerts = ship.active_alerts ?? [];
  const topSeverity = alerts.length ? Math.max(...alerts.map((a) => a.severity)) : null;
  const rerouteHint = ship.route_is_valid === false;

  return (
    <div className="flex h-full w-full min-h-0 flex-col rounded-2xl border border-white/12 bg-gradient-to-b from-slate-900/70 to-slate-950/50 p-4 shadow-2xl backdrop-blur">
      <div className="flex shrink-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <UserAccountAvatar
            name={ship.name || ship.ship_id}
            subtitle={ship.ship_id}
            status={statusTone(ship.status)}
            size="lg"
          />
        </div>
        {showClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white/5 text-white/70 hover:bg-white/10"
            aria-label="Close ship detail"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {topSeverity !== null ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[10px] uppercase tracking-widest text-white/55">
          <span className="text-rose-300/90">Fleet risk</span>
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 font-semibold normal-case tracking-normal text-white">
            {severityLabel(topSeverity)} · S{topSeverity}
          </span>
          {rerouteHint ? (
            <span className="normal-case tracking-normal text-amber-200/90">Route replan in progress</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/80">
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Status</div>
          <div className="mt-1 flex items-start gap-2 text-sm font-semibold leading-snug text-white">
            <Ship size={16} className="mt-0.5 shrink-0 text-white/60" />
            <span className="break-words">{ship.status}</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Speed</div>
          <div className="mt-1 flex items-start gap-2 text-sm font-semibold leading-snug text-white">
            <Compass size={16} className="mt-0.5 shrink-0 text-white/60" />
            <span>{ship.speed_knots.toFixed(1)} kn</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Heading</div>
          <div className="mt-1 flex items-start gap-2 text-sm font-semibold leading-snug text-white">
            <Compass size={16} className="mt-0.5 shrink-0 text-white/60" />
            <span>{Math.round(ship.heading_deg)}°</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Fuel (onboard)</div>
          <div className="mt-1 flex items-start gap-2 text-sm font-semibold leading-snug text-white">
            <Droplet size={16} className="mt-0.5 shrink-0 text-white/60" />
            <span>{ship.fuel_tons == null ? "—" : `${Math.round(ship.fuel_tons)} t`}</span>
          </div>
        </div>
      </div>

      {(ship.route_fuel_estimate_tons != null || ship.route_distance_m != null) && (
        <div className="mt-4 rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-50/95">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/55">Latest route telemetry</div>
          <div className="mt-2 grid gap-2 text-xs text-white/85">
            {ship.route_distance_m != null ? (
              <p>
                Distance: <span className="font-semibold">{Math.round(ship.route_distance_m / 1000)} km</span>
              </p>
            ) : null}
            {ship.route_fuel_estimate_tons != null ? (
              <p>
                Fuel projection:{" "}
                <span className="font-semibold">{ship.route_fuel_estimate_tons.toFixed(1)} t</span>
              </p>
            ) : null}
            {ship.route_weather_cost_multiplier != null ? (
              <p>
                Weather cost factor:{" "}
                <span className="font-semibold">{ship.route_weather_cost_multiplier.toFixed(2)}×</span>
              </p>
            ) : null}
            {rerouteHint && ship.route_invalid_reason ? (
              <p className="text-[10px] text-amber-200/90">{ship.route_invalid_reason}</p>
            ) : null}
          </div>
        </div>
      )}

      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto text-xs">
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-white/85">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest text-white/45">
            <Anchor size={14} className="text-amber-300/80" />
            Destination
          </div>
          <p className="mt-2 break-words text-sm font-semibold leading-snug text-white">{destTitle}</p>
          {destPosition ? (
            <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-cyan-100/90">
              Position: {destPosition}
              <span className="ml-1 text-white/45">(lat, lng)</span>
            </p>
          ) : ship.destination_port_id ? (
            <p className="mt-1.5 text-white/50">Position unavailable for this port.</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-white/85">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest text-white/45">
            <Package size={14} className="text-sky-300/80" />
            Cargo
          </div>
          <p className="mt-2 break-words text-sm font-medium leading-snug text-white/90">
            {ship.cargo_type ?? "—"}
          </p>
        </div>

        {alerts.length > 0 ? (
          <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-3 text-white/90">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-white/50">
              <Bell size={14} className="text-rose-200/80" />
              Active alerts
            </div>
            <ul className="mt-2 space-y-2">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] leading-snug"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-white">{a.title}</p>
                    <span className="shrink-0 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[9px] text-white/70">
                      S{a.severity}
                    </span>
                  </div>
                  {a.type ? <p className="mt-1 text-[10px] text-white/55">{a.type}</p> : null}
                  {onAcknowledgeAlert ? (
                    <button
                      type="button"
                      onClick={() => onAcknowledgeAlert(a.id)}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-medium text-white/85 transition hover:bg-white/10"
                    >
                      Acknowledge
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {commandFooter ? (
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-950/20 px-3 py-3">
            {commandFooter}
          </div>
        ) : null}
      </div>
    </div>
  );
}
