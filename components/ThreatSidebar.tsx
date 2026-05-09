"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, Radar, Siren, Sparkles } from "lucide-react";
import type { FleetThreatShip } from "../app/data/threats";
import { analyzeThreat } from "../app/lib/analyzeThreat";
import { ThreatCard } from "./ThreatCard";

type Props = {
  ships: FleetThreatShip[];
  updatedAt: Date;
  selectedShipId: string | null;
  onSelectShip: (id: string) => void;
};

export function ThreatSidebar({
  ships,
  updatedAt,
  selectedShipId,
  onSelectShip,
}: Props) {
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setClientReady(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  const enriched = ships
    .map((s) => ({ ship: s, analysis: analyzeThreat(s) }))
    .sort((a, b) => b.analysis.severityScore - a.analysis.severityScore);

  const critical = enriched.filter((x) => x.analysis.severity === "CRITICAL").length;
  const high = enriched.filter((x) => x.analysis.severity === "HIGH").length;

  return (
    <aside className="h-full w-full">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200 ring-1 ring-cyan-300/20">
                <BrainCircuit className="h-4 w-4" />
                Threats
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs text-white/70 ring-1 ring-white/10">
                <Radar className="h-4 w-4 text-cyan-200/80" />
                Scan cycle:{" "}
                <span suppressHydrationWarning>
                  {clientReady
                    ? updatedAt.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "--:--:--"}
                </span>
              </span>
            </div>
            <div className="mt-3 text-sm text-white/70">
              Live fleet signals prioritized by AI severity score.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-300/20">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300/70 opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
              </span>
              LIVE
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-black/25 p-3 ring-1 ring-white/10">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/40">
              Critical
            </div>
            <div className="mt-1 flex items-center gap-2 text-xl font-semibold text-red-200">
              <Siren className="h-5 w-5" />
              {critical}
            </div>
          </div>
          <div className="rounded-2xl bg-black/25 p-3 ring-1 ring-white/10">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/40">
              High
            </div>
            <div className="mt-1 flex items-center gap-2 text-xl font-semibold text-orange-200">
              <Sparkles className="h-5 w-5" />
              {high}
            </div>
          </div>
          <div className="rounded-2xl bg-black/25 p-3 ring-1 ring-white/10">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/40">
              Total
            </div>
            <div className="mt-1 text-xl font-semibold text-white/85">{ships.length}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3 overflow-auto pr-1 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin]">
        {enriched.map(({ ship, analysis }) => (
          <ThreatCard
            key={ship.id}
            ship={ship}
            analysis={analysis}
            updatedAt={updatedAt}
            selected={selectedShipId === ship.id}
            onSelect={() => onSelectShip(ship.id)}
          />
        ))}
      </div>
    </aside>
  );
}

