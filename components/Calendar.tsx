"use client";

import { shiftInfo, toneOf, type Tone } from "@/lib/codes";
import type { Person } from "@/lib/parsePdf";
import { daylight, fmtClock } from "@/lib/sun";

type Seg = { from: number; to: number; tone: Tone; code: string; cont: boolean; start?: string; end?: string; with?: string[] };

const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const LONG_DAYS = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];
const MONTH_GEN = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
const TONE_NAME: Record<Tone, string> = { day: "denní směna", morning: "ranní směna", night: "noční směna", holiday: "svátek", unknown: "směna", allday: "celý den" };

const toH = (t: string) => +t.slice(0, 2) + +t.slice(3) / 60;

export function buildDays(person: Person, year: number, month: number) {
  const count = new Date(year, month, 0).getDate();
  const byDay = new Map<number, Seg[]>();
  const add = (d: number, s: Seg) => {
    if (d > count) return;
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  };
  for (const s of person.shifts) {
    const info = shiftInfo(s.code, s.hours);
    const tone = toneOf(info);
    if (info.kind === "allday") {
      add(s.day, { from: 0, to: 0, tone, code: s.code, cont: false });
      continue;
    }
    const a = toH(info.start);
    const b = toH(info.end);
    if (info.overnight) {
      add(s.day, { from: a, to: 24, tone, code: s.code, cont: false, start: info.start, end: info.end, with: s.with });
      add(s.day + 1, { from: 0, to: b, tone, code: s.code, cont: true, start: info.start, end: info.end, with: s.with });
    } else {
      add(s.day, { from: a, to: b, tone, code: s.code, cont: false, start: info.start, end: info.end, with: s.with });
    }
  }
  return { count, byDay };
}

export function Calendar({
  person,
  year,
  month,
  selected,
  onSelect,
}: {
  person: Person;
  year: number;
  month: number;
  selected: number | null;
  onSelect: (d: number) => void;
}) {
  const { count, byDay } = buildDays(person, year, month);
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const now = new Date();
  const today = now.getFullYear() === year && now.getMonth() + 1 === month ? now.getDate() : -1;
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  let order = 0;

  return (
    <div className="cal" style={{ ["--rows" as string]: Math.ceil(cells.length / 7) }}>
      <div className="grid grid-cols-7 gap-[2px] pb-1 text-center text-[11px] font-bold text-ink2 lg:gap-1.5 lg:text-sm">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <ul className="grid grid-cols-7 gap-[2px] lg:gap-1.5">
        {cells.map((d, idx) => {
          if (d === null) return <li key={`e${idx}`} aria-hidden />;
          const segs = byDay.get(d) ?? [];
          const main = segs.find((s) => !s.cont) ?? segs[0];
          const sun = daylight(year, month, d);
          const rise = (sun.rise / 24) * 100;
          const set = (sun.set / 24) * 100;
          const weekend = (offset + d - 1) % 7 >= 5;
          const isSel = selected === d;
          const date = new Date(year, month - 1, d);
          const label = `${LONG_DAYS[date.getDay()]} ${d}. ${MONTH_GEN[month - 1]}: ${
            main ? `${TONE_NAME[main.tone]} ${main.code}${main.start ? `, ${main.start} až ${main.end}` : ""}` : "volno"
          }`;
          return (
            <li key={d}>
              <button
                type="button"
                onClick={() => onSelect(d)}
                aria-pressed={isSel}
                aria-label={label}
                className={`cell press flex w-full flex-col items-stretch overflow-hidden rounded-md border text-left ${
                  isSel ? "border-accent ring-2 ring-accent" : "border-line"
                } ${weekend ? "bg-[var(--weekend)]" : "bg-surface"}`}
              >
                <span className="flex h-[18px] items-center justify-between px-1 text-[10px] leading-none lg:h-7 lg:px-2 lg:text-sm">
                  <span className={`font-bold ${d === today ? "rounded-full bg-accent px-1.5 py-0.5 text-[var(--on-accent)]" : ""}`}>{d}</span>
                  {main && <span className={main.cont ? "font-normal text-ink2" : "font-bold"}>{main.code}</span>}
                </span>
                <span
                  className="cal-track relative mx-[2px] mb-[2px] block rounded-[3px] lg:mx-1.5 lg:mb-1.5"
                  style={{
                    background: `linear-gradient(to bottom, var(--track-dark) ${rise}%, var(--track-lit) ${rise}% ${set}%, var(--track-dark) ${set}% 100%)`,
                  }}
                >
                  {segs.map((s, i) =>
                    s.tone === "allday" ? (
                      <span
                        key={i}
                        className="absolute inset-0 flex items-center justify-center rounded-[3px] bg-[color-mix(in_srgb,var(--unknown)_45%,var(--surface))] text-[11px] font-bold lg:text-sm"
                      >
                        {s.code}
                      </span>
                    ) : (
                      <span
                        key={i}
                        style={{ top: `${(s.from / 24) * 100}%`, height: `${((s.to - s.from) / 24) * 100}%`, ["--i" as string]: order++ }}
                        className={`bar tone-${s.tone} absolute inset-x-[6px] lg:inset-x-[14%] ${
                          s.cont ? "rounded-b-[3px]" : s.to === 24 ? "rounded-t-[3px]" : "rounded-[3px]"
                        }`}
                      />
                    ),
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DayDetail({ person, year, month, day }: { person: Person; year: number; month: number; day: number | null }) {
  if (day === null) return <p className="text-ink2">Tento měsíc tu nemá žádné směny.</p>;
  const { byDay } = buildDays(person, year, month);
  const segs = byDay.get(day) ?? [];
  const main = segs.find((s) => !s.cont) ?? segs[0];
  const date = new Date(year, month - 1, day);
  const sun = daylight(year, month, day);
  const head = `${LONG_DAYS[date.getDay()]} ${day}. ${MONTH_GEN[month - 1]}`;

  let dark = "";
  if (main && main.start && main.end) {
    const a = toH(main.start);
    const b = toH(main.end);
    const overnight = b < a;
    const startDark = a < sun.rise || a >= sun.set;
    const endDark = overnight ? b < sun.rise : b <= sun.rise || b > sun.set;
    dark = startDark && endDark ? "Začátek i konec za tmy" : startDark ? "Začátek za tmy" : endDark ? "Konec za tmy" : "Začátek i konec za světla";
  }

  const overnight = !!main && (main.to === 24 || main.cont);

  return (
    <div key={`${person.name}-${day}`} aria-live="polite" className="detail-in space-y-0.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <h2 className="text-base font-bold first-letter:uppercase lg:text-lg">{head}</h2>
        {main ? (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-sm lg:text-base">
            <span className={`tone-${main.tone} rounded px-1.5 py-0.5 text-xs font-bold`}>{main.code}</span>
            {main.start ? `${main.start}–${main.end}` : "celý den"}
          </span>
        ) : (
          <span className="text-sm lg:text-base">volno</span>
        )}
      </div>
      <p className="text-pretty text-sm text-ink2">
        {[overnight && "Přes půlnoc.", dark && `${dark}.`, `Slunce ${fmtClock(sun.rise)}–${fmtClock(sun.set)}.`]
          .filter(Boolean)
          .map((t, i) => (
            // spaces stay outside the nowrap spans, so the line can break between sentences only
            <span key={i}>
              {i > 0 && " "}
              <span className="whitespace-nowrap">{t}</span>
            </span>
          ))}
      </p>
      {main?.with?.length ? (
        <p className="text-pretty text-sm">
          <span className="text-ink2">S kým: </span>
          {main.with.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
