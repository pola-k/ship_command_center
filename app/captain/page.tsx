"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { resolveUserRole } from "../lib/authRole";
import { supabase } from "../lib/supabaseClient";

/** Captains use the same fleet dashboard as Command; this route keeps old links working. */
export default function CaptainPage() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!data.user) {
        router.replace("/login");
        return;
      }
      const role = await resolveUserRole(supabase, data.user);
      if (!mounted) return;
      if (role === "captain") {
        router.replace("/command-dashboard");
        return;
      }
      router.replace("/command");
    }
    load();
    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#06141c] text-sm text-white/60">
      Redirecting…
    </div>
  );
}
