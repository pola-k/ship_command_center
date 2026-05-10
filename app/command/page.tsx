"use client";

import ThreatPanel from "@/components/ThreatPanel";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fleetShipsIntel } from "../data/ships";
import {
  resolveSessionContext,
  type SessionContext,
} from "../lib/authRole";
import { supabase } from "../lib/supabaseClient";
import TacticalMap from "./TacticalMap";

export default function CommandPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionContext | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      const ctx = await resolveSessionContext(supabase, data.user);
      if (!ctx) {
        router.replace("/choose-role");
        return;
      }
      if (ctx.role === "captain" && !ctx.captainShipId) {
        router.replace("/choose-role");
        return;
      }
      if (mounted) {
        setSession(ctx);
        setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [router]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  }, [router]);

  return (
    <div className="relative min-h-dvh w-screen overflow-hidden bg-[#04131f] text-white">
      <div className="pointer-events-none absolute left-4 top-4 z-[85]">
        <button
          type="button"
          onClick={() => void logout()}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-900/75 px-3 py-2 text-xs font-semibold text-cyan-100 shadow-lg backdrop-blur-md transition hover:border-cyan-400/35 hover:bg-slate-800/85 hover:text-white"
          aria-label="Log out"
        >
          <LogOut className="h-4 w-4 shrink-0 opacity-90" />
          Log out
        </button>
      </div>
      {loading ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 text-sm text-white/70 backdrop-blur-sm">
          Loading command dashboard…
        </div>
      ) : null}
      {!loading && session ? (
        session.role === "command" ? (
          <ThreatPanel
            ships={fleetShipsIntel}
            commandUserId={session.userId}
            renderTacticalMap={(launcher, { onCommandDirectiveSent }) => (
              <TacticalMap
                mode="command"
                captainShipId={null}
                captainShipName={null}
                captainDisplayName={null}
                commandUserId={session.userId}
                captainUserId={null}
                leadingRail={launcher}
                onCommandDirectiveSent={onCommandDirectiveSent}
              />
            )}
          />
        ) : (
          <TacticalMap
            mode="captain"
            captainShipId={session.captainShipId}
            captainShipName={session.captainShipName}
            captainDisplayName={session.displayName}
            commandUserId={null}
            captainUserId={session.userId}
          />
        )
      ) : null}
    </div>
  );
}
