"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserRole } from "../lib/authRole";
import { supabase } from "../lib/supabaseClient";
import { Card, InlineLink, PrimaryButton } from "../lib/ui";

export default function CommandPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data } = await supabase.auth.getUser();
      const role = getUserRole(data.user);
      if (!data.user) {
        router.replace("/login");
        return;
      }
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
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12">
      <Card>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Command Center
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Signed in as: <span className="font-medium">{email ?? "—"}</span>
        </p>

        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
          This is a role-guarded page for <span className="font-medium">Command</span>.
          Next step: plug your real map + fleet view here.
        </div>

        <div className="mt-6 flex items-center justify-between text-sm text-zinc-600">
          <InlineLink href="/captain">Go to Captain view</InlineLink>
          <PrimaryButton onClick={logout} disabled={loading}>
            Log out
          </PrimaryButton>
        </div>
      </Card>
    </div>
  );
}

