"use client";

// SHARED BUILDING BLOCKS used by every screen:
//   - AppPage: the page frame (checks login, shows the tab bar)
//   - Loading, ErrorText, Field: small pieces that repeat everywhere
//   - Style presets for inputs, buttons, and cards, so screens match

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, useRequireFarm } from "@/lib/session";
import Nav from "@/components/Nav";
import type { Person } from "@/lib/supabase";

// ---------- Style presets ----------
export const inputCls =
  "w-full rounded border border-seam bg-plate p-3 text-base text-ink focus:border-steel focus:outline-none";
export const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wider text-faded";
export const cardCls = "rounded-lg border border-seam bg-plate p-4 shadow-sm";
export const btnPrimary =
  "rounded bg-safety px-4 py-3 text-base font-bold text-white hover:bg-safetyDark disabled:opacity-50";
export const btnSecondary =
  "rounded bg-steel px-4 py-3 text-base font-bold text-white hover:bg-steelLight disabled:opacity-50";
export const btnOutline =
  "rounded border border-seam bg-plate px-4 py-3 text-base font-bold text-ink hover:border-steel disabled:opacity-50";
export const btnQuiet = "text-sm text-faded underline hover:text-ink";

// Where each role lands after picking their name
export function startPathFor(person: Person | null): string {
  return person?.role === "owner" ? "/pm" : "/equipment";
}

// ---------- Small pieces ----------
export function Loading() {
  const { t } = useSession();
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm uppercase tracking-widest text-faded">{t("loading")}</p>
    </main>
  );
}

export function ErrorText({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded bg-orange-50 p-3 text-sm text-safety">
      {children}
    </p>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faded">{hint}</span>}
    </label>
  );
}

// ---------- Page frame ----------
// need="farm"   -> signed in with a farm (Settings, device setup)
// need="person" -> also needs to know who's working (anything that logs work)
export function AppPage({
  need = "person",
  nav = true,
  wide = false,
  children,
}: {
  need?: "farm" | "person";
  nav?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const { status, person } = useSession();
  const farmOk = useRequireFarm();
  const router = useRouter();
  const pathname = usePathname();
  const needsPerson = need === "person";

  useEffect(() => {
    if (needsPerson && status === "ready" && !person) {
      router.replace(`/who?next=${encodeURIComponent(pathname)}`);
    }
  }, [needsPerson, status, person, router, pathname]);

  if (!farmOk || (needsPerson && !person)) return <Loading />;

  return (
    <main className={`mx-auto ${wide ? "max-w-4xl" : "max-w-2xl"} p-4 pb-16`}>
      {nav && <Nav />}
      {children}
    </main>
  );
}
