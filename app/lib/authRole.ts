import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AppRole = "command" | "captain";

export function getUserRole(user: User | null | undefined): AppRole | null {
  const role = (user?.user_metadata as { role?: unknown } | null | undefined)
    ?.role;
  return role === "command" || role === "captain" ? role : null;
}

export async function resolveUserRole(
  supabase: SupabaseClient,
  user: User | null | undefined
): Promise<AppRole | null> {
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle<{ role: AppRole }>();

  if (!error && data?.role) {
    return data.role;
  }

  return getUserRole(user);
}

