"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppRole } from "../lib/authRole";
import { getUserRole } from "../lib/authRole";
import { supabase } from "../lib/supabaseClient";

export default function ChooseRolePage() {
  const router = useRouter();
  const [role, setRole] = useState<AppRole>("captain");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      const existing = getUserRole(data.user);
      if (existing) {
        router.replace(existing === "captain" ? "/captain" : "/command");
        return;
      }
      if (mounted) setRole("captain");
    }
    load();
    return () => {
      mounted = false;
    };
  }, [router]);

  async function saveRole(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { role },
      });
      if (error) throw error;
      router.push(role === "captain" ? "/captain" : "/command");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save role.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#0a1921] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-[420px] bg-white/[0.07] backdrop-blur-[20px] border border-white/20 rounded-[45px] p-10 shadow-[0_25px_60px_rgba(0,0,0,0.4)]">
        <h1 className="text-2xl font-semibold tracking-tight">Choose your role</h1>
        <p className="mt-2 text-sm text-white/60">
          This account doesn’t have a role set yet.
        </p>

        <form className="mt-8 space-y-5" onSubmit={saveRole}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-white/80" htmlFor="role">
              Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
              className="h-12 w-full rounded-full bg-black/30 border border-white/10 px-5 text-sm outline-none focus:bg-black/50 focus:border-white/40"
              disabled={loading}
            >
              <option value="command">AS Command</option>
              <option value="captain">AS Captain</option>
            </select>
          </div>

          {error ? (
            <div className="rounded-3xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <button
            disabled={loading}
            className="w-full bg-white text-[#0a1921] font-bold py-4 rounded-full shadow-xl hover:bg-white/90 active:scale-[0.98] transition-all text-base disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

