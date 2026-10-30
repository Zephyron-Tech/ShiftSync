"use client";

import { useState } from "react";
import { buildIcs } from "@/lib/ics";
import { GOOGLE_CLIENT_ID, googleSignIn, importShifts, listWritableCalendars, type GCalendar } from "@/lib/googleCalendar";
import type { Person, Schedule } from "@/lib/parsePdf";

const ROW = "row press flex min-h-14 lg:min-h-12 lg:py-1.5 w-full flex-col items-start justify-center rounded-xl border border-line bg-surface px-4 py-2 text-left disabled:opacity-40";
const DESC = "text-pretty text-sm text-ink2";

function fileName(s: Schedule) {
  return `sluzby-${s.year}-${String(s.month).padStart(2, "0")}.ics`;
}

export function ExportPanel({ schedule, person, heading = true, feedToken = null }: { schedule: Schedule; person: Person; heading?: boolean; feedToken?: string | null }) {
  const [status, setStatus] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<GCalendar[] | null>(null);
  const [target, setTarget] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const empty = person.shifts.length === 0;

  // Live subscription: only with the token of the bot's stored feed, never a snapshot of this page.
  const feedUrl = (scheme: string) => `${scheme}//${location.host}/api/cal/${feedToken}`;

  function download() {
    const url = URL.createObjectURL(new Blob([buildIcs(person, schedule.year, schedule.month)], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName(schedule);
    a.click();
    URL.revokeObjectURL(url);
  }

  async function share() {
    const file = new File([buildIcs(person, schedule.year, schedule.month)], fileName(schedule), { type: "text/calendar" });
    try {
      await navigator.share({ files: [file], title: "Směny" });
    } catch {
      /* user closed the share sheet */
    }
  }
  const canShare = typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "a.ics", { type: "text/calendar" })] });

  async function googleStart() {
    setBusy(true);
    setStatus(null);
    try {
      const t = await googleSignIn();
      const list = await listWritableCalendars(t);
      setToken(t);
      setCalendars(list);
      setTarget((list.find((c) => c.primary) ?? list[0])?.id ?? "");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Nepodařilo se přihlásit.");
    } finally {
      setBusy(false);
    }
  }

  async function googleAdd() {
    if (!token || !target) return;
    setBusy(true);
    try {
      await importShifts(token, target, person, schedule.year, schedule.month, (d, n) => setStatus(`Přidávám ${d} z ${n}…`));
      const name = calendars?.find((c) => c.id === target)?.name ?? "kalendáře";
      setStatus(`Hotovo: ${person.shifts.length} směn je v kalendáři ${name}. Když to spustíš znovu, směny se přepíšou, ne zdvojí.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Přidání se nezdařilo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="export" aria-labelledby={heading ? "export-h" : undefined} className="space-y-2">
      {heading && (
        <h2 id="export-h" className="text-lg font-bold">
          Přidat do kalendáře
        </h2>
      )}

      {GOOGLE_CLIENT_ID ? (
        calendars ? (
          <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
            <label htmlFor="gcal" className="text-sm font-bold">
              Do kterého kalendáře
            </label>
            <select id="gcal" value={target} onChange={(e) => setTarget(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink">
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button onClick={googleAdd} disabled={busy || empty} className="primary press h-12 w-full rounded-xl bg-accent font-bold text-[var(--on-accent)] disabled:opacity-40">
              Přidat {person.shifts.length} směn
            </button>
          </div>
        ) : (
          <button onClick={googleStart} disabled={busy || empty} className={ROW}>
            <b>Google Kalendář</b>
            <span className={DESC}>Vybereš, do kterého kalendáře půjdou.</span>
          </button>
        )
      ) : null}

      {feedToken && (
        <>
          <a className={ROW} href={feedUrl("webcal:")}>
            <b>iPhone a Mac kalendář</b>
            <span className={DESC}>Odběr, který se sám aktualizuje. Stačí přidat jednou.</span>
          </a>
          <a className={ROW} href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feedUrl("webcal:"))}`} target="_blank" rel="noreferrer">
            <b>Google Kalendář podle adresy</b>
            <span className={DESC}>Odběr, který se sám aktualizuje.</span>
          </a>
        </>
      )}

      <button onClick={download} disabled={empty} className={ROW}>
        <b>Soubor .ics</b>
        <span className={DESC}>Pro ostatní aplikace a ruční import.</span>
      </button>
      {canShare && (
        <button onClick={share} disabled={empty} className={ROW}>
          <b>Sdílet soubor</b>
          <span className={DESC}>Pošli ho z telefonu do aplikace podle výběru.</span>
        </button>
      )}

      {!feedToken && (
        <p className="text-pretty text-sm text-ink2">
          Kalendář, který se sám aktualizuje, dostaneš od WhatsApp bota. Napiš mu „odkaz“.
        </p>
      )}

      {status && (
        <p role="status" className="text-sm text-ink2">
          {status}
        </p>
      )}
    </section>
  );
}
