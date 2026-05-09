"use client";

import { toUserMessage } from "@/app/lib/errors";
import { motion } from "framer-motion";
import { Radio, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  shipId: string;
  shipName: string;
  onSend: (title: string, instruction: string) => Promise<void>;
};

export function SendCaptainOrderModal({
  open,
  onClose,
  shipId,
  shipName,
  onSend,
}: Props) {
  const [title, setTitle] = useState("Critical — command directive");
  const [instruction, setInstruction] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open) return null;
  if (!mounted || typeof document === "undefined") return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!instruction.trim()) {
      setError("Enter instructions for the captain.");
      return;
    }
    setSending(true);
    try {
      await onSend(title.trim() || "Command directive", instruction.trim());
      setInstruction("");
      onClose();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-auto fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-order-title"
    >
      <motion.div
        initial={{ scale: 0.96, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        className="pointer-events-auto w-full max-w-md rounded-2xl border border-cyan-400/25 bg-[#0a1620] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-cyan-200">
            <Radio className="h-5 w-5 shrink-0" />
            <h2 id="send-order-title" className="text-sm font-bold uppercase tracking-wide text-white">
              Send order to captain
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-white/55">
          <span className="font-semibold text-cyan-100/90">{shipName}</span>{" "}
          <span className="text-white/40">({shipId})</span>
        </p>

        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
              Subject
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
              Instructions
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={4}
              placeholder="e.g. Reduce speed, hold position, prepare for inspection…"
              className="mt-1 w-full resize-none rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
            />
          </div>
          {error ? (
            <p className="text-xs text-red-300/90">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/75 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="rounded-full bg-cyan-500/90 px-4 py-2 text-xs font-bold text-[#04131f] hover:bg-cyan-400 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Transmit to bridge"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>,
    document.body
  );
}
