"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar } from "@/components/Calendar";
import { Sheet } from "@/components/Sheet";
import { editCodeLabel, EDIT_CODES } from "@/lib/codes";
import { resolveMonth, type Edit } from "@/lib/edit";
import type { Shift } from "@/lib/parsePdf";
import { useIsDesktop } from "@/lib/useIsDesktop";

type Data = { name: string; months: Record<string, Shift[]>; canUndo: boolean };

const MONTH_NAMES = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];
const MONTH_GEN = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
const ctl = "row press h-11 rounded-xl border border-line bg-surface px-3 text-sm font-bold disabled:opacity-40";

function CodePicker({ day, current, busy, onPick }: { day: number; current?: string; busy: boolean; onPick: (code: string | null) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {EDIT_CODES.map((c) => (
        <button
          key={c}
          disabled={busy}
          aria-pressed={current === c}
          onClick={() => onPick(c)}
          className={`row press flex min-h-12 flex-col items-start justify-center rounded-xl border px-3 py-1 text-left disabled:opacity-40 ${
            current === c ? "border-accent ring-2 ring-accent" : "border-line"
          } bg-surface`}
        >
          <b className="text-sm">{c}</b>
          <span className="whitespace-nowrap text-xs text-ink2">{editCodeLabel(c)}</span>
        </button>
      ))}
      <button disabled={busy || !current} onClick={() => onPick(null)} className="row press flex min-h-12 flex-col items-start justify-center rounded-xl border border-line bg-surface px-3 py-1 text-left disabled:opacity-40">
        <b className="text-sm">Volno</b>
        <span className="whitespace-nowrap text-xs text-ink2">{day}. bez směny</span>
      </button>
    </div>
  );
}

/** Hand edits for one person; the secret link token is the credential. Changes flow into the subscribed calendar. */
export function Editor({ token }: { token: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ym, setYm] = useState<string | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const isDesktop = useIsDesktop();

  const apply = useCallback((d: Data) => {
    setData(d);
    setYm((cur) => cur && d.months[cur] ? cur : resolveMonth(Object.keys(d.months), new Date().getMonth() + 1, new Date()) ?? Object.keys(d.months).sort().at(-1) ?? null);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/me/${token}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!alive) return;
        if (ok) apply(body as Data);
        else setError((body as { error?: string }).error ?? "Nepodařilo se načíst.");
      })
      .catch(() => alive && setError("Nepodařilo se načíst. Zkontroluj připojení."));
    return () => {
      alive = false;
    };
  }, [token, apply]);

  const keys = useMemo(() => Object.keys(data?.months ?? {}).sort(), [data]);
  const shifts = ym && data ? data.months[ym] ?? [] : [];
  const current = shifts.find((s) => s.day === day);

  async function send(payload: { ym: string; edit: Edit } | { undo: true }) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/me/${token}/edit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await r.json();
      if (!r.ok) throw new Error((body as { error?: string }).error ?? "Uložení se nepovedlo.");
      apply(body as Data);
      setSaved(true);
      setOpen(false);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uložení se nepovedlo.");
    } finally {
      setBusy(false);
    }
  }

  function pick(code: string | null) {
    if (!ym || day === null) return;
    void send({ ym, edit: code === null ? { op: "clear", day } : { op: "set", day, code } });
  }

  if (error && !data) {
    return (
      <p role="alert" className="mx-auto mt-6 max-w-xl rounded-xl border border-[var(--danger)] bg-surface p-3 text-[var(--danger)]">
        {error}
      </p>
    );
  }
  if (!data || !ym) return <p className="mt-6 text-center text-ink2">Načítám…</p>;

  const [year, month] = ym.split("-").map(Number);
  const idx = keys.indexOf(ym);
  const picker = day !== null && <CodePicker day={day} current={current?.code} busy={busy} onPick={pick} />;

  return (
    <main className="editor mt-1 grid gap-2 lg:mt-4 lg:grid-cols-[22rem_1fr] lg:items-start lg:gap-x-10">
      <div className="space-y-2 lg:space-y-4">
        <div className="flex items-center gap-2">
          <button aria-label="Předchozí měsíc" disabled={idx <= 0} onClick={() => { setYm(keys[idx - 1]); setDay(null); }} className={`${ctl} w-11 px-0`}>‹</button>
          <h1 className="min-w-0 flex-1 truncate text-center text-xl font-bold tracking-tight lg:text-left lg:text-2xl">
            {MONTH_NAMES[month - 1]} {year}
          </h1>
          <button aria-label="Další měsíc" disabled={idx >= keys.length - 1} onClick={() => { setYm(keys[idx + 1]); setDay(null); }} className={`${ctl} w-11 px-0`}>›</button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm text-ink2">{data.name}</p>
          <button disabled={busy || !data.canUndo} onClick={() => void send({ undo: true })} className={ctl}>
            Zpět
          </button>
        </div>
        <p role="status" className="min-h-5 text-sm text-ink2">
          {error ? <span className="text-[var(--danger)]">{error}</span> : saved ? "Uloženo. Kalendář se obnoví do 24 hodin." : day === null ? "Klepni na den a vyber směnu." : ""}
        </p>
        {isDesktop && day !== null && (
          <section aria-label="Směna pro vybraný den" className="space-y-2">
            <h2 className="text-lg font-bold">{day}. {MONTH_GEN[month - 1]}</h2>
            {picker}
          </section>
        )}
      </div>

      <Calendar key={ym} person={{ name: data.name, shifts }} year={year} month={month} selected={day} onSelect={(d) => { setDay(d); setOpen(true); }} />

      {!isDesktop && (
        <Sheet open={open && day !== null} onClose={() => setOpen(false)} title={day === null ? "" : `${day}. ${MONTH_GEN[month - 1]}`}>
          {picker}
        </Sheet>
      )}
    </main>
  );
}
