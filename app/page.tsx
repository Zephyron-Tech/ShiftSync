"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, DayDetail } from "@/components/Calendar";
import { shiftInfo, toneOf, type Tone } from "@/lib/codes";
import { ExportPanel } from "@/components/ExportPanel";
import { Editor } from "@/components/Editor";
import { Sheet } from "@/components/Sheet";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { decodeSchedule } from "@/lib/share";
import { parsePdf } from "@/lib/parsePdfClient";
import type { Schedule } from "@/lib/parsePdf";

// Preselected name before anything is remembered; set it in the environment, not in the (public) source.
const DEFAULT_PERSON = process.env.NEXT_PUBLIC_DEFAULT_PERSON ?? "";
const STORE_KEY = "shiftsync.person";
const MONTH_NAMES = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];

const hoursFmt = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 });

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="10" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M11 1a10 10 0 0 0 0 20z" fill="var(--day)" />
      <path d="M11 1a10 10 0 0 1 0 20z" fill="var(--night)" />
    </svg>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const UPLOAD = "M12 16V4m0 0L7 9m5-5 5 5M4 20h16";

function SampleStrip({ tone, from, to, caption, code, kind }: { tone: Tone; from: number; to: number; caption: string; code: string; kind: string }) {
  return (
    <li className="flex flex-col items-start gap-1 min-[380px]:flex-row min-[380px]:items-center min-[380px]:gap-2 sm:gap-3">
      <span className="relative block h-9 w-8 shrink-0 rounded-[3px] min-[380px]:h-12 sm:h-14 sm:w-9" style={{ background: "linear-gradient(to bottom, var(--track-dark) 28%, var(--track-lit) 28% 66%, var(--track-dark) 66%)" }}>
        <span className={`tone-${tone} absolute inset-x-[5px] rounded-[3px]`} style={{ top: `${(from / 24) * 100}%`, height: `${((to - from) / 24) * 100}%` }} />
      </span>
      <span className="whitespace-nowrap">
        <span className="block"><b>{code}</b> {kind}</span>
        <span className="text-xs text-ink2 min-[380px]:text-sm">{caption}</span>
      </span>
    </li>
  );
}

function SubscribeView({ token, name }: { token: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const host = typeof location === "undefined" ? "" : location.host;
  const feed = `${host}/api/cal/${token}`;
  const link = "row press flex min-h-14 w-full flex-col items-start justify-center rounded-xl border border-line bg-surface px-4 py-2 text-left";
  return (
    <main className="mx-auto mt-6 max-w-xl space-y-3">
      <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight sm:text-3xl">Přidej si kalendář směn</h1>
      <p className="text-pretty text-ink2">
        Stačí jednou{name ? `, ${name}` : ""}. Další rozpisy už jen přepošli botovi a kalendář se doplní sám, obvykle do několika hodin.
      </p>
      <a className={link} href={`webcal://${feed}`}>
        <b>iPhone a Mac kalendář</b>
        <span className="text-pretty text-sm text-ink2">Potvrď „Odebírat“, vznikne samostatný kalendář.</span>
      </a>
      <a className={link} href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(`webcal://${feed}`)}`} target="_blank" rel="noreferrer">
        <b>Google Kalendář</b>
        <span className="text-pretty text-sm text-ink2">Otevři na počítači, nebo v prohlížeči v telefonu. Kalendář se pak objeví i v aplikaci Google Kalendář.</span>
      </a>
      <a className={link} href={`#e=${token}`}>
        <b>Upravit směny</b>
        <span className="text-pretty text-sm text-ink2">Když se změní směna a nepřijde nové PDF. Jde i textem botovi: „pomoc“.</span>
      </a>
      <button
        className={link}
        onClick={() => {
          navigator.clipboard?.writeText(`https://${feed}`).then(() => setCopied(true)).catch(() => {});
        }}
      >
        <b>{copied ? "Zkopírováno" : "Zkopírovat adresu"}</b>
        <span className="text-pretty text-sm text-ink2">Google Kalendář na webu: Další kalendáře → Z adresy URL. Platí i pro ostatní aplikace.</span>
      </button>
    </main>
  );
}

