"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveUserRole } from "../lib/authRole";
import { supabase } from "../lib/supabaseClient";
import TacticalMap from "./TacticalMap";

export default function CommandPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      const role = await resolveUserRole(supabase, data.user);
      if (role !== "command") {
        router.replace("/captain");
        return;
      }
      if (mounted) {
        setEmail(data.user.email ?? null);
        setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [router]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="relative min-h-dvh w-screen overflow-hidden bg-[#04131f] text-white">
      <div className="absolute right-4 top-4 z-40 rounded-full border border-white/15 bg-slate-900/65 px-3 py-1.5 text-xs backdrop-blur-md">
        <span className="text-white/80">Signed in:</span>{" "}
        <span className="font-semibold text-white">{email ?? "—"}</span>
      </div>
      <button
        onClick={logout}
        disabled={loading}
        className="btn-glow absolute right-4 top-14 z-40 rounded-xl border border-white/20 bg-slate-900/70 px-3 py-1.5 text-xs font-medium backdrop-blur-md hover:bg-slate-800/80 disabled:cursor-not-allowed disabled:opacity-70"
      >
        Log out
      </button>
      <TacticalMap />
    </div>
  );
}

