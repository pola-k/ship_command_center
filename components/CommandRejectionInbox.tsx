"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  commandReviewRejection,
  fetchRejectionsPendingCommandReview,
  type DirectiveRow,
} from "@/app/lib/directiveOrders";
import { toUserMessage } from "@/app/lib/errors";
import { supabase } from "@/lib/supabaseClient";
import { ClipboardList, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Props = {
  commandUserId: string;
};

function titleFromPayload(payload: Record<string, unknown>): string {
  const t = payload.title;
  return typeof t === "string" ? t : "Directive";
}

export function CommandRejectionInbox({ commandUserId }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DirectiveRow[]>([]);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchRejectionsPendingCommandReview(supabase);
      setRows(list);
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.error("[CommandRejectionInbox]", toUserMessage(e));
      }
      setRows([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const ch = supabase
      .channel("command_rejection_inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "directives" },
        () => {
          refresh();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refresh]);

  async function review(id: string, approve: boolean) {
    const note = (noteById[id] ?? "").trim();
    if (!note) {
      setError("Add a note for the captain (required).");
      return;
    }
    setError(null);
    setBusyId(id);
    try {
      await commandReviewRejection(supabase, {
        directiveId: id,
        reviewerId: commandUserId,
        approve,
        note,
      });
      setNoteById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await refresh();
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  const count = rows.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-glow absolute bottom-24 left-4 z-[22] flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-white/20 bg-slate-900/80 px-3 text-cyan-100 backdrop-blur-md hover:bg-slate-800/85"
        title="Captain refusals pending your review"
      >
        <ClipboardList size={17} />
        {count > 0 ? (
          <span className="text-[11px] font-bold tabular-nums">{count}</span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-40 left-4 z-[22] w-[min(100vw-2rem,380px)] max-h-[min(55vh,420px)] overflow-hidden rounded-2xl border border-white/20 bg-slate-900/95 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-white">
                Refusal review
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-white/50 hover:bg-white/10"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[min(48vh,360px)] space-y-3 overflow-y-auto p-3 text-xs">
              {rows.length === 0 ? (
                <p className="text-white/50">No captain refusals awaiting review.</p>
              ) : (
                rows.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-amber-50/95"
                  >
                    <p className="font-semibold text-white">
                      {titleFromPayload(d.payload)}
                    </p>
                    <p className="mt-1 text-[10px] text-white/45">
                      Ship: <span className="text-cyan-200/90">{d.ship_id}</span>
                    </p>
                    {typeof d.payload.captain_rejection_reason === "string" ? (
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-black/25 p-2 text-[11px] text-white/85">
                        Captain: {d.payload.captain_rejection_reason}
                      </p>
                    ) : null}
                    <label className="mt-2 block text-[10px] font-semibold uppercase text-white/50">
                      Your note to captain
                    </label>
                    <textarea
                      value={noteById[d.id] ?? ""}
                      onChange={(e) =>
                        setNoteById((prev) => ({ ...prev, [d.id]: e.target.value }))
                      }
                      rows={2}
                      className="mt-1 w-full resize-none rounded-lg border border-white/15 bg-black/35 px-2 py-1.5 text-[11px] text-white outline-none"
                      placeholder="e.g. Refusal approved — stand down. Or: Refusal denied — comply with original order."
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyId === d.id}
                        onClick={() => review(d.id, true)}
                        className="rounded-full bg-emerald-600/90 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        Approve refusal
                      </button>
                      <button
                        type="button"
                        disabled={busyId === d.id}
                        onClick={() => review(d.id, false)}
                        className="rounded-full bg-red-600/85 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-red-500 disabled:opacity-50"
                      >
                        Overrule — require compliance
                      </button>
                    </div>
                  </div>
                ))
              )}
              {error ? <p className="text-[11px] text-red-300">{error}</p> : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
