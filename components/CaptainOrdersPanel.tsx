"use client";

import { motion } from "framer-motion";
import {
  captainAcceptDirective,
  captainRejectDirective,
  fetchOpenDirectivesForShip,
  isDirectiveAwaitingCommandReview,
  type DirectiveRow,
} from "@/app/lib/directiveOrders";
import { toUserMessage } from "@/app/lib/errors";
import { supabase } from "@/lib/supabaseClient";
import { Check, Clock, Inbox, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Props = {
  captainShipId: string;
  captainUserId: string;
};

function titleFromPayload(payload: Record<string, unknown>): string {
  const t = payload.title;
  return typeof t === "string" ? t : "Command directive";
}

function instructionFromPayload(payload: Record<string, unknown>): string {
  const i = payload.instruction;
  return typeof i === "string" ? i : "—";
}

export function CaptainOrdersPanel({ captainShipId, captainUserId }: Props) {
  const [rows, setRows] = useState<DirectiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchOpenDirectivesForShip(supabase, captainShipId);
      setRefreshError(null);
      setRows(list);
    } catch (e) {
      const msg = toUserMessage(e);
      setRefreshError(msg);
      setRows([]);
      if (process.env.NODE_ENV === "development") {
        console.error("[CaptainOrdersPanel] refresh failed:", msg);
      }
    } finally {
      setLoading(false);
    }
  }, [captainShipId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const ch = supabase
      .channel(`captain_directives_${captainShipId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "directives",
          filter: `ship_id=eq.${captainShipId}`,
        },
        () => {
          refresh();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [captainShipId, refresh]);

  async function accept(id: string) {
    setError(null);
    setBusy(true);
    try {
      await captainAcceptDirective(supabase, {
        directiveId: id,
        userId: captainUserId,
      });
      setActiveId(null);
      await refresh();
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: string) {
    if (!rejectReason.trim()) {
      setError("Explain why you cannot comply (required for refusal).");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await captainRejectDirective(supabase, {
        directiveId: id,
        userId: captainUserId,
        reason: rejectReason,
      });
      setActiveId(null);
      setRejectReason("");
      await refresh();
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/50 px-3 py-3 text-xs text-white/50">
        Loading command orders…
      </div>
    );
  }

  if (refreshError) {
    return (
      <div className="rounded-2xl border border-red-400/35 bg-red-950/30 px-3 py-3 text-xs text-white/80">
        <p className="font-semibold text-red-200">Could not load command orders</p>
        <p className="mt-1 text-[11px] text-red-100/85">{refreshError}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void refresh();
          }}
          className="mt-2 rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white/90 hover:bg-white/10"
        >
          Retry
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-3 text-xs text-white/55">
        <div className="flex items-center gap-2 text-white/70">
          <Inbox className="h-4 w-4 text-cyan-300/80" />
          <span className="font-semibold">No open orders</span>
        </div>
        <p className="mt-1 text-[11px] text-white/45">
          When Command sends a directive, it will appear here for acknowledgement.
        </p>
      </div>
    );
  }

  return (
    <div className="flex max-h-[min(40vh,320px)] min-h-0 flex-col gap-2 overflow-hidden rounded-2xl border border-cyan-400/20 bg-slate-900/55 backdrop-blur-md">
      <div className="shrink-0 border-b border-white/10 px-3 py-2">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-cyan-100/90">
          <Inbox className="h-3.5 w-3.5" />
          Command orders
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {rows.map((d) => (
          <motion.div
            key={d.id}
            layout
            className="rounded-xl border border-white/12 bg-black/30 p-3 text-xs"
          >
            <p className="font-semibold text-white">{titleFromPayload(d.payload)}</p>
            <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-white/70">
              {instructionFromPayload(d.payload)}
            </p>
            <p className="mt-1 text-[10px] text-white/35">
              {new Date(d.created_at).toLocaleString()}
            </p>

            {isDirectiveAwaitingCommandReview(d) ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-500/10 px-2 py-2 text-amber-100/90">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Awaiting command review</p>
                  <p className="mt-0.5 text-[11px] text-amber-100/75">
                    Your refusal was submitted. Stand by until Command approves your
                    position or directs you again.
                  </p>
                  {typeof d.payload.captain_rejection_reason === "string" ? (
                    <p className="mt-2 text-[10px] text-white/60">
                      Your message: {d.payload.captain_rejection_reason}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                {typeof d.payload.command_review_note === "string" &&
                d.payload.command_override ? (
                  <div className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 px-2 py-2 text-[11px] text-red-100/90">
                    <p className="font-semibold">Command response</p>
                    <p className="mt-1">{String(d.payload.command_review_note)}</p>
                    <p className="mt-1 text-[10px] text-red-100/70">
                      You must acknowledge again — refusal was not accepted.
                    </p>
                  </div>
                ) : null}

                {activeId === d.id ? (
                  <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                    <label className="text-[10px] font-semibold uppercase text-white/45">
                      Reason for refusal
                    </label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none"
                      placeholder="Safety, weather, machinery, regulations…"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => reject(d.id)}
                        className="inline-flex items-center gap-1 rounded-full bg-red-500/85 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-red-400 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Submit refusal
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setActiveId(null);
                          setRejectReason("");
                          setError(null);
                        }}
                        className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] text-white/70"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => accept(d.id)}
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Accept order
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setActiveId(d.id);
                        setRejectReason("");
                        setError(null);
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-[11px] font-semibold text-red-100 hover:bg-red-500/25 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Refuse
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        ))}
        {error ? <p className="text-[11px] text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}
