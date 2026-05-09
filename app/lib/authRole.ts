import type { User } from "@supabase/supabase-js";

export type AppRole = "command" | "captain";

export function getUserRole(user: User | null | undefined): AppRole | null {
  const role = (user?.user_metadata as { role?: unknown } | null | undefined)
    ?.role;
  return role === "command" || role === "captain" ? role : null;
}

