"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bell,
  BrainCircuit,
  List,
  Radio,
  Ship,
  ShieldAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createCriticalCaptainOrder,
  fetchLatestDirectiveTextByShipIds,
} from "@/app/lib/directiveOrders";
import type { ShipIntel } from "@/app/data/ships";
import { supabase } from "@/lib/supabaseClient";
import { SendCaptainOrderModal } from "@/components/SendCaptainOrderModal";
import {
  analyzeShipThreat,
  type DistressLevel,
  type ShipThreatAnalysis,
} from "@/app/lib/analyzeShipThreat";

export type TacticalMapSlotExtras = {
  /** Call after a command directive is stored so Threat NLP refreshes from Supabase. */
  onCommandDirectiveSent: () => void;
};

type Props = {
  ships: ShipIntel[];
  /** Extra classes on the invisible full-screen hit layer (e.g. z-index). */
  className?: string;
  /** When set, enables “bridge alert” to ship captains (matches `ships.id` e.g. MV-1). */
  commandUserId?: string | null;
  /**
   * When set, the threat launcher is passed here; return your tactical map (or other layout)
   * with `leadingRail={threatLauncher}` so the button aligns with Zone Architect / HUD.
   */
  renderTacticalMap?: (
    threatLauncher: ReactNode,
    extras: TacticalMapSlotExtras
  ) => ReactNode;
};

const distressStyles: Record<
  DistressLevel,
  { badge: string; glow: string; label: string }
> = {
  LOW: {
    badge: "bg-cyan-500/15 text-cyan-100 ring-cyan-400/35",
    glow: "border-white/15 shadow-none",
    label: "LOW",
  },
  MEDIUM: {
    badge: "bg-amber-500/15 text-amber-100 ring-amber-400/40",
    glow: "border-amber-400/25 shadow-[0_0_24px_rgba(251,191,36,0.12)]",
    label: "MEDIUM",
  },
  HIGH: {
    badge: "bg-orange-500/20 text-orange-100 ring-orange-400/50",
    glow: "border-orange-400/40 shadow-[0_0_28px_rgba(249,115,22,0.2)]",
    label: "HIGH",
  },
  CRITICAL: {
    badge: "bg-red-600/25 text-red-100 ring-red-500/60 animate-pulse",
    glow: "border-red-500/55 shadow-[0_0_32px_rgba(239,68,68,0.35)] animate-pulse",
    label: "CRITICAL",
  },
};

