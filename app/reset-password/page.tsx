"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, FieldLabel, InlineLink, PrimaryButton, TextInput } from "../lib/ui";

function parseHashParams(hash: string) {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  return {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
  };
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const code = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("code");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrapRecoverySession() {
      setError(null);
      try {
        // Support both URL styles:
        // - PKCE: ?code=...
        // - Implicit: #access_token=...&refresh_token=...
        if (typeof window !== "undefined") {
          const { access_token, refresh_token } = parseHashParams(
            window.location.hash
          );
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (error) throw error;
          } else if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
          }
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) {
          throw new Error(
            "No recovery session found. Please open the reset link from your email again."
          );
        }

        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Reset link failed.");
          setReady(false);
        }
      }
    }

    bootstrapRecoverySession();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess("Password updated. You can now log in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12">
      <Card>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Choose a new password
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          This link is time-limited.
        </p>

        {error ? (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {success} <InlineLink href="/login">Log in</InlineLink>
          </p>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <TextInput
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={!ready || loading}
            />
          </div>

          <PrimaryButton type="submit" disabled={!ready || loading}>
            {loading ? "Updating…" : ready ? "Update password" : "Waiting…"}
          </PrimaryButton>
        </form>

        <div className="mt-6 text-sm text-zinc-600">
          Back to <InlineLink href="/login">Log in</InlineLink>
        </div>
      </Card>
    </div>
  );
}

