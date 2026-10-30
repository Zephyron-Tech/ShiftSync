import { isEditableCode } from "./codes";
import type { Shift } from "./parsePdf";

export type Edit =
  | { op: "set"; day: number; code: string }
  | { op: "clear"; day: number }
  | { op: "move"; from: number; to: number };

/** A mistake the person can fix; the message is shown to them as is. */
export class EditError extends Error {}

export const ymOf = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
export const daysIn = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

function checkDay(day: number, daysInMonth: number) {
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth) throw new EditError(`Den ${day} v tomto měsíci není (má ${daysInMonth} dní).`);
}

/** Pure: returns the new shift list for one month. */
export function applyEdit(shifts: Shift[], edit: Edit, daysInMonth: number): Shift[] {
  const byDay = new Map(shifts.map((s) => [s.day, s]));
  if (edit.op === "set") {
    checkDay(edit.day, daysInMonth);
    if (!isEditableCode(edit.code)) throw new EditError(`Kód „${edit.code}“ neznám.`);
    byDay.set(edit.day, { day: edit.day, code: edit.code });
  } else if (edit.op === "clear") {
    checkDay(edit.day, daysInMonth);
    if (!byDay.has(edit.day)) throw new EditError(`${edit.day}. nemáš žádnou směnu.`);
    byDay.delete(edit.day);
  } else {
    checkDay(edit.from, daysInMonth);
    checkDay(edit.to, daysInMonth);
    const moved = byDay.get(edit.from);
    if (!moved) throw new EditError(`${edit.from}. nemáš žádnou směnu, nemám co přesunout.`);
    if (edit.from === edit.to) throw new EditError("Z a na je stejný den.");
    if (byDay.has(edit.to)) throw new EditError(`${edit.to}. už směnu máš. Použij „zmena“, ať ji přepíšu.`);
    byDay.delete(edit.from);
    // colleagues belong to the old day, so they are dropped
    byDay.set(edit.to, { day: edit.to, code: moved.code, hours: moved.hours });
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

/** The stored month with this month number that is closest to `now` (people edit what is current). */
export function resolveMonth(keys: string[], monthNumber: number, now: Date): string | null {
  const cur = now.getFullYear() * 12 + now.getMonth();
  const cands = keys.filter((k) => Number(k.slice(5, 7)) === monthNumber);
  cands.sort((a, b) => Math.abs(Number(a.slice(0, 4)) * 12 + monthNumber - 1 - cur) - Math.abs(Number(b.slice(0, 4)) * 12 + monthNumber - 1 - cur));
  return cands[0] ?? null;
}

/** Validates an untrusted JSON body; returns null when it is not a well-formed edit. */
export function parseEdit(x: unknown): Edit | null {
  const o = x as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);
  if (o.op === "set" && n(o.day) !== null && typeof o.code === "string") return { op: "set", day: o.day as number, code: o.code };
  if (o.op === "clear" && n(o.day) !== null) return { op: "clear", day: o.day as number };
  if (o.op === "move" && n(o.from) !== null && n(o.to) !== null) return { op: "move", from: o.from as number, to: o.to as number };
  return null;
}
