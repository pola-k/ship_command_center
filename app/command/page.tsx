"use client";

import ThreatPanel from "@/components/ThreatPanel";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

  const isCaptain = session?.role === "captain";

  return (
    <div className="relative min-h-dvh w-screen overflow-hidden bg-[#04131f] text-white">
      {loading ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 text-sm text-white/70 backdrop-blur-sm">
          Loading command dashboard…
        </div>
      ) : null}
      {!loading && session && !isCaptain ? (
        <ThreatPanel ships={fleetShipsIntel} />
      ) : null}
      {!loading && session ? (
        <TacticalMap
          mode={session.role}
          captainShipId={
            session.role === "captain" ? session.captainShipId : null
          }
          captainShipName={
            session.role === "captain" ? session.captainShipName : null
          }
          captainDisplayName={
            session.role === "captain" ? session.displayName : null
          }
        />
      ) : null}
    </div>
  );
}
