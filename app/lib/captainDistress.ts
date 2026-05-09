import type { SupabaseClient } from "@supabase/supabase-js";

export type CaptainDistressReason = "low_fuel" | "restricted_zone" | "manual";

export async function captainDeclareDistress(
  supabase: SupabaseClient,
  args: {
    shipId: string;
    reason: CaptainDistressReason;
    message?: string;
  }
): Promise<unknown> {
  const { data, error } = await supabase.rpc("captain_declare_distress", {
    p_ship_id: args.shipId,
    p_reason: args.reason,
    p_message: args.message ?? "",
  });
  if (error) throw error;
  return data;
}