function RiskBar({ value, accent }: { value: number; accent: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/40 ring-1 ring-white/10">
      <motion.div
        className={`h-full rounded-full ${accent}`}
        initial={{ width: 0 }}
        animate={{ width: `${v}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
    </div>
  );
}

/** Compact left control + floating card — does not use a full-height sidebar bar. */
export default function ThreatPanel({
  ships,
  className = "",
  commandUserId = null,
  renderTacticalMap,
}: Props) {
  const [scanTick, setScanTick] = useState(0);
  const [directiveEpoch, setDirectiveEpoch] = useState(0);
  const [directiveByShip, setDirectiveByShip] = useState<
    Record<string, { title: string; instruction: string }>
  >({});
  const [clientReady, setClientReady] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedShipId, setSelectedShipId] = useState<string | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTarget, setAlertTarget] = useState<ShipIntel | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setClientReady(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setScanTick((n) => n + 1);
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!commandUserId) {
      setDirectiveByShip({});
      return;
    }
    let cancelled = false;
    async function run() {
      try {
        const ids = ships.map((s) => s.id);
        const map = await fetchLatestDirectiveTextByShipIds(supabase, ids);
        if (!cancelled) setDirectiveByShip(map);
      } catch {
        if (!cancelled) setDirectiveByShip({});
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [commandUserId, ships, directiveEpoch]);

  const rows = useMemo(() => {
    return ships
      .map((ship) => ({
        ship,
        analysis: analyzeShipThreat(
          ship,
          directiveByShip[ship.id] ?? null
        ),
      }))
      .sort((a, b) => b.analysis.overallRisk - a.analysis.overallRisk);
  }, [ships, scanTick, directiveByShip]);

  const selectedRow = useMemo(
    () => rows.find((r) => r.ship.id === selectedShipId) ?? null,
    [rows, selectedShipId]
  );

  function togglePanel() {
    setPanelOpen((open) => {
      if (open) setSelectedShipId(null);
      return !open;
    });
  }

  function closePanel() {
    setPanelOpen(false);
    setSelectedShipId(null);
    setAlertOpen(false);
    setAlertTarget(null);
  }

  function openBridgeAlert(ship: ShipIntel) {
    if (!commandUserId) return;
    setAlertTarget(ship);
    setAlertOpen(true);
  }

  const threatLauncher = (
    <button
      type="button"
      onClick={togglePanel}
      aria-expanded={panelOpen}
      aria-controls="ai-threat-floating-panel"
      title="Threats"
      className={`btn-glow flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border text-cyan-100 backdrop-blur-md transition hover:bg-slate-800/75 ${
        panelOpen
          ? "border-cyan-400/50 bg-cyan-500/25 shadow-[0_0_18px_rgba(34,211,238,0.35)]"
          : "border-white/20 bg-slate-900/70"
      }`}
    >
      <BrainCircuit size={18} strokeWidth={2} aria-hidden />
    </button>
  );

  const launcherWrap = (
    <div className="pointer-events-auto shrink-0">{threatLauncher}</div>
  );

  return (
    <>
      {renderTacticalMap ? (
        renderTacticalMap(launcherWrap, {
          onCommandDirectiveSent: () => setDirectiveEpoch((n) => n + 1),
        })
      ) : (
        <div className={`pointer-events-none absolute inset-0 z-[21] ${className}`}>
          <div className="pointer-events-auto absolute left-4 top-1/2 z-[21] -translate-y-[calc(50%+6.75rem)]">
            {launcherWrap}
          </div>
        </div>
      )}

      <div className={`pointer-events-none absolute inset-0 z-[21] ${className}`}>
      <AnimatePresence>
        {panelOpen ? (
          <motion.div
            key="ai-panel"
            id="ai-threat-floating-panel"
            role="dialog"
            aria-label="Threats"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="pointer-events-auto absolute left-[4.25rem] top-1/2 z-[21] flex max-h-[min(85vh,780px)] w-[min(390px,calc(100vw-5.5rem))] -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/20 bg-[#050d14]/95 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl"
          >
            <header className="shrink-0 border-b border-white/10 bg-gradient-to-b from-cyan-950/50 to-transparent px-3 py-3 sm:px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-cyan-200/90">
                    <BrainCircuit className="h-4 w-4 shrink-0" aria-hidden />
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/90 sm:text-xs">
                      Threats
                    </h2>
                  </div>
                  <p className="mt-0.5 text-[10px] font-medium text-cyan-100/55 sm:text-xs">
                    Live Fleet Risk Analysis
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closePanel}
                  className="shrink-0 rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close panel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/30 sm:text-[10px]">
                  <span
                    className={`relative flex h-1.5 w-1.5 ${clientReady ? "animate-pulse" : ""}`}
                  >
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  </span>
                  Live AI
                </div>
                {commandUserId ? (
                  <button
                    type="button"
                    onClick={() => {
                      const ship =
                        selectedRow?.ship ??
                        rows[0]?.ship ??
                        null;
                      if (ship) openBridgeAlert(ship);
                    }}
                    title={
                      selectedRow
                        ? `Send bridge alert: ${selectedRow.ship.shipName}`
                        : "Send bridge alert (uses top-risk vessel)"
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-100 ring-1 ring-amber-400/25 hover:bg-amber-500/25 sm:text-[10px]"
                  >
                    <Bell className="h-3 w-3" aria-hidden />
                    Alert
                  </button>
                ) : null}
                <div className="flex items-center gap-1.5 text-[9px] text-white/40 sm:text-[10px]">
                  <Radio className="h-3 w-3 shrink-0 text-cyan-300/70" />
                  <span suppressHydrationWarning>
                    #{scanTick + 1}
                    {clientReady
                      ? ` · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                      : ""}
                  </span>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              {selectedRow ? (
                <div className="flex min-h-0 flex-col">
                  <div className="shrink-0 border-b border-white/10 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setSelectedShipId(null)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-cyan-200/90 transition hover:bg-white/10 sm:text-xs"
                    >
                      <Ship
                        className="h-4 w-4 shrink-0 -scale-x-100"
                        strokeWidth={2}
                        aria-hidden
                      />
                      Fleet roster
                    </button>
                  </div>
                  <div className="p-3">
                    <ThreatShipDetail
                      ship={selectedRow.ship}
                      analysis={selectedRow.analysis}
                    />
                    {commandUserId ? (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => openBridgeAlert(selectedRow.ship)}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/15 py-2.5 text-[11px] font-bold text-amber-100 hover:bg-amber-500/25"
                        >
                          <Bell className="h-4 w-4" aria-hidden />
                          Send bridge alert to captain
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="p-3">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                    <List className="h-3.5 w-3.5 text-cyan-400/70" />
                    Select a vessel
                  </div>
                  <ul className="flex flex-col gap-1.5 pb-2">
                    {rows.map(({ ship, analysis }) => (
                      <li key={ship.id} className="list-none">
                        <div className="flex items-stretch gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedShipId(ship.id)}
                            className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left transition hover:scale-[1.01] hover:border-cyan-400/30 hover:bg-white/[0.07]"
                          >
                            <span
                              className={`h-9 w-1 shrink-0 rounded-full ${
                                analysis.distressLevel === "CRITICAL"
                                  ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]"
                                  : analysis.distressLevel === "HIGH"
                                    ? "bg-orange-500"
                                    : analysis.distressLevel === "MEDIUM"
                                      ? "bg-amber-400"
                                      : "bg-cyan-500/60"
                              }`}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-white group-hover:text-cyan-100">
                                {ship.shipName}
                              </p>
                              <p className="truncate text-[10px] text-white/40">
                                {ship.id} · {ship.cargo}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[9px] font-bold ring-1 ${distressStyles[analysis.distressLevel].badge}`}
                              >
                                {distressStyles[analysis.distressLevel].label}
                              </span>
                              <p className="mt-1 font-mono text-[11px] text-cyan-200/80">
                                {analysis.overallRisk}
                              </p>
                            </div>
                          </button>
                          {commandUserId ? (
                            <button
                              type="button"
                              onClick={() => openBridgeAlert(ship)}
                              title={`Bridge alert: ${ship.shipName}`}
                              className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/35 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                              aria-label={`Send bridge alert to ${ship.shipName}`}
                            >
                              <Bell className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {alertOpen && alertTarget && commandUserId ? (
          <SendCaptainOrderModal
            open
            shipId={alertTarget.id}
            shipName={alertTarget.shipName}
            onClose={() => {
              setAlertOpen(false);
              setAlertTarget(null);
            }}
            onSend={async (title, instruction) => {
              await createCriticalCaptainOrder(supabase, {
                shipId: alertTarget.id,
                title,
                instruction,
                createdBy: commandUserId,
              });
              setDirectiveEpoch((n) => n + 1);
            }}
          />
        ) : null}
      </AnimatePresence>
      </div>
    </>
  );
}

function ThreatShipDetail({
  ship,
  analysis,
}: {
  ship: ShipIntel;
  analysis: ShipThreatAnalysis;
}) {
  const st = distressStyles[analysis.distressLevel];

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border bg-white/[0.06] p-3.5 shadow-lg backdrop-blur-md ${st.glow}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-white">
            {ship.shipName}
          </h3>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-white/40">
            {ship.id} · {ship.cargo}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ${st.badge}`}
        >
          {st.label}
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-white/75">
        <span className="text-white/45">Captain message: </span>
        {ship.captainMessage}
      </p>

      <div className="mt-2 flex items-start gap-2 rounded-xl border border-cyan-400/15 bg-cyan-950/25 px-2.5 py-2">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300/80" />
        <p className="text-[11px] leading-snug text-cyan-50/90">
          <span className="font-semibold text-cyan-200/90">Extracted: </span>
          {analysis.extractedIssue}
        </p>
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <div className="flex items-center justify-between text-[10px] text-white/50">
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3 text-cyan-300/70" />
              Severity score
            </span>
            <span className="font-mono text-cyan-100/90">
              {analysis.severityScore}
            </span>
          </div>
          <RiskBar
            value={analysis.severityScore}
            accent="bg-gradient-to-r from-cyan-500 to-cyan-300"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
          <Metric label="Weather" value={analysis.weatherRisk} />
          <Metric label="Red zone" value={analysis.redZoneRisk} />
          <Metric label="Fuel" value={analysis.fuelRisk} />
          <Metric label="Command NLP" value={analysis.commandRisk} />
        </div>
        {analysis.commandKeywords.length > 0 ? (
          <div className="mt-2 rounded-xl border border-amber-400/20 bg-amber-950/20 px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/70">
              Latest directive keywords
            </p>
            <p className="mt-1 text-[10px] text-amber-100/80">{analysis.commandSummary}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {analysis.commandKeywords.map((k) => (
                <span
                  key={k}
                  className="rounded-md bg-black/35 px-1.5 py-0.5 font-mono text-[9px] text-amber-100/90 ring-1 ring-amber-400/25"
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/25 px-2.5 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
          Recommendation
        </p>
        <p className="mt-1 text-[11px] leading-snug text-white/80">
          {analysis.recommendation}
        </p>
      </div>
    </motion.article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-black/30 px-2 py-1.5 ring-1 ring-white/10">
      <p className="text-[9px] uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-0.5 font-mono text-xs text-cyan-100/90">+{value}</p>
    </div>
  );
}
