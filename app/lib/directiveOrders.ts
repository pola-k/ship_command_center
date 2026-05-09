import type { SupabaseClient } from "@supabase/supabase-js";

export type DirectiveStatus =
  | "pending"
  | "accepted"
  | "escalated_distress"
  | "cancelled"
  | "expired"
  | "rejected_pending_review"
  | "rejection_approved";

export type DirectiveRow = {
  id: string;
  created_at: string;
  created_by: string | null;
  ship_id: string;
  type: string;
  payload: Record<string, unknown>;
  status: DirectiveStatus;
  expires_at: string | null;
};

const CRITICAL_PAYLOAD_KEYS = {
  order_type: "critical_command",
} as const;

export function isShipCriticallyDistressed(status: string): boolean {
  return (
    status === "distressed" ||
    status === "insufficient_fuel" ||
    status === "out_of_fuel" ||
    status === "stranded"
  );
}

/**
 * True when the DB enum `directive_status` is missing values from migration
 * `0012_directive_captain_rejection_flow.sql` (Postgres 22P02 on filter/insert).
 */
export function isMissingDirectiveRejectionEnum(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  if (e.code !== "22P02" || typeof e.message !== "string") return false;
  return (
    e.message.includes("rejected_pending_review") ||
    e.message.includes("rejection_approved")
  );
}

/** Postgres CHECK constraint violation (e.g. action not in allowed set). */
export function isPostgresCheckViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  if (e.code === "23514") return true;
  const msg = typeof e.message === "string" ? e.message : "";
  return (
    msg.includes("directive_responses_action_check") ||
    msg.includes("violates check constraint")
  );
}

/** Captain refusal is waiting for command (normal or legacy `escalated_distress` row). */
export function isDirectiveAwaitingCommandReview(row: Pick<
  DirectiveRow,
  "status" | "payload"
>): boolean {
  if (row.status === "rejected_pending_review") return true;
  return (
    row.status === "escalated_distress" &&
    row.payload.refusal_pending_command_review === true
  );
}

function filterCaptainOpenRows(rows: DirectiveRow[]): DirectiveRow[] {
  return rows.filter((d) => {
    if (d.status === "pending" || d.status === "rejected_pending_review") return true;
    if (
      d.status === "escalated_distress" &&
      d.payload.refusal_pending_command_review === true
    )
      return true;
    return false;
  });
}

function filterRefusalsForCommandInbox(rows: DirectiveRow[]): DirectiveRow[] {
  return rows.filter(
    (d) =>
      d.status === "rejected_pending_review" ||
      (d.status === "escalated_distress" &&
        d.payload.refusal_pending_command_review === true)
  );
}

export async function fetchOpenDirectivesForShip(
  supabase: SupabaseClient,
  shipId: string
): Promise<DirectiveRow[]> {
  const base = () =>
    supabase
      .from("directives")
      .select("id,created_at,created_by,ship_id,type,payload,status,expires_at")
      .eq("ship_id", shipId);

  let res = await base()
    .in("status", ["pending", "rejected_pending_review", "escalated_distress"])
    .order("created_at", { ascending: false });

  if (res.error && isMissingDirectiveRejectionEnum(res.error)) {
    res = await base()
      .in("status", ["pending", "escalated_distress"])
      .order("created_at", { ascending: false });
  }

  if (res.error) throw res.error;
  return filterCaptainOpenRows((res.data ?? []) as DirectiveRow[]);
}

export async function fetchRejectionsPendingCommandReview(
  supabase: SupabaseClient
): Promise<DirectiveRow[]> {
  let res = await supabase
    .from("directives")
    .select("id,created_at,created_by,ship_id,type,payload,status,expires_at")
    .in("status", ["rejected_pending_review", "escalated_distress"])
    .order("created_at", { ascending: false });

  if (res.error && isMissingDirectiveRejectionEnum(res.error)) {
    res = await supabase
      .from("directives")
      .select("id,created_at,created_by,ship_id,type,payload,status,expires_at")
      .eq("status", "escalated_distress")
      .order("created_at", { ascending: false });
  }

  if (res.error) throw res.error;
  return filterRefusalsForCommandInbox((res.data ?? []) as DirectiveRow[]);
}

