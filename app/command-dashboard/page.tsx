"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppRole } from "../lib/authRole";
import { resolveUserRole } from "../lib/authRole";
import { supabase } from "../lib/supabaseClient";
import type { FleetThreatShip } from "../data/threats";
import { fleetThreats } from "../data/threats";
import { ThreatSidebar } from "../../components/ThreatSidebar";
import { FleetOverview } from "../../components/FleetOverview";
import { LogOut, ShieldCheck } from "lucide-react";

export default function CommandDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [ships, setShips] = useState<FleetThreatShip[]>(fleetThreats);
  const [selectedShipId, setSelectedShipId] = useState<string | null>(
    fleetThreats[0]?.id ?? null
  );
  const [updatedAt, setUpdatedAt] = useState<Date>(new Date());
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setClientReady(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      const role = await resolveUserRole(supabase, data.user);
      if (!role || (role !== "command" && role !== "captain")) {
        router.replace("/choose-role");
        return;
      }
      if (mounted) {
        setEmail(data.user.email ?? null);
        setUserRole(role);
        setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    // Fake live updates to make the command center feel "alive"
    const id = window.setInterval(() => {
      setShips((prev) =>
        prev.map((s) => {
          const fuelJitter = Math.random() < 0.65 ? -0.3 : 0.1;
          const speedJitter = (Math.random() - 0.5) * 0.4;
          const fuelLevel = Math.max(
            0,
            Math.min(100, Math.round((s.fuelLevel + fuelJitter) * 10) / 10)
          );
          const speed = Math.max(0, Math.round((s.speed + speedJitter) * 10) / 10);
          const nearRestrictedZone =
            Math.random() < 0.04 ? !s.nearRestrictedZone : s.nearRestrictedZone;

          return { ...s, fuelLevel, speed, nearRestrictedZone };
        })
      );
      setUpdatedAt(new Date());
    }, 3500);
    return () => window.clearInterval(id);
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen w-full bg-[#06141c] text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_10%_0%,rgba(34,211,238,0.18),transparent_55%)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_30%,rgba(59,130,246,0.14),transparent_60%)]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0b2532] via-[#06141c] to-[#030a0f]" />

      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/25 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-cyan-400/10 p-3 ring-1 ring-cyan-300/20">
              <ShieldCheck className="h-5 w-5 text-cyan-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight text-white/90">
                  MarineX Fleet Dashboard
                </h1>
                {userRole ? (
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70 ring-1 ring-white/15">
                    {userRole === "command" ? "Command" : "Captain"}
                  </span>
                ) : null}
                <span className="relative inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-300/20">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300/70 opacity-70" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  </span>
                  LIVE
                </span>
              </div>
              <div className="mt-0.5 text-xs text-white/50">
                Operator: <span className="text-white/70">{email ?? "—"}</span> ·
                Sync{" "}
                <span suppressHydrationWarning>
                  {clientReady
                    ? updatedAt.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "--:--:--"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={logout}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[1.2fr_0.8fr]">
        <FleetOverview ships={ships} updatedAt={updatedAt} />

        <div className="lg:h-[calc(100vh-112px)]">
          <ThreatSidebar
            ships={ships}
            updatedAt={updatedAt}
            selectedShipId={selectedShipId}
            onSelectShip={setSelectedShipId}
          />
        </div>
      </main>
    </div>
  );
}

