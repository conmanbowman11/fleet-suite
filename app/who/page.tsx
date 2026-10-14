"use client";

// WHO'S WORKING?
// Tap your name: the app switches to your language and stamps your
// name on everything you log. The last person shows first, so the same
// mechanic working through several machines needs only one tap.
//
// Brand-new farm with nobody set up yet? This screen adds the first
// person (usually the owner) so setup can continue.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, Person } from "@/lib/supabase";
import { useSession, useRequireFarm } from "@/lib/session";
import {
  ErrorText,
  Field,
  Loading,
  btnPrimary,
  btnSecondary,
  cardCls,
  inputCls,
  startPathFor,
} from "@/components/ui";

// The last person picked on this device (even if their 30 minutes ran out)
function lastPersonId(): string | null {
  try {
    const raw = window.localStorage.getItem("fs.active");
    return raw ? JSON.parse(raw)?.personId ?? null : null;
  } catch {
    return null;
  }
}

// Where to go after picking: the page they were headed to, or their start page
function nextPath(): string | null {
  try {
    const next = new URLSearchParams(window.location.search).get("next");
    return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  } catch {
    return null;
  }
}

export default function WhoPage() {
  const ready = useRequireFarm();
  const { activePeople, farm, t, selectPerson, refresh } = useSession();
  const router = useRouter();
  const [lastId, setLastId] = useState<string | null>(null);

  // First-person form
  const [name, setName] = useState("");
  const [role, setRole] = useState<"owner" | "mechanic">("owner");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLastId(lastPersonId());
  }, []);

  function pick(p: Person) {
    selectPerson(p.id);
    router.replace(nextPath() || startPathFor(p));
  }

  async function addFirstPerson(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!name.trim()) {
      setMessage(t("name_required"));
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("people")
      .insert({ farm_id: farm!.id, name: name.trim(), role, language })
      .select()
      .single();
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }
    await refresh();
    selectPerson((data as Person).id);
    router.replace("/"); // continues to device setup
  }

  if (!ready) return <Loading />;

  // ---------- Nobody set up yet: add the first person ----------
  if (activePeople.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <form onSubmit={addFirstPerson} className={`${cardCls} w-full max-w-sm space-y-4 p-6`}>
          <h1 className="text-lg font-semibold">{t("add_person")}</h1>
          <Field label={t("name")}>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </Field>
          <fieldset>
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-faded">
              {t("role")}
            </legend>
            <div className="flex gap-2">
              {(["owner", "mechanic"] as const).map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRole(r)}
                  aria-pressed={role === r}
                  className={
                    "flex-1 rounded border p-3 font-bold " +
                    (role === r ? "border-steel bg-steel text-white" : "border-seam bg-plate")
                  }
                >
                  {t(r === "owner" ? "role_owner" : "role_mechanic")}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-faded">
              {t("language")}
            </legend>
            <div className="flex gap-2">
              {(["en", "es"] as const).map((l) => (
                <button
                  type="button"
                  key={l}
                  onClick={() => setLanguage(l)}
                  aria-pressed={language === l}
                  className={
                    "flex-1 rounded border p-3 font-bold " +
                    (language === l ? "border-steel bg-steel text-white" : "border-seam bg-plate")
                  }
                >
                  {t(l === "en" ? "lang_en" : "lang_es")}
                </button>
              ))}
            </div>
          </fieldset>
          <ErrorText>{message}</ErrorText>
          <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
            {busy ? t("saving") : t("save_continue")}
          </button>
        </form>
      </main>
    );
  }

  // ---------- Pick who's working ----------
  const last = activePeople.find((p) => p.id === lastId) || null;
  const others = last ? activePeople.filter((p) => p.id !== last.id) : activePeople;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-4">
      <p className="mb-1 text-center text-sm font-bold uppercase tracking-wider text-faded">
        {farm?.name}
      </p>
      <h1 className="mb-6 text-center text-2xl font-bold">{t("who_working")}</h1>

      {last && (
        <div className="mb-6">
          <button onClick={() => pick(last)} className={`${btnPrimary} w-full py-5 text-lg`}>
            {t("continue_as", { name: last.name })} ✓
          </button>
          <p className="mt-4 text-center text-sm text-faded">{t("not_you", { name: last.name })}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {others.map((p) => (
          <button
            key={p.id}
            onClick={() => pick(p)}
            className={`${btnSecondary} py-5 text-lg`}
          >
            {p.name}
          </button>
        ))}
      </div>
    </main>
  );
}
