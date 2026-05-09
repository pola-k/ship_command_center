"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AppRole } from "../lib/authRole";
import { supabase } from "../lib/supabaseClient";
import { Card, FieldLabel, InlineLink, PrimaryButton, TextInput } from "../lib/ui";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("captain");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { role },
        },
      });
      if (error) throw error;

      // If email confirmation is ON, session may be null. Still store role in user_metadata.
      if (!data.session) {
        setInfo("Check your email to confirm your account, then log in.");
        return;
      }

      router.push(role === "captain" ? "/captain" : "/command");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12">
      <Card>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Create account
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Choose a role: Command or Captain.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <TextInput
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <TextInput
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="role">Role</FieldLabel>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
              className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
            >
              <option value="command">AS Command</option>
              <option value="captain">AS Captain</option>
            </select>
          </div>

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {info}
            </p>
          ) : null}

          <PrimaryButton type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </PrimaryButton>
        </form>

        <div className="mt-6 text-sm text-zinc-600">
          Already have an account? <InlineLink href="/login">Log in</InlineLink>
        </div>
      </Card>
    </div>
  );
}

