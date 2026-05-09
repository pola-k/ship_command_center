"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { resolveUserRole } from "../lib/authRole";
import { supabase } from "../lib/supabaseClient";
import TacticalMap from "./TacticalMap";

export default function CommandPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <div className="relative min-h-dvh w-screen overflow-hidden bg-[#04131f] text-white">
      {loading ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 text-sm text-white/70 backdrop-blur-sm">
          Loading command dashboard…
        </div>
      ) : null}
      <TacticalMap />
    </div>
  );
}
