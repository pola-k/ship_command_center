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
    <div className="min-h-dvh bg-[#04131f] px-4 py-4 text-white sm:px-6">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
          <div>
            <h1 className="text-lg font-semibold tracking-wide">Command Dashboard</h1>
            <p className="text-xs text-white/70">
              Signed in as <span className="font-medium text-white">{email ?? "—"}</span>
            </p>
          </div>
          <button
            onClick={logout}
            disabled={loading}
            className="btn-glow rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Log out
          </button>
        </div>
        <TacticalMap />
      </div>
    </div>
  );
}

