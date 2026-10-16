"use client";

// PM TEMPLATES for one machine (works like Oil Track Pro's service templates).
// A template is everything one service needs, saved in one go:
//   - Name (from the farm's shared list, so spelling matches every machine)
//   - How often: every X hours / miles and/or every X months
//   - Parts and fluids, picked from the Parts list, with quantities
//     (oil is a fluid on the list, e.g. 7.5 gal of 15W-40)
//   - Tasks: a checklist shown every time the service is logged
//   - Notes
// Also: copy templates from another machine, retire (keeps history),
// or delete (only if never logged).
//   ?add=1    opens a new template     ?edit=ID   opens that template
//   ?copy=1   opens "Copy from another machine"

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
import { isFluid, qtyText } from "@/lib/parts";
import {
  AppPage,
  ErrorText,
  Field,
  Loading,
  Modal,
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
import { Plus, X } from "lucide-react";

type Job = MachineService & { service_names: ServiceName | null };
type Kit = KitPart & { parts_catalog: CatalogPart | null };

function readParam(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

export default function TemplatesPage() {
  return (
    <AppPage>
      <TemplatesEditor />
    </AppPage>
  );
}

function TemplatesEditor() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useSession();
  const intervalText = useIntervalText();

  const [machine, setMachine] = useState<Equipment | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [catalog, setCatalog] = useState<CatalogPart[]>([]);
  const [names, setNames] = useState<ServiceName[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Job | "new" | null>(null);
  const [showCopy, setShowCopy] = useState(false);
  const [showRetired, setShowRetired] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const [eq, js, cat, nm] = await Promise.all([
        supabase.from("equipment").select("*").eq("id", id).maybeSingle(),
        supabase.from("machine_services").select("*, service_names(*)").eq("equipment_id", id),
        supabase.from("parts_catalog").select("*").order("part_key"),
        supabase.from("service_names").select("*").order("name"),
      ]);
      const myJobs = ((js.data as Job[]) || []).filter((j) => j.category === "service");
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

      if (readParam("copy")) setShowCopy(true);
      if (readParam("add")) setForm("new");
      const editId = readParam("edit");
      const toEdit = editId && myJobs.find((j) => j.id === editId);
      if (toEdit) setForm(toEdit);
    })();
  }, [id]);

  const sortByName = (a: Job, b: Job) =>
    jobName(a.service_names, lang).localeCompare(jobName(b.service_names, lang));
  const active = jobs.filter((j) => !j.is_retired).sort(sortByName);
  const retired = jobs.filter((j) => j.is_retired).sort(sortByName);

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

  return (
    <>
      <Link href={`/equipment/${machine.id}`} className={`${btnQuiet} mb-3 inline-block`}>
        ← {machine.nickname}
      </Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">
          {t("pm_templates")} ({active.length})
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setShowCopy(!showCopy)} className={`${btnOutline} py-2 text-sm`}>
            {showCopy ? t("close") : t("copy_from_machine")}
          </button>
          <button onClick={() => setForm("new")} className={`${btnPrimary} flex items-center gap-1.5 py-2 text-sm`}>
            <Plus size={16} aria-hidden="true" /> {t("add_template")}
          </button>
        </div>
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

      {active.length === 0 ? (
        <p className={`${cardCls} text-sm text-faded`}>{t("no_templates")}</p>
      ) : (
        <div className="space-y-3">
          {active.map((j) => (
            <TemplateCard
              key={j.id}
              job={j}
              interval={intervalText(j.interval_meter, j.interval_months, machine.meter_type)}
              kit={kits.filter((k) => k.machine_service_id === j.id)}
              onEdit={() => setForm(j)}
              onRetire={() => setRetired(j, true)}
              onDelete={() => deleteJob(j)}
            />
          ))}
        </div>
      )}

      {retired.length > 0 && (
        <section className="mt-6">
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

      {form && (
        <TemplateForm
          machine={machine}
          job={form === "new" ? undefined : form}
          kit={form === "new" ? [] : kits.filter((k) => k.machine_service_id === form.id)}
          catalog={catalog}
          names={names}
          usedNameIds={usedNameIds}
          onNameCreated={(n) => setNames((ns) => [...ns, n])}
          onSaved={(job, kit) => {
            setJobs((js) => (js.some((x) => x.id === job.id) ? js.map((x) => (x.id === job.id ? job : x)) : [...js, job]));
            setKits((ks) => [...ks.filter((k) => k.machine_service_id !== job.id), ...kit]);
            setForm(null);
          }}
          onClose={() => setForm(null)}
        />
      )}
    </>
  );
}

