"use client";

// The login screen. One shared login per farm.
// "Create account" and "Sign in" share this page - toggle at the bottom.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, getMyFarm } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setMessage("");
    if (!email || !password) {
      setMessage("Enter an email and password.");
      return;
    }
    setBusy(true);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage(error.message);
        setBusy(false);
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setMessage(error.message);
        setBusy(false);
        return;
      }
    }

    // Signed in - does this account have a farm yet?
    const farm = await getMyFarm();
    router.replace(farm ? "/equipment" : "/setup");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-block bg-steel px-4 py-2">
            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">
              Fleet Suite
            </h1>
          </div>
          <p className="mt-3 text-sm text-faded">
            Service logs &amp; parts orders for your equipment
          </p>
        </div>

        <div className="rounded-lg border border-seam bg-plate p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">
            {mode === "signin" ? "Sign in" : "Create your farm account"}
          </h2>

          <label className="mb-1 block text-xs font-semibold tracking-wider text-faded uppercase">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded border border-seam p-3 text-base"
            placeholder="farm@example.com"
            autoComplete="email"
          />

          <label className="mb-1 block text-xs font-semibold tracking-wider text-faded uppercase">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded border border-seam p-3 text-base"
            placeholder="••••••••"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />

          {message && (
            <p className="mb-4 rounded bg-orange-50 p-3 text-sm text-safety">
              {message}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={busy}
            className="w-full rounded bg-safety p-3 text-base font-bold text-white hover:bg-safetyDark disabled:opacity-50"
          >
            {busy
              ? "Working…"
              : mode === "signin"
              ? "Sign in"
              : "Create account"}
          </button>

          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setMessage("");
            }}
            className="mt-4 w-full text-center text-sm text-faded underline"
          >
            {mode === "signin"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </main>
  );
}
