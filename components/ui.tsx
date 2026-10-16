"use client";

// SHARED BUILDING BLOCKS used by every screen:
//   - AppPage: the page frame (checks login, shows the sidebar)
//   - Loading, ErrorText, Field: small pieces that repeat everywhere
//   - Modal: a pop-up panel for forms
//   - Style presets for inputs, buttons, and cards, so screens match

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, useRequireFarm } from "@/lib/session";
import Nav from "@/components/Nav";
import { X } from "lucide-react";
import type { Person } from "@/lib/supabase";

// ---------- Style presets ----------
export const inputCls =
  "w-full rounded-md border border-seam bg-plate px-3 py-2.5 text-base text-ink placeholder:text-[#8A97A6] focus:border-safety focus:outline-none focus:ring-2 focus:ring-safety/20";
export const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-faded";
export const cardCls = "rounded-lg border border-seam bg-plate p-4";
export const btnPrimary =
  "rounded-md bg-safety px-4 py-3 text-base font-semibold text-white hover:bg-safetyDark disabled:opacity-50";
export const btnSecondary =
  "rounded-md bg-steel px-4 py-3 text-base font-semibold text-white hover:bg-steelLight disabled:opacity-50";
export const btnOutline =
  "rounded-md border border-[#9FB3C8] bg-plate px-4 py-3 text-base font-semibold text-ink hover:border-safety hover:text-safety disabled:opacity-50";
export const btnQuiet = "text-sm text-faded underline decoration-seam underline-offset-2 hover:text-safety";

// Where each role lands after picking their name
export function startPathFor(person: Person | null): string {
  return person?.role === "owner" ? "/dashboard" : "/equipment";
}

// ---------- Small pieces ----------
export function Loading() {
  const { t } = useSession();
  return (
    <div className="flex min-h-[50vh] flex-1 items-center justify-center">
      <p className="text-sm text-faded">{t("loading")}</p>
    </div>
  );
}

export function ErrorText({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-md border border-danger/30 bg-dangerSoft p-3 text-sm text-danger">
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

// A pop-up panel over the page (Add part, Add PM template...)
export function Modal({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0E2A47]/50 p-3 md:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-lg bg-plate shadow-xl`}
      >
        <div className="flex items-center justify-between border-b border-seam px-4 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-faded hover:text-ink">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ---------- Page frame ----------
// need="farm"   -> signed in with a farm (Settings, device setup)
// need="person" -> also needs to know who's working (anything that logs work)
// nav={false}   -> focused screens (log work, report a problem, labels):
//                  no sidebar, just the form
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

  if (!nav) {
    return <main className="mx-auto max-w-2xl p-4 pb-16 md:pt-8">{children}</main>;
  }

  return (
    <div className="min-h-screen md:flex">
      <Nav />
      <main className="min-w-0 flex-1">
        <div className={`mx-auto ${wide ? "max-w-6xl" : "max-w-3xl"} p-4 pb-16 md:p-8`}>{children}</div>
      </main>
    </div>
  );
}
