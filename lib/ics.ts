import { shiftInfo } from "./codes";
import type { Person } from "./parsePdf";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
// TEXT value: any line break becomes "\n", other control characters are dropped, so no input can start a new property line.
export const esc = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .replace(/[\\;,]/g, (c) => "\\" + c)
    .replace(/\n/g, "\\n");

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Prague",
  "BEGIN:STANDARD",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
];

function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = " " + rest.slice(73);
  }
  out.push(rest);
  return out.join("\r\n");
}

const slug = (s: string) => s.normalize("NFD").replace(/[^\w]+/g, "").toLowerCase();

const fmtH = (h: number) => String(h).replace(".", ",");

export type CalEvent = {
  uid: string;
  summary: string;
  description: string;
  /** "YYYY-MM-DD" */
  date: string;
  endDate: string;
  /** "HH:MM"; absent for all-day events (endDate is then exclusive, as in iCalendar) */
  startTime?: string;
  endTime?: string;
};

const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** One neutral event list used by the .ics file, the feed and the Google Calendar import. */
export function listEvents(p: Person, year: number, month: number): CalEvent[] {
  return p.shifts.map((s) => {
    const info = shiftInfo(s.code, s.hours);
    const date = new Date(year, month - 1, s.day);
    const next = new Date(year, month - 1, s.day + 1);
    const uid = `${slug(p.name)}-${ymd(date)}-${slug(s.code)}@shiftsync`;
    if (info.kind === "timed") {
      return {
        uid,
        summary: `Směna ${s.code}`,
        description: `${info.label ? info.label + " směna" : "Směna"} ${s.code} (${fmtH(info.hours)} h)`,
        date: iso(date),
        endDate: iso(info.overnight ? next : date),
        startTime: info.start,
        endTime: info.end,
      };
    }
    return { uid, summary: info.title, description: `Kód ${s.code}`, date: iso(date), endDate: iso(next) };
  });
}

/** Renders neutral events as an iCalendar document. */
export function renderCalendar(events: CalEvent[], opts: { calName?: string; refreshHours?: number } = {}): string {
  const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, "");
  const compact = (d: string) => d.replace(/-/g, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ShiftSync//CS", "CALSCALE:GREGORIAN", "X-WR-TIMEZONE:Europe/Prague"];
  if (opts.calName) lines.push(`X-WR-CALNAME:${esc(opts.calName)}`);
  if (opts.refreshHours) lines.push(`REFRESH-INTERVAL;VALUE=DURATION:PT${opts.refreshHours}H`, `X-PUBLISHED-TTL:PT${opts.refreshHours}H`);
  lines.push(...VTIMEZONE);

  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(e.summary)}`);
    if (e.startTime && e.endTime) {
      lines.push(
        `DTSTART;TZID=Europe/Prague:${compact(e.date)}T${e.startTime.replace(":", "")}00`,
        `DTEND;TZID=Europe/Prague:${compact(e.endDate)}T${e.endTime.replace(":", "")}00`,
      );
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(e.endDate)}`, "TRANSP:TRANSPARENT");
    }
    lines.push(`DESCRIPTION:${esc(e.description)}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function buildIcs(p: Person, year: number, month: number, opts: { calName?: string } = {}): string {
  return renderCalendar(listEvents(p, year, month), opts);
}
