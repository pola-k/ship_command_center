"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  CloudLightning,
  Shield,
  Ship as ShipIcon,
  TriangleAlert,
} from "lucide-react";
import type { FleetThreatShip } from "../app/data/threats";
import { analyzeThreat } from "../app/lib/analyzeThreat";

type Props = {
  ships: FleetThreatShip[];
  updatedAt: Date;
};

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  tone: "cyan" | "red" | "orange" | "emerald";
  icon: React.ReactNode;
}) {
  const toneClasses =
    tone === "red"
      ? "from-red-500/15 to-red-500/5 ring-red-500/25 text-red-100"
      : tone === "orange"
        ? "from-orange-500/15 to-orange-500/5 ring-orange-500/25 text-orange-100"
        : tone === "emerald"
          ? "from-emerald-500/15 to-emerald-500/5 ring-emerald-500/25 text-emerald-100"
          : "from-cyan-500/15 to-cyan-500/5 ring-cyan-500/25 text-cyan-100";

  return (
    <div
      className={[
        "rounded-3xl bg-gradient-to-b p-4 ring-1 shadow-[0_18px_60px_rgba(0,0,0,0.32)]",
        toneClasses,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
            {label}
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
        </div>
        <div className="rounded-2xl bg-black/25 p-3 ring-1 ring-white/10 text-white/80">
          {icon}
        </div>
      </div>
    </div>
  );
}

export function FleetOverview({ ships, updatedAt }: Props) {
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setClientReady(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  const analyses = ships.map((s) => analyzeThreat(s));
  const critical = analyses.filter((a) => a.severity === "CRITICAL").length;
  const high = analyses.filter((a) => a.severity === "HIGH").length;
  const danger = critical + high;
  const adverseWeather = ships.filter((s) =>
    ["Thunderstorm", "Gale", "Sandstorm", "HeavyRain"].includes(s.weatherCondition)
  ).length;

  return (
    <section className="h-full w-full space-y-4">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs text-white/75 ring-1 ring-white/10">
              <Activity className="h-4 w-4 text-cyan-200/80" />
              Fleet telemetry sync
              <span className="ml-1 text-white/45" suppressHydrationWarning>
                {clientReady
                  ? updatedAt.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : "--:--:--"}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-white/90">
              Fleet Overview
            </h2>
            <p className="mt-1 text-sm text-white/60">
              Strait ops view — threat posture, weather, and restricted-zone risk.
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200 ring-1 ring-cyan-300/20">
              <Shield className="h-4 w-4" />
              Command Only
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total ships"
          value={ships.length}
          tone="cyan"
          icon={<ShipIcon className="h-5 w-5" />}
        />
        <StatCard
          label="Ships in danger"
          value={danger}
          tone={danger > 0 ? "orange" : "emerald"}
          icon={<TriangleAlert className="h-5 w-5" />}
        />
        <StatCard
          label="Critical alerts"
          value={critical}
          tone={critical > 0 ? "red" : "emerald"}
          icon={<TriangleAlert className="h-5 w-5" />}
        />
        <StatCard
          label="Adverse weather"
          value={adverseWeather}
          tone={adverseWeather > 0 ? "orange" : "emerald"}
          icon={<CloudLightning className="h-5 w-5" />}
        />
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white/85">Operational map</div>
          <div className="text-xs text-white/45">Map placeholder (MVP)</div>
        </div>
        <div className="mt-3 relative h-[520px] overflow-hidden rounded-2xl bg-gradient-to-b from-cyan-500/10 to-black/30 ring-1 ring-white/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(34,211,238,0.22),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_40%,rgba(59,130,246,0.16),transparent_60%)]" />
          <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="relative p-5">
            <div className="flex items-center justify-between">
              <div className="text-xs text-white/55">
                Tracking: <span className="font-semibold text-white/80">{ships.length}</span>{" "}
                vessels
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-black/30 px-3 py-1 text-xs text-white/70 ring-1 ring-white/10">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300/70 opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-300" />
                </span>
                LIVE FEED
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {ships.slice(0, 15).map((s) => {
                const a = analyzeThreat(s);
                const dot =
                  a.severity === "CRITICAL"
                    ? "bg-red-400"
                    : a.severity === "HIGH"
                      ? "bg-orange-300"
                      : a.severity === "MEDIUM"
                        ? "bg-amber-300"
                        : "bg-emerald-300";
                return (
                  <div key={s.id} className="rounded-2xl bg-black/25 px-3 py-2 ring-1 ring-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-white/85">
                        {s.shipName}
                      </div>
                      <span className={["h-2.5 w-2.5 rounded-full", dot].join(" ")} />
                    </div>
                    <div className="mt-1 text-[11px] text-white/45">
                      {s.destination}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

