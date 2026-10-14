"use client";

// FARM LOGIN - one shared account per farm, entered once per device.
// The English / Español switch lets a Spanish-speaking mechanic
// sign in on their own device before anyone is picked.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { ErrorText, Field, btnPrimary, cardCls, inputCls } from "@/components/ui";

export default function LoginPage() {
  const { status, t, lang, setLang, refresh } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Already signed in on this device? Skip ahead.
  useEffect(() => {
    if (status === "ready" || status === "no_farm") router.replace("/");
  }, [status, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!email.trim() || !password) {
      setMessage(t("enter_email_password"));
      return;
    }
    setBusy(true);

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) {
        setMessage(error.message);
        setBusy(false);
        return;
      }
      // If Supabase is set to require email confirmation, there's no session yet
      if (!data.session) {
        setMessage(
          lang === "es"
            ? "Revise su correo para confirmar la cuenta y luego inicie sesión."
            : "Check your email to confirm the account, then sign in."
        );
        setMode("signin");
        setBusy(false);
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setMessage(error.message);
        setBusy(false);
        return;
      }
    }

    await refresh();
    router.replace("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-block bg-steel px-4 py-2">
            <h1 className="text-2xl font-bold uppercase tracking-widest text-white">Fleet Suite</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={`${cardCls} space-y-4 p-6`}>
          <h2 className="text-lg font-semibold">
            {mode === "signin" ? t("sign_in") : t("create_farm_account")}
          </h2>

          <Field label={t("email")}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="farm@example.com"
              autoComplete="email"
            />
          </Field>

          <Field label={t("password")}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </Field>

          <ErrorText>{message}</ErrorText>

          <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
            {busy ? t("saving") : mode === "signin" ? t("sign_in") : t("create_account")}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setMessage("");
            }}
            className="w-full text-center text-sm text-faded underline"
          >
            {mode === "signin" ? t("new_here") : t("have_account")}
          </button>
        </form>

        <div className="mt-6 flex justify-center gap-2 text-sm">
          {(["en", "es"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={
                "rounded px-3 py-1 " +
                (lang === l ? "bg-steel font-bold text-white" : "text-faded underline")
              }
            >
              {l === "en" ? "English" : "Español"}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
