"use client";

import * as React from "react";
import { Anchor, Compass, Droplet, Package, Ship, X } from "lucide-react";
import { UserAccountAvatar } from "./UserAccountAvatar";

export type ShipDetail = {
  ship_id: string;
  name: string;
  status: string;
  speed_knots: number;
  heading_deg: number;
  fuel_tons: number | null;
  cargo_type: string | null;
  destination_port_id: string | null;
  /** Resolved from ports table when destination_port_id is set */
  destination_port_name: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
};

function statusTone(status: string): "ok" | "warn" | "danger" | "muted" {
  if (status === "distressed") return "danger";
  if (status === "rerouting") return "warn";
  if (status === "normal") return "ok";
  return "muted";
}

export function ShipDetailCard({
  ship,
  onClose,
  showClose = true,
}: {
  ship: ShipDetail;
  onClose: () => void;
  /** Command can dismiss; captain bridge keeps detail pinned. */
  showClose?: boolean;
}) {
  const destTitle =
    ship.destination_port_name && ship.destination_port_id
      ? `${ship.destination_port_name} (${ship.destination_port_id})`
      : ship.destination_port_name ?? ship.destination_port_id ?? "—";

  const destPosition =
    ship.destination_lat != null && ship.destination_lng != null
      ? `${ship.destination_lat.toFixed(4)}°, ${ship.destination_lng.toFixed(4)}°`
      : null;

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
          <div className="text-[10px] uppercase tracking-widest text-white/40">Fuel</div>
          <div className="mt-1 flex items-start gap-2 text-sm font-semibold leading-snug text-white">
            <Droplet size={16} className="mt-0.5 shrink-0 text-white/60" />
            <span>{ship.fuel_tons == null ? "—" : `${Math.round(ship.fuel_tons)} t`}</span>
          </div>
        </div>
      </div>

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
      </div>
    </div>
  );
}

