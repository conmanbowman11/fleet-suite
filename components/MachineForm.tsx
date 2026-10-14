"use client";

// ADD / EDIT MACHINE form.
// Used on the Equipment list (add) and on each machine's page (edit).

import { useState } from "react";
import { supabase, Equipment, MeterType } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { ErrorText, Field, btnOutline, btnSecondary, cardCls, inputCls, labelCls } from "@/components/ui";

const METERS: { value: MeterType; key: "meter_hours" | "meter_miles" | "meter_none" }[] = [
  { value: "hours", key: "meter_hours" },
  { value: "miles", key: "meter_miles" },
  { value: "none", key: "meter_none" },
];

export default function MachineForm({
  machine,
  onSaved,
  onCancel,
}: {
  machine?: Equipment;
  onSaved: (m: Equipment) => void;
  onCancel: () => void;
}) {
  const { farm, t } = useSession();
  const [nickname, setNickname] = useState(machine?.nickname ?? "");
  const [unit, setUnit] = useState(machine?.unit_number ?? "");
  const [make, setMake] = useState(machine?.make ?? "");
  const [model, setModel] = useState(machine?.model ?? "");
  const [serial, setSerial] = useState(machine?.serial_number ?? "");
  const [meterType, setMeterType] = useState<MeterType>(machine?.meter_type ?? "hours");
  const [reading, setReading] = useState(
    machine?.current_reading !== null && machine?.current_reading !== undefined
      ? String(machine.current_reading)
      : ""
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!nickname.trim()) {
      setMessage(t("nickname_required"));
      return;
    }
    setBusy(true);
    const values = {
      nickname: nickname.trim(),
      unit_number: unit.trim() || null,
      make: make.trim() || null,
      model: model.trim() || null,
      serial_number: serial.trim() || null,
      meter_type: meterType,
      current_reading: meterType === "none" || reading === "" ? null : Number(reading),
    };
    const query = machine
      ? supabase.from("equipment").update(values).eq("id", machine.id).select().single()
      : supabase.from("equipment").insert({ ...values, farm_id: farm!.id }).select().single();
    const { data, error } = await query;
    setBusy(false);
    if (error) {
      setMessage(error.code === "23505" ? t("unit_taken") : error.message);
      return;
    }
    onSaved(data as Equipment);
  }

  return (
    <form onSubmit={save} className={`${cardCls} mb-4 space-y-3`}>
      <h2 className="font-semibold">{machine ? t("edit_machine") : t("add_machine")}</h2>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <Field label={t("nickname")}>
            <input
              className={inputCls}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t("nickname_placeholder")}
            />
          </Field>
        </div>
        <Field label={t("unit_number")}>
          <input className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="07" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label={t("make")}>
          <input className={inputCls} value={make} onChange={(e) => setMake(e.target.value)} placeholder="CAT" />
        </Field>
        <Field label={t("model")}>
          <input
            className={inputCls}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Challenger 765C"
          />
        </Field>
      </div>

      <Field label={t("serial_number")}>
        <input className={inputCls} value={serial} onChange={(e) => setSerial(e.target.value)} />
      </Field>

      <fieldset>
        <legend className={labelCls}>{t("meter_type")}</legend>
        <div className="flex gap-2">
          {METERS.map((m) => (
            <button
              type="button"
              key={m.value}
              onClick={() => setMeterType(m.value)}
              aria-pressed={meterType === m.value}
              className={
                "flex-1 rounded border p-3 text-sm font-bold " +
                (meterType === m.value ? "border-steel bg-steel text-white" : "border-seam bg-plate")
              }
            >
              {t(m.key)}
            </button>
          ))}
        </div>
      </fieldset>

      {meterType !== "none" && (
        <Field label={t("current_reading")}>
          <input
            type="number"
            inputMode="decimal"
            className={inputCls}
            value={reading}
            onChange={(e) => setReading(e.target.value)}
          />
        </Field>
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