export default function Home() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [person, setPerson] = useState(DEFAULT_PERSON);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [subscribe, setSubscribe] = useState<{ token: string; name: string } | null>(null);
  const [editToken, setEditToken] = useState<string | null>(null);
  const isDesktop = useIsDesktop();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Links from the WhatsApp bot carry their data after "#": #d=<schedule>, #s=<token> (subscribe), #e=<token> (edit)
    const TOKEN = /^[A-Za-z0-9_-]{32}$/;
    const read = () => {
      try {
        const h = new URLSearchParams(location.hash.slice(1));
        const edit = h.get("e");
        const sub = h.get("s");
        if (edit && TOKEN.test(edit)) {
          setEditToken(edit);
          setSubscribe(null);
          return;
        }
        setEditToken(null);
        if (sub && TOKEN.test(sub)) {
          setSubscribe({ token: sub, name: h.get("p") ?? "" });
          return;
        }
        setSubscribe(null);
        const d = h.get("d");
        if (d) {
          const sched = decodeSchedule(d);
          const wanted = h.get("p");
          setSchedule(sched);
          setPerson(wanted && sched.people.some((p) => p.name === wanted) ? wanted : sched.people[0]?.name ?? DEFAULT_PERSON);
          return;
        }
      } catch {
        setError("Odkaz s rozpisem je poškozený. Nahraj PDF ručně.");
      }
      try {
        const saved = localStorage.getItem(STORE_KEY);
        if (saved) setPerson(saved);
      } catch {}
    };
    read(); // the hash is only readable after mount
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  function choosePerson(name: string) {
    setPerson(name);
    setSelected(null);
    try {
      localStorage.setItem(STORE_KEY, name);
    } catch {}
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const s = await parsePdf(await file.arrayBuffer());
      if (!s.people.length) throw new Error("Nenašel jsem v tabulce žádná jména.");
      setSchedule(s);
      setSelected(null);
      if (!s.people.some((p) => p.name === person)) setPerson(s.people[0].name);
    } catch (e) {
      setSchedule(null);
      const why = e instanceof Error ? e.message : "";
      setError(`Tohle PDF jsem nepřečetl. Nahraj rozpis „Plán pracovní doby“ exportovaný z Excelu, ne sken ani fotku. ${why}`.trim());
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const current = useMemo(() => schedule?.people.find((p) => p.name === person), [schedule, person]);
  const stats = useMemo(() => {
    const t: Record<Tone, number> = { day: 0, morning: 0, night: 0, holiday: 0, unknown: 0, allday: 0 };
    let hours = 0;
    const unknown = new Set<string>();
    for (const s of current?.shifts ?? []) {
      const info = shiftInfo(s.code, s.hours);
      const tone = toneOf(info);
      t[tone]++;
      if (info.kind === "timed") hours += info.hours;
      if (tone === "unknown") unknown.add(s.code);
    }
    return { t, hours, unknown: [...unknown] };
  }, [current]);

  const firstDay = current?.shifts[0]?.day ?? null;
  const day = selected ?? firstDay;

  const picker = (
    <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-3 pb-[84px] pt-[max(0.5rem,env(safe-area-inset-top))] lg:px-4 lg:pb-6 lg:pt-4">
      <header className="flex h-10 items-center justify-between lg:h-11">
        <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Mark />
          ShiftSync
        </span>
        {schedule && (
          <label className="inline-flex h-10 cursor-pointer items-center px-2 text-sm font-bold text-accent underline underline-offset-4">
            Jiný rozpis
            {picker}
          </label>
        )}
      </header>

      {editToken && <Editor token={editToken} />}

      {subscribe && !editToken && !schedule && <SubscribeView token={subscribe.token} name={subscribe.name} />}

      {!schedule && !subscribe && !editToken && (
        <main
          className="mx-auto mt-4 max-w-xl lg:mt-14"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFile(e.dataTransfer.files[0]);
          }}
        >
          <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight sm:text-4xl">Rozpis služeb do kalendáře</h1>
          <p className="mt-2 max-w-[52ch] text-pretty text-base text-ink2 sm:mt-3 sm:text-lg">
            Nahraj měsíční PDF s plánem pracovní doby, vyber se a stáhni soubor do kalendáře. PDF se čte přímo v tomhle zařízení, nikam se neposílá.
          </p>

          <label
            className={`mt-5 flex h-14 cursor-pointer sm:mt-7 sm:h-16 items-center justify-center gap-2 rounded-xl text-lg font-bold transition-colors ${
              dragging ? "bg-[var(--night)] text-white" : "bg-accent text-[var(--on-accent)]"
            } ${busy ? "pointer-events-none opacity-70" : ""}`}
          >
            <Icon d={UPLOAD} />
            {busy ? "Čtu rozpis…" : dragging ? "Pusť PDF sem" : "Vybrat PDF"}
            {picker}
          </label>
          <p className="mt-2 hidden text-sm text-ink2 lg:block">Nebo ho přetáhni kamkoli do tohoto okna.</p>

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-[var(--danger)] bg-surface p-3 text-[var(--danger)]">
              {error}
            </p>
          )}

          <section className="mt-6 sm:mt-12" aria-labelledby="how">
            <h2 id="how" className="text-base font-bold">
              Takhle uvidíš své směny
            </h2>
            <p className="mt-1 text-pretty text-ink2">Každý den má 24h proužek. Světlé pozadí je denní světlo v Plzni, barevný pruh je tvoje směna.</p>
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-4">
              <SampleStrip tone="day" from={7} to={19.5} code="D7" kind="denní" caption="7:00–19:30" />
              <SampleStrip tone="morning" from={7} to={15} code="R" kind="ranní" caption="7:00–15:00" />
              <SampleStrip tone="night" from={18} to={24} code="N18" kind="noční" caption="přes půlnoc" />
            </ul>
          </section>
        </main>
      )}

      {schedule && current && (
        <main className={`${stats.unknown.length > 0 ? "has-notice " : ""}mt-1 grid gap-2 lg:mt-4 lg:grid-cols-[22rem_1fr] lg:items-start lg:gap-x-10 lg:gap-y-4`}>
          <div className="space-y-2 lg:col-start-1 lg:row-start-1 lg:space-y-4">
            <div>
              <label htmlFor="who" className="sr-only">
                Kdo jsi
              </label>
              <select
                id="who"
                value={person}
                onChange={(e) => choosePerson(e.target.value)}
                className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink"
              >
                {schedule.people.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
                  {MONTH_NAMES[schedule.month - 1]} {schedule.year}
                </h1>
                {current.shifts.length > 0 && <span className="text-sm font-bold">{hoursFmt.format(stats.hours)} h</span>}
              </div>
              {current.shifts.length === 0 ? (
                <p className="mt-1 text-pretty text-sm text-ink2">V rozpisu nemá žádné směny.</p>
              ) : (
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs lg:text-sm">
                  {([["day", "denní"], ["morning", "ranní"], ["night", "noční"], ["holiday", "svátek"], ["unknown", "jiné"], ["allday", "celodenní"]] as const).map(
                    ([tone, name]) =>
                      stats.t[tone] > 0 && (
                        <li key={tone} className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className={`tone-${tone === "allday" ? "unknown" : tone} inline-block h-2.5 w-2.5 rounded-sm`} />
                          {stats.t[tone]}× {name}
                        </li>
                      ),
                  )}
                  <li className="flex items-center gap-1.5" title="Denní světlo v Plzni, od východu do západu slunce">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm border border-line bg-[var(--track-lit)]" />
                    světlo
                  </li>
                </ul>
              )}
            </div>
          </div>

          <div className="lg:col-start-2 lg:row-span-4 lg:row-start-1">
            <Calendar key={person} person={current} year={schedule.year} month={schedule.month} selected={day} onSelect={setSelected} />
          </div>

          <div hidden={current.shifts.length === 0} className="min-h-[84px] rounded-xl border border-line bg-surface px-3 py-2 lg:col-start-1 lg:row-start-2 lg:min-h-0 lg:p-4">
            <DayDetail person={current} year={schedule.year} month={schedule.month} day={day} />
          </div>

          {isDesktop && (
            <div className="lg:col-start-1 lg:row-start-3">
              <ExportPanel key={person} schedule={schedule} person={current} />
            </div>
          )}

          {stats.unknown.length > 0 && (
            <p className="text-pretty rounded-xl border border-dashed border-[var(--unknown)] px-3 py-2 text-xs lg:col-start-1 lg:row-start-4 lg:p-3 lg:text-sm" role="status">
              <b>{stats.unknown.join(", ")}</b> nemám v legendě, počítám od 7:00 podle hodin z PDF.
            </p>
          )}
        </main>
      )}

      {schedule && current && !isDesktop && (
        <>
          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <button
              onClick={() => setSheet(true)}
              disabled={current.shifts.length === 0}
              className="primary press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-bold text-[var(--on-accent)] disabled:opacity-40"
            >
              Přidat do kalendáře
              {current.shifts.length > 0 && <span className="font-normal opacity-80">({current.shifts.length})</span>}
            </button>
          </div>
          <Sheet open={sheet} onClose={() => setSheet(false)} title="Přidat do kalendáře">
            <ExportPanel key={person} schedule={schedule} person={current} heading={false} />
          </Sheet>
        </>
      )}
    </div>
  );
}
