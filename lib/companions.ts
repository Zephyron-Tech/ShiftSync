import { shiftInfo } from "./codes";
import type { Person, Schedule, Shift } from "./parsePdf";

/** "Poštová Nikola" (PDF order) → "Nikola Poštová". The first word is the surname, the rest is the given name. */
export function displayName(pdfName: string): string {
  const [surname, ...given] = pdfName.trim().split(/\s+/);
  return given.length ? `${given.join(" ")} ${surname}` : surname;
}

const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3);

/** Working shift = a code with a known time (D5…D8, N18, N19, R, Ev); absences, ŠK, OZP… are not. */
function interval(code: string, hours?: number): [number, number] | null {
  const info = shiftInfo(code, hours);
  if (info.kind !== "timed" || !info.known) return null;
  const start = toMin(info.start);
  return [start, toMin(info.end) + (info.overnight ? 1440 : 0)];
}

/**
 * For every working shift lists the colleagues on the same day with the same code, an overlapping time
 * and the same cell colour. A colour that could not be read does not exclude anybody.
 * Returns a copy; the parse-time `color` is dropped.
 */
export function addCompanions(schedule: Schedule): Schedule {
  type Entry = { person: string; shift: Shift; span: [number, number] };
  const byDay = new Map<number, Entry[]>();
  for (const p of schedule.people) {
    for (const shift of p.shifts) {
      const span = interval(shift.code, shift.hours);
      if (span) byDay.set(shift.day, [...(byDay.get(shift.day) ?? []), { person: p.name, shift, span }]);
    }
  }

  const people: Person[] = schedule.people.map((p) => ({
    name: p.name,
    shifts: p.shifts.map((s) => {
      const { color, ...rest } = s;
      void color;
      const span = interval(s.code, s.hours);
      if (!span) return rest;
      const names = (byDay.get(s.day) ?? [])
        .filter(
          (e) =>
            e.person !== p.name &&
            e.shift.code === s.code &&
            e.span[0] < span[1] &&
            span[0] < e.span[1] &&
            (!s.color || !e.shift.color || s.color === e.shift.color),
        )
        .map((e) => displayName(e.person));
      const unique = [...new Set(names)].sort((a, b) => a.localeCompare(b, "cs"));
      return unique.length ? { ...rest, with: unique } : rest;
    }),
  }));
  return { ...schedule, people };
}
