export type ShiftInfo =
  | { kind: "timed"; label: string; start: string; end: string; overnight: boolean; hours: number; known: boolean; holiday?: boolean }
  | { kind: "allday"; title: string };

// Only codes with a known meaning/time (legend of the schedule PDF). Any other code is
// treated as a generic timed shift derived from the hours printed in the PDF.
const KNOWN: Record<string, { label: string; start: string; end: string; overnight?: boolean }> = {
  D: { label: "Denní", start: "07:00", end: "19:00" },
  D5: { label: "Denní", start: "05:00", end: "17:30" },
  D6: { label: "Denní", start: "06:00", end: "18:30" },
  D7: { label: "Denní", start: "07:00", end: "19:30" },
  "D7.3": { label: "Denní", start: "07:30", end: "19:30" },
  D8: { label: "Denní", start: "08:00", end: "20:30" },
  N18: { label: "Noční", start: "18:00", end: "06:30", overnight: true },
  N19: { label: "Noční", start: "19:00", end: "07:30", overnight: true },
  "N*": { label: "Noční", start: "18:30", end: "07:00", overnight: true },
  R: { label: "Ranní", start: "07:00", end: "15:00" },
  "R7,3": { label: "Ranní", start: "07:30", end: "15:30" },
  "R/": { label: "Ranní", start: "07:30", end: "15:30" },
};

const ALL_DAY: Record<string, string> = {
  ŘD: "Dovolená",
  Ne: "Nemoc",
  NV: "Náhradní volno",
  RH: "Rehabilitace",
};

const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3);
const toTime = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** Paid hours = span minus unpaid break (30 min up to 10 h, 1 h above). */
const paid = (span: number) => span - (span > 600 ? 60 : 30);

export function shiftInfo(code: string, hours?: number): ShiftInfo {
  const k = KNOWN[code];
  if (k) {
    let span = toMin(k.end) - toMin(k.start);
    if (k.overnight) span += 1440;
    return { kind: "timed", ...k, overnight: !!k.overnight, hours: paid(span) / 60, known: true };
  }
  if (code === "Ev") {
    // Svátek (public holiday) worked as a regular shift; length comes from the PDF hours.
    const h = hours && hours > 0 ? hours : 7.5;
    const span = Math.round(h * 60) + (h * 60 > 570 ? 60 : 30);
    return { kind: "timed", label: "", start: "07:00", end: toTime(420 + span), overnight: false, hours: h, known: true, holiday: true };
  }
  if (code in ALL_DAY) return { kind: "allday", title: ALL_DAY[code] };
  if (hours && hours > 0) {
    // unknown code: assume it starts 07:00, break 30 min (<=10 h) or 1 h
    const span = Math.round(hours * 60) + (hours * 60 > 570 ? 60 : 30);
    return { kind: "timed", label: "", start: "07:00", end: toTime(420 + span), overnight: false, hours, known: false };
  }
  return { kind: "allday", title: `Směna ${code}` };
}

export type Tone = "day" | "morning" | "night" | "holiday" | "unknown" | "allday";

export function toneOf(info: ShiftInfo): Tone {
  if (info.kind === "allday") return "allday";
  if (info.holiday) return "holiday";
  if (!info.known) return "unknown";
  return info.label === "Denní" ? "day" : info.label === "Ranní" ? "morning" : "night";
}

/** Codes a person may enter by hand (WhatsApp command or editor). Times always come from `shiftInfo`. */
export const EDIT_CODES = ["D5", "D6", "D7", "D7.3", "D8", "N18", "N19", "R", "Ev", "ŘD", "Ne", "NV", "RH"] as const;

const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const ALIASES: Record<string, string> = { SVATEK: "Ev", DOVOLENA: "ŘD", NEMOC: "Ne" };

export const isEditableCode = (code: string) => (EDIT_CODES as readonly string[]).includes(code);

/** "n18" → "N18", "rd" → "ŘD", "dovolena" → "ŘD"; null when it is not an editable code. */
export function findEditCode(input: string): string | null {
  const k = strip(input.trim());
  if (ALIASES[k]) return ALIASES[k];
  return EDIT_CODES.find((c) => strip(c) === k) ?? null;
}

export function editCodeLabel(code: string): string {
  const info = shiftInfo(code);
  return info.kind === "timed" ? `${info.start}–${info.end}` : info.title;
}
