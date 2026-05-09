import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AppRole = "command" | "captain";

export type CommandSessionContext = {
  role: "command";
  userId: string;
  email: string | null;
  displayName: string | null;
};

export type CaptainSessionContext = {
  role: "captain";
  userId: string;
  email: string | null;
  displayName: string | null;
  /** From `profiles.captain_ship_id`; null if missing (invalid captain row). */
  captainShipId: string | null;
  captainShipName: string | null;
};

export type SessionContext = CommandSessionContext | CaptainSessionContext;

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

/** Profile + ship name for command vs captain map views. */
export async function resolveSessionContext(
  supabase: SupabaseClient,
  user: User | null | undefined
): Promise<SessionContext | null> {
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, display_name, captain_ship_id")
    .eq("user_id", user.id)
    .maybeSingle<{
      role: AppRole;
      display_name: string | null;
      captain_ship_id: string | null;
    }>();

  const role =
    !error && profile?.role ? profile.role : getUserRole(user);
  if (role !== "command" && role !== "captain") return null;

  const email = user.email ?? null;
  const displayName =
    profile?.display_name ??
    (user.user_metadata as { display_name?: string } | null)?.display_name ??
    null;

  if (role === "command") {
    return {
      role: "command",
      userId: user.id,
      email,
      displayName,
    };
  }

  const captainShipId =
    profile?.captain_ship_id ??
    (user.user_metadata as { captain_ship_id?: string } | null)
      ?.captain_ship_id ??
    null;

  const shipRes = captainShipId
    ? await supabase
        .from("ships")
        .select("name")
        .eq("id", captainShipId)
        .maybeSingle<{ name: string | null }>()
    : { data: null as { name: string | null } | null };

  return {
    role: "captain",
    userId: user.id,
    email,
    displayName,
    captainShipId,
    captainShipName: shipRes.data?.name ?? null,
  };
}

