"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Anchor, Lock, Ship, User } from "lucide-react";
import { getUserRole } from "../lib/authRole";
import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      const role = getUserRole(data.user);
      if (!role) {
        router.push("/choose-role");
        return;
      }
      router.push(role === "captain" ? "/captain" : "/command");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#0a1921] text-white flex items-center justify-center font-sans overflow-hidden relative">
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#1b3a4b] via-[#0a1921] to-[#051118]" />

        <div className="absolute top-[10%] right-[15%] w-32 h-32 bg-[#e2f1f5] rounded-full blur-[2px] shadow-[0_0_80px_rgba(226,241,245,0.4)] opacity-80" />

        <div className="absolute top-[20%] left-[-10%] w-[120%] h-64 bg-cyan-900/20 rounded-[100%] blur-3xl transform -rotate-12" />
        <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/40 to-transparent" />

        <div className="absolute bottom-[8%] left-[12%] opacity-20 animate-float">
          <Ship size={280} strokeWidth={0.5} className="text-cyan-200" />
        </div>
        <div className="absolute bottom-[18%] right-[8%] opacity-10 rotate-[-12deg]">
          <Ship size={180} strokeWidth={0.5} className="text-cyan-100" />
        </div>

        <div className="absolute bottom-0 left-0 w-full opacity-20">
          <svg viewBox="0 0 1440 320" className="w-full">
            <path
              fill="#083344"
              d="M0,192L48,197.3C96,203,192,213,288,197.3C384,181,480,139,576,138.7C672,139,768,181,864,186.7C960,192,1056,160,1152,144C1248,128,1344,128,1392,128L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
            />
          </svg>
        </div>
      </div>

      <main
        className={[
          "relative z-10 w-full max-w-[420px] px-6 transition-all duration-1000 transform",
          isLoaded ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0",
        ].join(" ")}
      >
        <div className="bg-white/[0.07] backdrop-blur-[20px] border border-white/20 rounded-[45px] p-10 md:p-12 shadow-[0_25px_60px_rgba(0,0,0,0.4)]">
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Anchor className="text-white/80" size={24} />
              <h1 className="text-4xl font-bold tracking-tighter uppercase italic">
                Marine<span className="text-cyan-400">X</span>
              </h1>
            </div>
            <p className="text-white/30 text-[10px] uppercase tracking-[0.5em] font-medium">
              Secure Terminal
            </p>
            <p className="mt-4 text-[10px] uppercase tracking-[0.35em] text-white/35">
              Command / Captain Access
            </p>
          </div>

          <form className="space-y-5" onSubmit={onSubmit}>
            <div className="relative group">
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="Operator Identity"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full bg-black/30 border border-white/10 rounded-full py-4 pl-6 pr-12 text-sm outline-none focus:bg-black/50 focus:border-white/40 transition-all placeholder:text-white/20 disabled:opacity-70"
                required
              />
              <User
                className="absolute right-5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white/60 transition-colors"
                size={18}
              />
            </div>

            <div className="relative group">
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Access Key"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full bg-black/30 border border-white/10 rounded-full py-4 pl-6 pr-12 text-sm outline-none focus:bg-black/50 focus:border-white/40 transition-all placeholder:text-white/20 disabled:opacity-70"
                required
              />
              <Lock
                className="absolute right-5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white/60 transition-colors"
                size={18}
              />
            </div>

            {error ? (
              <div className="rounded-3xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <button
              disabled={loading}
              className="w-full bg-white text-[#0a1921] font-bold py-4 rounded-full shadow-xl hover:bg-white/90 active:scale-[0.98] transition-all text-base mt-4 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Logging in…" : "Login"}
            </button>
          </form>
        </div>

        <div className="mt-8 flex justify-center items-center gap-4 opacity-20">
          <div className="h-[1px] w-8 bg-white" />
          <div className="w-2 h-2 rounded-full border border-white" />
          <div className="h-[1px] w-8 bg-white" />
        </div>
      </main>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-12px) rotate(2deg); }
        }
        .animate-float {
          animation: float 10s ease-in-out infinite;
        }
        body {
          background-color: #0a1921;
          margin: 0;
          height: 100vh;
        }
      `}</style>
    </div>
  );
}