// ======================================================================
// One template: what's in it
// ======================================================================
function TemplateCard({
  job,
  interval,
  kit,
  onEdit,
  onRetire,
  onDelete,
}: {
  job: Job;
  interval: string;
  kit: Kit[];
  onEdit: () => void;
  onRetire: () => void;
  onDelete: () => void;
}) {
  const { t, lang } = useSession();
  const sorted = kit
    .slice()
    .sort(
      (a, b) =>
        Number(isFluid(a.parts_catalog)) - Number(isFluid(b.parts_catalog)) ||
        (a.parts_catalog?.part_key || "").localeCompare(b.parts_catalog?.part_key || "")
    );

  return (
    <div className={cardCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold">{jobName(job.service_names, lang)}</p>
          {interval && <p className="text-sm text-faded">{interval}</p>}
        </div>
        <button onClick={onEdit} className={`${btnOutline} shrink-0 py-1.5 text-sm`}>
          {t("edit")}
        </button>
      </div>

      <p className={`${labelCls} mt-3`}>{t("parts_and_fluids")}</p>
      {sorted.length === 0 ? (
        <p className="text-sm text-faded">{t("no_kit")}</p>
      ) : (
        <ul className="divide-y divide-seam rounded-md border border-seam">
          {sorted.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-[6rem] font-mono font-semibold">{k.parts_catalog?.part_number}</span>
              <span className="min-w-0 flex-1 truncate">
                {k.parts_catalog?.description}
                {isFluid(k.parts_catalog) && (
                  <span className="ml-2 rounded bg-cautionSoft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-cautionInk">
                    {t("fluid")}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-faded">×{qtyText(k.quantity, k.parts_catalog?.unit)}</span>
            </li>
          ))}
        </ul>
      )}

      {(job.tasks || []).length > 0 && (
        <>
          <p className={`${labelCls} mt-3`}>{t("tasks")}</p>
          <ul className="list-inside list-disc text-sm">
            {job.tasks.map((task, i) => (
              <li key={i}>{task}</li>
            ))}
          </ul>
        </>
      )}

      {job.notes && <p className="mt-3 whitespace-pre-line text-sm text-faded">{job.notes}</p>}

      <div className="mt-3 flex justify-end gap-4 border-t border-seam pt-2 text-sm">
        <button onClick={onRetire} className={btnQuiet}>
          {t("retire_service")}
        </button>
        <button onClick={onDelete} className={`${btnQuiet} hover:text-danger`}>
          {t("delete")}
        </button>
      </div>
    </div>
  );
}

// ======================================================================
// Name picker: pick from the farm's shared list, or add a new name
// ======================================================================
function NamePicker({
  names,
  usedNameIds,
  value,
  onChange,
  onNameCreated,
}: {
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
        .filter((n) => n.category === "service" && !n.is_hidden)
        .filter((n) => !q || n.name.toLowerCase().includes(q) || (n.name_es || "").toLowerCase().includes(q))
        .sort((a, b) => jobName(a, lang).localeCompare(jobName(b, lang))),
    [names, q, lang]
  );
  const exact = names.some((n) => n.name.toLowerCase() === q || (n.name_es || "").toLowerCase() === q);

  async function createName() {
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase
      .from("service_names")
      .insert({ farm_id: farm!.id, name: text.trim(), name_es: nameEs.trim() || null, category: "service" })
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
      <div className="flex items-center justify-between gap-3 rounded-md border border-safety bg-tint p-3">
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
        autoFocus
      />
      <div className="max-h-48 divide-y divide-seam overflow-y-auto rounded-md border border-seam bg-plate">
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
// Add / edit a template: name, interval, parts and fluids, tasks, notes
// ======================================================================
type Line = { part: CatalogPart; quantity: string };

function TemplateForm({
  machine,
  job,
  kit,
  catalog,
  names,
  usedNameIds,
  onNameCreated,
  onSaved,
  onClose,
}: {
  machine: Equipment;
  job?: Job;
  kit: Kit[];
  catalog: CatalogPart[];
  names: ServiceName[];
  usedNameIds: Set<string>;
  onNameCreated: (n: ServiceName) => void;
  onSaved: (j: Job, kit: Kit[]) => void;
  onClose: () => void;
}) {
  const { farm, t, lang } = useSession();
  const [name, setName] = useState<ServiceName | null>(job?.service_names ?? null);
  const [intervalMeter, setIntervalMeter] = useState(job?.interval_meter ? String(job.interval_meter) : "");
  const [intervalMonths, setIntervalMonths] = useState(job?.interval_months ? String(job.interval_months) : "");
  const [lines, setLines] = useState<Line[]>(
    kit.filter((k) => k.parts_catalog).map((k) => ({ part: k.parts_catalog!, quantity: String(k.quantity) }))
  );
  const [tasks, setTasks] = useState<string[]>(job?.tasks?.length ? job.tasks : []);
  const [notes, setNotes] = useState(job?.notes ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // When editing, the template's own name isn't "taken"
  const taken = new Set(usedNameIds);
  if (job) taken.delete(job.service_name_id);
  const unitWord = t(machine.meter_type === "miles" ? "meter_miles" : "meter_hours").toLowerCase();

  function addPart(p: CatalogPart) {
    setLines((ls) => {
      const same = ls.find((l) => l.part.id === p.id);
      if (same) return ls.map((l) => (l === same ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l));
      return [...ls, { part: p, quantity: "1" }];
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!name) return setMessage(t("pick_job_error"));
    const kitLines = lines.filter((l) => Number(l.quantity) > 0);
    setBusy(true);

    const values = {
      service_name_id: name.id,
      category: "service" as const,
      interval_meter: machine.meter_type !== "none" && intervalMeter ? Number(intervalMeter) : null,
      interval_months: intervalMonths ? Number(intervalMonths) : null,
      tasks: tasks.map((x) => x.trim()).filter(Boolean),
      notes: notes.trim() || null,
    };
    const { data, error } = job
      ? await supabase.from("machine_services").update(values).eq("id", job.id).select("*, service_names(*)").single()
      : await supabase
          .from("machine_services")
          .insert({ ...values, farm_id: farm!.id, equipment_id: machine.id })
          .select("*, service_names(*)")
          .single();
    if (error) {
      setBusy(false);
      setMessage(error.code === "23505" ? t("already_on_machine", { name: jobName(name, lang) }) : error.message);
      return;
    }
    const saved = data as Job;

    // Replace the parts list with what's on the form
    if (job) await supabase.from("kit_parts").delete().eq("machine_service_id", saved.id);
    let newKit: Kit[] = [];
    if (kitLines.length) {
      const { data: kd, error: kerr } = await supabase
        .from("kit_parts")
        .insert(
          kitLines.map((l) => ({
            farm_id: farm!.id,
            machine_service_id: saved.id,
            part_id: l.part.id,
            quantity: Number(l.quantity),
          }))
        )
        .select("*, parts_catalog(*)");
      if (kerr) {
        setBusy(false);
        setMessage(kerr.message);
        return;
      }
      newKit = (kd as Kit[]) || [];
    }
    setBusy(false);
    onSaved(saved, newKit);
  }

  return (
    <Modal title={job ? t("edit_template") : t("add_template")} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div>
          <span className={labelCls}>{t("job_name")}</span>
          <NamePicker names={names} usedNameIds={taken} value={name} onChange={setName} onNameCreated={onNameCreated} />
        </div>

        <div className="grid grid-cols-2 gap-3">
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

        {/* Parts and fluids */}
        <div>
          <span className={labelCls}>
            {t("parts_and_fluids")} ({lines.length})
          </span>
          {lines.length === 0 ? (
            <p className="mb-2 rounded-md bg-field px-3 py-2 text-sm text-faded">{t("no_template_parts")}</p>
          ) : (
            <ul className="mb-2 divide-y divide-seam rounded-md border border-seam">
              {lines.map((l, i) => (
                <li key={l.part.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-sm font-semibold">{l.part.part_number}</span>
                    <span className="block truncate text-xs text-faded sm:ml-2 sm:inline">
                      {l.part.description}
                      {l.part.manufacturer ? ` — ${l.part.manufacturer}` : ""}
                    </span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    aria-label={`${l.part.part_number} ${t("qty")}`}
                    value={l.quantity}
                    onChange={(e) =>
                      setLines((ls) => ls.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x)))
                    }
                    className="w-20 rounded border border-seam bg-field px-2 py-1.5 text-right font-mono"
                  />
                  <span className="w-9 text-xs text-faded">{l.part.unit !== "each" ? l.part.unit : ""}</span>
                  <button
                    type="button"
                    onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                    aria-label={t("remove")}
                    className="rounded p-1 text-faded hover:text-danger"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <PartPicker catalog={catalog} onPick={addPart} allowNew={false} />
        </div>

        {/* Tasks */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className={labelCls}>
              {t("tasks")} ({tasks.filter((x) => x.trim()).length})
            </span>
            <button
              type="button"
              onClick={() => setTasks((ts) => [...ts, ""])}
              className="text-sm font-semibold text-safety"
            >
              + {t("add_task")}
            </button>
          </div>
          {tasks.length === 0 ? (
            <p className="rounded-md bg-field px-3 py-2 text-sm text-faded">{t("no_tasks")}</p>
          ) : (
            <ul className="space-y-2">
              {tasks.map((task, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input
                    className={inputCls}
                    value={task}
                    onChange={(e) => setTasks((ts) => ts.map((x, idx) => (idx === i ? e.target.value : x)))}
                    placeholder={t("task_placeholder")}
                    autoFocus={!task && i === tasks.length - 1}
                  />
                  <button
                    type="button"
                    onClick={() => setTasks((ts) => ts.filter((_, idx) => idx !== i))}
                    aria-label={t("remove")}
                    className="rounded p-1 text-faded hover:text-danger"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Field label={`${t("notes")} (${t("optional")})`}>
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <ErrorText>{message}</ErrorText>
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className={`${btnPrimary} flex-1`}>
            {busy ? t("saving") : t("save")}
          </button>
          <button type="button" onClick={onClose} className={btnOutline}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ======================================================================
// Copy templates (with parts, fluids, and tasks) from another machine
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
      .eq("category", "service")
      .eq("is_retired", false);
    const js = ((data as Job[]) || []).filter((j) => j.category === "service");
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
          category: "service",
          interval_meter: sameMeter && target.meter_type !== "none" ? j.interval_meter : null,
          interval_months: j.interval_months,
          tasks: j.tasks || [],
          notes: j.notes,
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
                        {t("n_items", { n: parts })} · {t("tasks")}: {(j.tasks || []).length}
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
