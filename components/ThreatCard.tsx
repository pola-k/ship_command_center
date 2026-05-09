"use client";

import { AlertTriangle, Fuel, MapPin, ShieldAlert, Wind } from "lucide-react";
import { useEffect, useState } from "react";
import type { FleetThreatShip } from "../app/data/threats";
import type { ThreatAnalysis } from "../app/lib/analyzeThreat";

type Props = {
  ship: FleetThreatShip;
  analysis: ThreatAnalysis;
  updatedAt: Date;
  onSelect?: () => void;
  selected?: boolean;
};

function tone(severity: ThreatAnalysis["severity"]) {
  switch (severity) {
    case "CRITICAL":
      return {
        ring: "ring-red-500/40",
        glow: "shadow-[0_0_0_1px_rgba(239,68,68,0.25),0_20px_60px_rgba(239,68,68,0.12)]",
        badge: "bg-red-500/15 text-red-200 ring-1 ring-red-500/30",
        header: "text-red-100",
        pulse: true,
      };
    case "HIGH":
      return {
        ring: "ring-orange-400/35",
        glow:
          "shadow-[0_0_0_1px_rgba(251,146,60,0.18),0_18px_55px_rgba(251,146,60,0.10)]",
        badge: "bg-orange-500/15 text-orange-200 ring-1 ring-orange-400/25",
        header: "text-orange-100",
        pulse: false,
      };
    case "MEDIUM":
      return {
        ring: "ring-amber-300/30",
        glow:
          "shadow-[0_0_0_1px_rgba(252,211,77,0.16),0_16px_45px_rgba(252,211,77,0.08)]",
        badge: "bg-amber-500/15 text-amber-200 ring-1 ring-amber-300/25",
        header: "text-amber-100",
        pulse: false,
      };
    default:
      return {
        ring: "ring-emerald-400/25",
        glow:
          "shadow-[0_0_0_1px_rgba(52,211,153,0.14),0_16px_40px_rgba(52,211,153,0.06)]",
        badge: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-300/20",
        header: "text-emerald-100",
        pulse: false,
      };
  }
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function ThreatCard({ ship, analysis, updatedAt, onSelect, selected }: Props) {
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setClientReady(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  const t = tone(analysis.severity);
  const riskBadges: Array<{ icon: React.ReactNode; label: string }> = [
    {
      icon: <Wind className="h-3.5 w-3.5" />,
      label: ship.weatherCondition,
    },
    {
      icon: <Fuel className="h-3.5 w-3.5" />,
      label: `Fuel ${ship.fuelLevel}%`,
    },
    ship.nearRestrictedZone
      ? {
          icon: <ShieldAlert className="h-3.5 w-3.5" />,
          label: "Restricted zone nearby",
        }
      : {
          icon: <MapPin className="h-3.5 w-3.5" />,
          label: "Open water",
        },
  ];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "group w-full text-left",
        "rounded-2xl p-[1px] ring-1 transition-all",
        selected ? "ring-cyan-300/40" : t.ring,
        selected ? "shadow-[0_0_0_1px_rgba(34,211,238,0.25),0_22px_70px_rgba(34,211,238,0.12)]" : t.glow,
      ].join(" ")}
    >
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-white/10 to-white/[0.04] px-4 py-4 backdrop-blur-xl">
        {t.pulse ? (
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute -inset-10 bg-[radial-gradient(circle_at_20%_0%,rgba(239,68,68,0.22),transparent_60%)]" />
            <div className="absolute inset-0 animate-[pulse_2.2s_ease-in-out_infinite] bg-red-500/5" />
          </div>
        ) : null}

        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={["inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide", t.badge].join(" ")}>
                <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                {analysis.severity} · {analysis.severityScore}/100
              </span>
              <span className="text-[11px] text-white/35">
                LIVE{" "}
                <span suppressHydrationWarning>
                  {clientReady ? fmtTime(updatedAt) : "--:--:--"}
                </span>
              </span>
            </div>
            <h3 className={["mt-2 text-base font-semibold tracking-tight", t.header].join(" ")}>
              {ship.shipName}
              <span className="ml-2 text-xs font-medium text-white/35">{ship.id}</span>
            </h3>
            <p className="mt-1 line-clamp-2 text-sm text-white/70">{ship.captainMessage}</p>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-1">
            <div className="text-xs font-medium text-white/50">Destination</div>
            <div className="text-sm font-semibold text-white/85">{ship.destination}</div>
            <div className="text-[11px] text-white/40">{ship.speed.toFixed(1)} kn</div>
          </div>
        </div>

        <div className="relative mt-4 flex flex-wrap gap-2">
          {riskBadges.map((b) => (
            <span
              key={b.label}
              className="inline-flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-[11px] text-white/70 ring-1 ring-white/10"
            >
              <span className="text-cyan-200/80">{b.icon}</span>
              {b.label}
            </span>
          ))}
        </div>

        <div className="relative mt-4 rounded-xl bg-black/25 p-3 ring-1 ring-white/10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">
                AI extracted issue
              </div>
              <div className="mt-1 text-sm font-semibold text-white/85">
                {analysis.extractedIssue}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">
                Status
              </div>
              <div className="mt-1 text-sm font-semibold text-white/80">
                {ship.status.replaceAll("_", " ")}
              </div>
            </div>
          </div>
          <div className="mt-3 text-sm text-white/70">
            <span className="text-white/45">Recommendation:</span>{" "}
            {analysis.recommendation}
          </div>
        </div>
      </div>
    </button>
  );
}

