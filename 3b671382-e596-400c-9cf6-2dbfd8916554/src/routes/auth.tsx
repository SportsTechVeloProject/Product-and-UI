import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — VelocityLab Barbell Telemetry" },
      {
        name: "description",
        content:
          "Sign in to VelocityLab to save your barbell velocity sets to your account and review them from any device.",
      },
      { property: "og:title", content: "Sign in — VelocityLab" },
      {
        property: "og:description",
        content: "Save and revisit your barbell IMU sets across devices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      setBusy(false);
      setStatus(error ? error.message : "Check your inbox to confirm your address.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setStatus(error.message);
      return;
    }
    navigate({ to: "/" });
  }

  async function google() {
    setStatus(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setStatus("Google sign-in failed. Try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-5 py-10">
      <div className="w-full max-w-sm rounded-[28px] bg-card p-6 panel-ring">
        <h1 className="text-sm font-semibold tracking-tight">
          VELOCITY<span className="text-signal">LAB</span>
        </h1>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-mut">
          {mode === "signin" ? "Sign in to save sets" : "Create an account"}
        </p>

        <button
          onClick={google}
          className="mt-5 w-full rounded-2xl bg-panel px-4 py-3 font-mono text-xs font-medium panel-ring hover:bg-panel/70"
        >
          Continue with Google
        </button>

        <div className="my-4 flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-mut">
          <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="font-mono text-[10px] uppercase tracking-widest text-mut">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl bg-panel px-3 py-2.5 font-sans text-sm text-foreground outline-none panel-ring focus:ring-2 focus:ring-signal"
            />
          </label>
          <label className="font-mono text-[10px] uppercase tracking-widest text-mut">
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl bg-panel px-3 py-2.5 font-sans text-sm text-foreground outline-none panel-ring focus:ring-2 focus:ring-signal"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-2xl bg-ink px-4 py-3 font-mono text-xs font-semibold text-ink-foreground disabled:opacity-60"
          >
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {status ? (
          <p className="mt-3 font-mono text-[11px] text-signal">{status}</p>
        ) : null}

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 font-mono text-[11px] text-mut underline underline-offset-4 hover:text-foreground"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>

        <div className="mt-6">
          <Link to="/" className="font-mono text-[11px] text-mut hover:text-foreground">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
