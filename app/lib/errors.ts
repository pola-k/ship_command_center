/** Normalize API / Postgrest errors for UI (they are often plain objects, not Error). */
export function toUserMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message?.trim();
    if (msg) return msg;
    const pg = err as Error & { code?: string; details?: string; hint?: string };
    const bits = [pg.details, pg.hint].filter(
      (s): s is string => typeof s === "string" && s.trim().length > 0
    );
    if (bits.length > 0) return bits.join(" — ");
    if (typeof pg.code === "string" && pg.code.trim()) return `Request failed (${pg.code})`;
  }
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const msg = typeof o.message === "string" ? o.message.trim() : "";
    const details = typeof o.details === "string" ? o.details.trim() : "";
    const hint = typeof o.hint === "string" ? o.hint.trim() : "";
    const code = typeof o.code === "string" ? o.code.trim() : "";
    const combined = [msg, details, hint].filter(Boolean).join(" — ");
    if (combined) return code ? `${combined} (${code})` : combined;
    if (code) return `Request failed (${code})`;
    if (typeof o.error_description === "string" && o.error_description.trim())
      return o.error_description.trim();
    try {
      const s = JSON.stringify(o);
      if (s && s !== "{}") return s;
    } catch {
      /* ignore */
    }
  }
  if (typeof err === "string" && err.trim()) return err.trim();
  return "Something went wrong.";
}