export async function createCriticalCaptainOrder(
  supabase: SupabaseClient,
  args: {
    shipId: string;
    title: string;
    instruction: string;
    createdBy: string;
  }
): Promise<DirectiveRow> {
  const payload = {
    ...CRITICAL_PAYLOAD_KEYS,
    title: args.title,
    instruction: args.instruction,
    severity: "critical",
  };

  const { data, error } = await supabase
    .from("directives")
    .insert({
      ship_id: args.shipId,
      type: "custom",
      payload,
      status: "pending",
      created_by: args.createdBy,
    })
    .select("id,created_at,created_by,ship_id,type,payload,status,expires_at")
    .single();

  if (error) throw error;
  return data as DirectiveRow;
}

export async function captainAcceptDirective(
  supabase: SupabaseClient,
  args: { directiveId: string; userId: string }
): Promise<void> {
  const { error: r1 } = await supabase.from("directive_responses").insert({
    directive_id: args.directiveId,
    created_by: args.userId,
    action: "ACCEPT",
    message: null,
  });
  if (r1) throw r1;

  const { error: r2 } = await supabase
    .from("directives")
    .update({ status: "accepted" })
    .eq("id", args.directiveId);
  if (r2) throw r2;
}

export async function captainRejectDirective(
  supabase: SupabaseClient,
  args: { directiveId: string; userId: string; reason: string }
): Promise<void> {
  const { data: row, error: fetchErr } = await supabase
    .from("directives")
    .select("payload")
    .eq("id", args.directiveId)
    .single();
  if (fetchErr) throw fetchErr;

  const prevPayload = (row?.payload ?? {}) as Record<string, unknown>;
  const reason = args.reason.trim();
  const mergedPayload = {
    ...prevPayload,
    captain_rejection_reason: reason,
    captain_rejected_at: new Date().toISOString(),
  };

  let r1 = (
    await supabase.from("directive_responses").insert({
      directive_id: args.directiveId,
      created_by: args.userId,
      action: "REJECT",
      message: reason,
    })
  ).error;

  // Base schema (0006) only allows ACCEPT | ESCALATE_DISTRESS until migrations
  // 0012+ drop all CHECKs and allow REJECT. If REJECT still hits 23514, record
  // the refusal as ESCALATE_DISTRESS (same table, legacy-safe).
  if (r1 && isPostgresCheckViolation(r1)) {
    r1 = (
      await supabase.from("directive_responses").insert({
        directive_id: args.directiveId,
        created_by: args.userId,
        action: "ESCALATE_DISTRESS",
        message: reason,
      })
    ).error;
  }
  if (r1) throw r1;

  let r2 = (
    await supabase
      .from("directives")
      .update({ status: "rejected_pending_review", payload: mergedPayload })
      .eq("id", args.directiveId)
  ).error;

  if (r2 && isMissingDirectiveRejectionEnum(r2)) {
    const legacyPayload = {
      ...mergedPayload,
      refusal_pending_command_review: true,
    };
    r2 = (
      await supabase
        .from("directives")
        .update({ status: "escalated_distress", payload: legacyPayload })
        .eq("id", args.directiveId)
    ).error;
  }
  if (r2) throw r2;
}

export async function commandReviewRejection(
  supabase: SupabaseClient,
  args: {
    directiveId: string;
    reviewerId: string;
    approve: boolean;
    note: string;
  }
): Promise<void> {
  const { data: row, error: fetchErr } = await supabase
    .from("directives")
    .select("payload")
    .eq("id", args.directiveId)
    .single();
  if (fetchErr) throw fetchErr;

  const prevPayload = (row?.payload ?? {}) as Record<string, unknown>;
  const reviewNote = args.note.trim();
  const merged = {
    ...prevPayload,
    command_review_note: reviewNote,
    command_reviewed_at: new Date().toISOString(),
    command_reviewed_by: args.reviewerId,
  };

  if (args.approve) {
    let err = (
      await supabase
        .from("directives")
        .update({ status: "rejection_approved", payload: merged })
        .eq("id", args.directiveId)
    ).error;
    if (err && isMissingDirectiveRejectionEnum(err)) {
      err = (
        await supabase
          .from("directives")
          .update({ status: "cancelled", payload: merged })
          .eq("id", args.directiveId)
      ).error;
    }
    if (err) throw err;
    return;
  }

  const overrideMerged = {
    ...merged,
    command_override: true,
  };
  const { error } = await supabase
    .from("directives")
    .update({ status: "pending", payload: overrideMerged })
    .eq("id", args.directiveId);
  if (error) throw error;
}
