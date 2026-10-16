"use client";

// SERVICES AND REPAIRS for one machine.
//   - Add a service (with an interval) or a repair (no interval)
//   - Names come from the farm's shared list, so spelling stays the same
//     on every machine. A new name joins the list, with optional Spanish.
//   - Each one can have a parts kit, picked from the catalog
//   - Copy services from another machine (same model shows first)
//   - Edit, retire (keeps history), or delete (only if never logged)

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  supabase,
  CatalogPart,
  Equipment,
  KitPart,
  MachineService,
  ServiceName,
} from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { jobName } from "@/lib/i18n";
import {
  AppPage,
  ErrorText,
  Field,
  Loading,
  btnOutline,
  btnPrimary,
  btnQuiet,
  btnSecondary,
  cardCls,
  inputCls,
  labelCls,
} from "@/components/ui";
import { useIntervalText } from "@/components/StatusBadge";
import PartPicker from "@/components/PartPicker";

type Job = MachineService & { service_names: ServiceName | null };
type Kit = KitPart & { parts_catalog: CatalogPart | null };
type Category = "service" | "repair";

export default function ServicesPage() {
  return (
    <AppPage>
      <ServicesEditor />
    </AppPage>
  );
}

function ServicesEditor() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useSession();
  const intervalText = useIntervalText();

  const [machine, setMachine] = useState<Equipment | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [catalog, setCatalog] = useState<CatalogPart[]>([]);
  const [names, setNames] = useState<ServiceName[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<Category | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCopy, setShowCopy] = useState(false);
  const [showRetired, setShowRetired] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const [eq, js, cat, nm] = await Promise.all([
      supabase.from("equipment").select("*").eq("id", id).maybeSingle(),
      supabase.from("machine_services").select("*, service_names(*)").eq("equipment_id", id),
      supabase.from("parts_catalog").select("*").order("part_key"),
      supabase.from("service_names").select("*").order("name"),
    ]);
    const myJobs = (js.data as Job[]) || [];
    let myKits: Kit[] = [];
    if (myJobs.length) {
      const { data } = await supabase
        .from("kit_parts")
        .select("*, parts_catalog(*)")
        .in("machine_service_id", myJobs.map((j) => j.id));
      myKits = (data as Kit[]) || [];
    }
    setMachine(eq.data as Equipment | null);
    setJobs(myJobs);
    setKits(myKits);
    setCatalog((cat.data as CatalogPart[]) || []);
    setNames((nm.data as ServiceName[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    try {
      if (new URLSearchParams(window.location.search).get("copy")) setShowCopy(true);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const sortByName = (a: Job, b: Job) =>
    jobName(a.service_names, lang).localeCompare(jobName(b.service_names, lang));
  const active = jobs.filter((j) => !j.is_retired).sort(sortByName);
  const retired = jobs.filter((j) => j.is_retired).sort(sortByName);

  function upsertCatalog(p: CatalogPart) {
    setCatalog((c) => (c.some((x) => x.id === p.id) ? c.map((x) => (x.id === p.id ? p : x)) : [...c, p]));
  }

  async function setRetired(job: Job, value: boolean) {
    const { error } = await supabase.from("machine_services").update({ is_retired: value }).eq("id", job.id);
    if (error) return setMessage(error.message);
    setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, is_retired: value } : j)));
  }

  async function deleteJob(job: Job) {
    const name = jobName(job.service_names, lang);
    if (!window.confirm(t("delete_job_confirm", { name }))) return;
    const { error } = await supabase.from("machine_services").delete().eq("id", job.id);
    if (error) {
      setMessage(error.code === "23503" ? t("job_has_history", { name }) : error.message);
      return;
    }
    setJobs((js) => js.filter((j) => j.id !== job.id));
    setKits((ks) => ks.filter((k) => k.machine_service_id !== job.id));
  }

  if (loading) return <Loading />;
  if (!machine) return <p className="py-10 text-center text-faded">{t("no_matches")}</p>;

  const usedNameIds = new Set(jobs.map((j) => j.service_name_id));

  // A render helper (not a component) so open forms keep what's typed
  function renderSection(category: Category) {
    const list = active.filter((j) => j.category === category);
    return (
      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-faded">
            {t(category === "service" ? "services" : "repairs")} ({list.length})
          </h2>
          <button
            onClick={() => {
              setAdding(category);
              setEditingId(null);
            }}
            className="text-sm font-bold text-safety"
          >
            + {t(category === "service" ? "add_service" : "add_repair")}
          </button>
        </div>

        {adding === category && (
          <JobForm
            machine={machine!}
            category={category}
            names={names}
            usedNameIds={usedNameIds}
            onNameCreated={(n) => setNames((ns) => [...ns, n])}
            onSaved={(j) => {
              setJobs((js) => [...js, j]);
              setAdding(null);
            }}
            onCancel={() => setAdding(null)}
          />
        )}

        <div className="space-y-3">
          {list.map((j) =>
            editingId === j.id ? (
              <JobForm
                key={j.id}
                machine={machine!}
                category={category}
                job={j}
                names={names}
                usedNameIds={usedNameIds}
                onNameCreated={(n) => setNames((ns) => [...ns, n])}
                onSaved={(updated) => {
                  setJobs((js) => js.map((x) => (x.id === updated.id ? updated : x)));
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <JobCard
                key={j.id}
                job={j}
                interval={category === "service" ? intervalText(j.interval_meter, j.interval_months, machine!.meter_type) : ""}
                kit={kits.filter((k) => k.machine_service_id === j.id)}
                catalog={catalog}
                onCatalogChange={upsertCatalog}
                onKitChange={(next) =>
                  setKits((ks) => [...ks.filter((k) => k.machine_service_id !== j.id), ...next])
                }
                onEdit={() => {
                  setEditingId(j.id);
                  setAdding(null);
                }}
                onRetire={() => setRetired(j, true)}
                onDelete={() => deleteJob(j)}
              />
            )
          )}
        </div>
      </section>
    );
  }

  return (
    <>
      <Link href={`/equipment/${machine.id}`} className={`${btnQuiet} mb-3 inline-block`}>
        ← {machine.nickname}
      </Link>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold">{t("services_and_repairs")}</h1>
        <button onClick={() => setShowCopy(!showCopy)} className={`${btnOutline} shrink-0 py-2 text-sm`}>
          {showCopy ? t("close") : t("copy_from_machine")}
        </button>
      </div>

      <ErrorText>{message}</ErrorText>

      {showCopy && (
        <CopyPanel
          target={machine}
          existingNameIds={usedNameIds}
          onCopied={(newJobs, newKits) => {
            setJobs((js) => [...js, ...newJobs]);
            setKits((ks) => [...ks, ...newKits]);
            setShowCopy(false);
          }}
        />
      )}

      {renderSection("service")}
      {renderSection("repair")}

      {retired.length > 0 && (
        <section>
          <button onClick={() => setShowRetired(!showRetired)} className={`${btnQuiet} mb-2`}>
            {t("retired_jobs", { n: retired.length })}
          </button>
          {showRetired && (
            <ul className={`${cardCls} divide-y divide-seam`}>
              {retired.map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-faded">{jobName(j.service_names, lang)}</span>
                  <button onClick={() => setRetired(j, false)} className="text-sm font-bold text-steel">
                    {t("return_active")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

// ======================================================================
// Name picker: pick from the farm's shared list, or add a new name
// ======================================================================
function NamePicker({
  category,
  names,
  usedNameIds,
  value,
  onChange,
  onNameCreated,
}: {
  category: Category;
  names: ServiceName[];
  usedNameIds: Set<string>;
  value: ServiceName | null;
  onChange: (n: ServiceName | null) => void;
  onNameCreated: (n: ServiceName) => void;
}) {
  const { farm, t, lang } = useSession();
  const [text, setText] = useState("");
  const [nameEs, setNameEs] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const q = text.trim().toLowerCase();
  const options = useMemo(
    () =>
      names
        .filter((n) => n.category === category && !n.is_hidden)
        .filter((n) => !q || n.name.toLowerCase().includes(q) || (n.name_es || "").toLowerCase().includes(q))
        .sort((a, b) => jobName(a, lang).localeCompare(jobName(b, lang))),
    [names, category, q, lang]
  );
  const exact = names.some(
    (n) => n.name.toLowerCase() === q || (n.name_es || "").toLowerCase() === q
  );

  async function createName() {
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase
      .from("service_names")
      .insert({ farm_id: farm!.id, name: text.trim(), name_es: nameEs.trim() || null, category })
      .select()
      .single();
    setBusy(false);
    if (error) {
      setMessage(error.code === "23505" ? t("name_taken") : error.message);
      return;
    }
    onNameCreated(data as ServiceName);
    onChange(data as ServiceName);
    setText("");
    setNameEs("");
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded border border-steel bg-field p-3">
        <span className="font-semibold">{jobName(value, lang)}</span>
        <button type="button" onClick={() => onChange(null)} className={btnQuiet}>
          {t("edit")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        className={inputCls}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("job_name_placeholder")}
      />
      <div className="max-h-56 divide-y divide-seam overflow-y-auto rounded border border-seam bg-plate">
        {options.map((n) => {
          const taken = usedNameIds.has(n.id);
          return (
            <button
              type="button"
              key={n.id}
              disabled={taken}
              onClick={() => onChange(n)}
              className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-field disabled:opacity-40"
            >
              <span>{jobName(n, lang)}</span>
              {taken && <span className="text-xs text-faded">✓</span>}
            </button>
          );
        })}
        {q && !exact && (
          <div className="space-y-2 p-3">
            <p className="text-sm font-semibold">{t("name_new", { text: text.trim() })}</p>
            <input
              className={inputCls}
              value={nameEs}
              onChange={(e) => setNameEs(e.target.value)}
              placeholder={t("new_name_spanish")}
            />
            <button type="button" disabled={busy} onClick={createName} className={`${btnSecondary} w-full`}>
              {busy ? t("saving") : t("add_name")}
            </button>
          </div>
        )}
      </div>
      <ErrorText>{message}</ErrorText>
    </div>
  );
}

// ======================================================================
// Add / edit one service or repair
// ======================================================================
function JobForm({
  machine,
  category,
  job,
  names,
  usedNameIds,
  onNameCreated,
  onSaved,
  onCancel,
}: {
  machine: Equipment;
  category: Category;
  job?: Job;
  names: ServiceName[];
  usedNameIds: Set<string>;
  onNameCreated: (n: ServiceName) => void;
  onSaved: (j: Job) => void;
  onCancel: () => void;
}) {
  const { farm, t, lang } = useSession();
  const [name, setName] = useState<ServiceName | null>(job?.service_names ?? null);
  const [intervalMeter, setIntervalMeter] = useState(job?.interval_meter ? String(job.interval_meter) : "");
  const [intervalMonths, setIntervalMonths] = useState(job?.interval_months ? String(job.interval_months) : "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // When editing, the job's own name isn't "taken"
  const taken = new Set(usedNameIds);
  if (job) taken.delete(job.service_name_id);

  const unitWord = t(machine.meter_type === "miles" ? "meter_miles" : "meter_hours").toLowerCase();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!name) {
      setMessage(t("pick_job_error"));
      return;
    }
    setBusy(true);
    const values = {
      service_name_id: name.id,
      category,
      interval_meter:
        category === "service" && machine.meter_type !== "none" && intervalMeter ? Number(intervalMeter) : null,
      interval_months: category === "service" && intervalMonths ? Number(intervalMonths) : null,
    };
    const query = job
      ? supabase.from("machine_services").update(values).eq("id", job.id).select("*, service_names(*)").single()
      : supabase
          .from("machine_services")
          .insert({ ...values, farm_id: farm!.id, equipment_id: machine.id })
          .select("*, service_names(*)")
          .single();
    const { data, error } = await query;
    setBusy(false);
    if (error) {
      setMessage(error.code === "23505" ? t("already_on_machine", { name: jobName(name, lang) }) : error.message);
      return;
    }
    onSaved(data as Job);
  }

  return (
    <form onSubmit={save} className={`${cardCls} mb-3 space-y-3 border-steel`}>
      <div>
        <span className={labelCls}>{t("job_name")}</span>
        <NamePicker
          category={category}
          names={names}
          usedNameIds={taken}
          value={name}
          onChange={setName}
          onNameCreated={onNameCreated}
        />
      </div>

      {category === "service" && (
        <div className="grid grid-cols-2 gap-2">
          {machine.meter_type !== "none" && (
            <Field label={t("interval_meter_label", { unit: unitWord })}>
              <input
                type="number"
                inputMode="numeric"
                className={inputCls}
                value={intervalMeter}
                onChange={(e) => setIntervalMeter(e.target.value)}
                placeholder="500"
              />
            </Field>
          )}
          <Field label={t("interval_months_label")}>
            <input
              type="number"
              inputMode="numeric"
              className={inputCls}
              value={intervalMonths}
              onChange={(e) => setIntervalMonths(e.target.value)}
              placeholder="12"
            />
          </Field>
        </div>
      )}

      <ErrorText>{message}</ErrorText>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={`${btnSecondary} flex-1`}>
          {busy ? t("saving") : t("save")}
        </button>
        <button type="button" onClick={onCancel} className={btnOutline}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

// ======================================================================
// One service or repair, with its parts kit
// ======================================================================
function JobCard({
  job,
  interval,
  kit,
  catalog,
  onCatalogChange,
  onKitChange,
  onEdit,
  onRetire,
  onDelete,
}: {
  job: Job;
  interval: string;
  kit: Kit[];
  catalog: CatalogPart[];
  onCatalogChange: (p: CatalogPart) => void;
  onKitChange: (kit: Kit[]) => void;
  onEdit: () => void;
  onRetire: () => void;
  onDelete: () => void;
}) {
  const { farm, t, lang } = useSession();
  const [showPicker, setShowPicker] = useState(false);
  const [message, setMessage] = useState("");

  async function addPart(part: CatalogPart) {
    setMessage("");
    const existing = kit.find((k) => k.part_id === part.id);
    if (existing) {
      setMessage(t("kit_already"));
      return;
    }
    const { data, error } = await supabase
      .from("kit_parts")
      .insert({ farm_id: farm!.id, machine_service_id: job.id, part_id: part.id, quantity: 1 })
      .select("*, parts_catalog(*)")
      .single();
    if (error) return setMessage(error.message);
    onKitChange([...kit, data as Kit]);
    setShowPicker(false);
  }

  async function setQty(k: Kit, qty: number) {
    if (!qty || qty < 1) return;
    onKitChange(kit.map((x) => (x.id === k.id ? { ...x, quantity: qty } : x)));
    await supabase.from("kit_parts").update({ quantity: qty }).eq("id", k.id);
  }

  async function removePart(k: Kit) {
    const { error } = await supabase.from("kit_parts").delete().eq("id", k.id);
    if (error) return setMessage(error.message);
    onKitChange(kit.filter((x) => x.id !== k.id));
  }

  return (
    <div className={cardCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{jobName(job.service_names, lang)}</p>
          {interval && <p className="text-sm text-faded">{interval}</p>}
        </div>
        <button onClick={onEdit} className={`${btnQuiet} shrink-0`}>
          {t("edit")}
        </button>
      </div>

      <div className="mt-3 border-t border-seam pt-2">
        <p className={labelCls}>{t("kit")}</p>
        {kit.length === 0 ? (
          <p className="text-sm text-faded">{t("no_kit")}</p>
        ) : (
          <ul className="divide-y divide-seam">
            {kit
              .slice()
              .sort((a, b) => (a.parts_catalog?.part_key || "").localeCompare(b.parts_catalog?.part_key || ""))
              .map((k) => (
                <li key={k.id} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-sm font-semibold">{k.parts_catalog?.part_number}</span>
                    {k.parts_catalog?.description && (
                      <span className="ml-2 text-sm text-faded">{k.parts_catalog.description}</span>
                    )}
                  </span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    aria-label={t("qty")}
                    defaultValue={k.quantity}
                    onBlur={(e) => setQty(k, Number(e.target.value))}
                    className="w-16 rounded border border-seam p-1.5 text-right"
                  />
                  <button onClick={() => removePart(k)} aria-label={t("remove")} className="px-2 text-faded hover:text-safety">
                    ✕
                  </button>
                </li>
              ))}
          </ul>
        )}

        {showPicker ? (
          <div className="mt-2">
            <PartPicker catalog={catalog} onCatalogChange={onCatalogChange} onPick={addPart} />
            <button onClick={() => setShowPicker(false)} className={`${btnQuiet} mt-2`}>
              {t("cancel")}
            </button>
          </div>
        ) : (
          <button onClick={() => setShowPicker(true)} className="mt-2 text-sm font-bold text-safety">
            + {t("add_part")}
          </button>
        )}
        <ErrorText>{message}</ErrorText>
      </div>

      <div className="mt-3 flex justify-end gap-4 border-t border-seam pt-2 text-sm">
        <button onClick={onRetire} className={btnQuiet}>
          {t("retire_service")}
        </button>
        <button onClick={onDelete} className={`${btnQuiet} hover:text-safety`}>
          {t("delete")}
        </button>
      </div>
    </div>
  );
}

// ======================================================================
// Copy services (and their kits) from another machine
// ======================================================================
function CopyPanel({
  target,
  existingNameIds,
  onCopied,
}: {
  target: Equipment;
  existingNameIds: Set<string>;
  onCopied: (jobs: Job[], kits: Kit[]) => void;
}) {
  const { farm, t, lang } = useSession();
  const [machines, setMachines] = useState<Equipment[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [sourceJobs, setSourceJobs] = useState<Job[]>([]);
  const [sourceKits, setSourceKits] = useState<KitPart[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const sameModel = (m: Equipment) =>
    !!target.model &&
    (m.make || "").toLowerCase() === (target.make || "").toLowerCase() &&
    (m.model || "").toLowerCase() === target.model.toLowerCase();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("equipment").select("*").neq("id", target.id).order("nickname");
      const list = ((data as Equipment[]) || []).sort((a, b) => Number(sameModel(b)) - Number(sameModel(a)));
      setMachines(list);
      const first = list.find(sameModel);
      if (first) pickSource(first.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.id]);

  async function pickSource(mid: string) {
    setSourceId(mid);
    setMessage("");
    if (!mid) {
      setSourceJobs([]);
      return;
    }
    const { data } = await supabase
      .from("machine_services")
      .select("*, service_names(*)")
      .eq("equipment_id", mid)
      .eq("is_retired", false);
    const js = (data as Job[]) || [];
    let ks: KitPart[] = [];
    if (js.length) {
      const { data: k } = await supabase.from("kit_parts").select("*").in("machine_service_id", js.map((j) => j.id));
      ks = (k as KitPart[]) || [];
    }
    setSourceJobs(js);
    setSourceKits(ks);
    const c: Record<string, boolean> = {};
    for (const j of js) c[j.id] = !existingNameIds.has(j.service_name_id);
    setChecked(c);
  }

  const chosen = sourceJobs.filter((j) => checked[j.id] && !existingNameIds.has(j.service_name_id));
  const source = machines.find((m) => m.id === sourceId);

  async function copy() {
    if (!chosen.length || !source) return;
    setBusy(true);
    const sameMeter = source.meter_type === target.meter_type;
    const { data, error } = await supabase
      .from("machine_services")
      .insert(
        chosen.map((j) => ({
          farm_id: farm!.id,
          equipment_id: target.id,
          service_name_id: j.service_name_id,
          category: j.category,
          interval_meter: sameMeter && target.meter_type !== "none" ? j.interval_meter : null,
          interval_months: j.interval_months,
        }))
      )
      .select("*, service_names(*)");
    if (error) {
      setBusy(false);
      setMessage(error.message);
      return;
    }
    const newJobs = (data as Job[]) || [];
    const idFor = new Map<string, string>();
    for (const nj of newJobs) {
      const src = chosen.find((c) => c.service_name_id === nj.service_name_id);
      if (src) idFor.set(src.id, nj.id);
    }
    const kitRows = sourceKits
      .filter((k) => idFor.has(k.machine_service_id))
      .map((k) => ({
        farm_id: farm!.id,
        machine_service_id: idFor.get(k.machine_service_id)!,
        part_id: k.part_id,
        quantity: k.quantity,
      }));
    let newKits: Kit[] = [];
    if (kitRows.length) {
      const { data: kd } = await supabase.from("kit_parts").insert(kitRows).select("*, parts_catalog(*)");
      newKits = (kd as Kit[]) || [];
    }
    setBusy(false);
    onCopied(newJobs, newKits);
  }

  return (
    <div className={`${cardCls} mb-6 space-y-3 border-2 border-steel`}>
      <Field label={t("copy_from_title")}>
        <select className={inputCls} value={sourceId} onChange={(e) => pickSource(e.target.value)}>
          <option value="">{t("pick_machine")}</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.unit_number ? `#${m.unit_number} ` : ""}
              {m.nickname}
              {m.model ? ` — ${[m.make, m.model].filter(Boolean).join(" ")}` : ""}
            </option>
          ))}
        </select>
      </Field>

      {sourceId && sourceJobs.length === 0 && <p className="text-sm text-faded">{t("nothing_to_copy")}</p>}

      {sourceJobs.length > 0 && (
        <>
          <ul className="divide-y divide-seam rounded border border-seam">
            {sourceJobs.map((j) => {
              const has = existingNameIds.has(j.service_name_id);
              const parts = sourceKits.filter((k) => k.machine_service_id === j.id).length;
              return (
                <li key={j.id}>
                  <label className={"flex items-center gap-3 p-3 " + (has ? "opacity-40" : "")}>
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[#1E5BA8]"
                      disabled={has}
                      checked={!!checked[j.id] && !has}
                      onChange={(e) => setChecked({ ...checked, [j.id]: e.target.checked })}
                    />
                    <span className="flex-1">
                      <span className="font-semibold">{jobName(j.service_names, lang)}</span>
                      <span className="block text-xs text-faded">
                        {t(j.category === "service" ? "service" : "repair")}
                        {parts ? ` · ${t("n_items", { n: parts })}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-faded">{t("copy_skip_note")}</p>
          <ErrorText>{message}</ErrorText>
          <button disabled={busy || !chosen.length} onClick={copy} className={`${btnPrimary} w-full`}>
            {busy ? t("saving") : t("copy_n", { n: chosen.length })}
          </button>
        </>
      )}
    </div>
  );
}
