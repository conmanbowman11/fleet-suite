"use client";

// EQUIPMENT - the fleet list (the mechanic's home screen).
// Search by nickname, unit #, make, model, or serial. Each card shows
// the worst calendar status, open issues, and the latest meter reading.
// Retired machines sit under "Show retired" at the bottom.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, Equipment, todayISO } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { formatReading } from "@/lib/i18n";
import { latestByService, serviceStatus, worstStatus, Status } from "@/lib/maintenance";
import { AppPage, ErrorText, Loading, btnPrimary, btnQuiet, inputCls } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import MachineForm from "@/components/MachineForm";

export default function EquipmentPage() {
  return (
    <AppPage>
      <EquipmentList />
    </AppPage>
  );
}

function EquipmentList() {
  const { t, lang } = useSession();
  const router = useRouter();
  const [machines, setMachines] = useState<Equipment[]>([]);
  const [badges, setBadges] = useState<Record<string, Status | null>>({});
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showRetired, setShowRetired] = useState(false);

  useEffect(() => {
    (async () => {
      const [eq, svc, logs, iss] = await Promise.all([
        supabase.from("equipment").select("*").order("nickname"),
        supabase
          .from("machine_services")
          .select("id, equipment_id, interval_meter, interval_months")
          .eq("is_retired", false),
        supabase.from("log_entries").select("machine_service_id, service_date, meter_reading, created_at"),
        supabase.from("issues").select("equipment_id").eq("status", "open"),
      ]);
      if (eq.error) {
        setError(t("error_generic"));
        setLoading(false);
        return;
      }

      const latest = latestByService(logs.data || []);
      const today = todayISO();
      const perMachine: Record<string, (Status | null)[]> = {};
      for (const s of svc.data || []) {
        if (!s.interval_meter && !s.interval_months) continue; // repairs and one-offs: no status
        const st = serviceStatus(s, latest.get(s.id) || null, today).status;
        (perMachine[s.equipment_id] ||= []).push(st);
      }
      const b: Record<string, Status | null> = {};
      for (const [id, list] of Object.entries(perMachine)) b[id] = worstStatus(list);

      const counts: Record<string, number> = {};
      for (const i of iss.data || []) counts[i.equipment_id] = (counts[i.equipment_id] || 0) + 1;

      setMachines((eq.data as Equipment[]) || []);
      setBadges(b);
      setIssueCounts(counts);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return machines;
    return machines.filter((m) =>
      [m.nickname, m.unit_number, m.make, m.model, m.serial_number]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [machines, search]);

  const active = matching.filter((m) => m.is_active);
  const retired = matching.filter((m) => !m.is_active);

  if (loading) return <Loading />;

  function MachineCard({ m }: { m: Equipment }) {
    const issues = issueCounts[m.id] || 0;
    return (
      <Link
        href={`/equipment/${m.id}`}
        className={
          "block rounded-lg border border-seam p-4 shadow-sm hover:border-steel " +
          (m.is_active ? "bg-plate" : "bg-field opacity-70")
        }
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-lg font-bold">
            {m.unit_number && <span className="mr-2 font-mono text-faded">#{m.unit_number}</span>}
            {m.nickname}
          </span>
          <span className="flex shrink-0 items-center gap-2 pt-1">
            {m.is_active ? <StatusBadge status={badges[m.id] ?? null} /> : (
              <span className="rounded bg-seam px-2 py-0.5 text-xs font-bold tracking-wider text-faded">
                {t("retired").toUpperCase()}
              </span>
            )}
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2 text-sm text-faded">
          <span className="truncate">
            {[m.make, m.model].filter(Boolean).join(" ") || "—"}
            {m.serial_number ? ` · SN ${m.serial_number}` : ""}
          </span>
          <span className="shrink-0 font-mono">{formatReading(m.current_reading, m.meter_type, lang)}</span>
        </div>
        {issues > 0 && m.is_active && (
          <p className="mt-2 text-sm font-semibold text-safety">⚠ {t("open_issues_n", { n: issues })}</p>
        )}
      </Link>
    );
  }

  return (
    <>
      <ErrorText>{error}</ErrorText>

      <div className="mb-4 flex gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputCls}
          placeholder={t("search_equipment")}
        />
        <button onClick={() => setShowAdd(!showAdd)} className={`${btnPrimary} shrink-0`}>
          {showAdd ? t("close") : `+ ${t("add")}`}
        </button>
      </div>

      {showAdd && (
        <MachineForm
          onSaved={(m) => router.push(`/equipment/${m.id}?new=1`)}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {active.length === 0 ? (
        <div className="rounded-lg border border-dashed border-seam p-8 text-center text-faded">
          {machines.length === 0 ? t("no_equipment") : t("no_matches")}
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((m) => (
            <MachineCard key={m.id} m={m} />
          ))}
        </div>
      )}

      {retired.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setShowRetired(!showRetired)} className={`${btnQuiet} mb-3`}>
            {showRetired ? t("hide_retired") : t("show_retired", { n: retired.length })}
          </button>
          {showRetired && (
            <div className="space-y-3">
              {retired.map((m) => (
                <MachineCard key={m.id} m={m} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
