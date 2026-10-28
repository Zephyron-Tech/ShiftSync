import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import type { Person, Schedule, Shift } from "./parsePdf";

// A schedule travels inside a link (after `#`, so servers never see it from the page URL).
type Compact = { y: number; m: number; p: [string, [number, string, number?][]][] };

// Links are untrusted (anyone can craft one for /api/ics), so decoding is capped and checked.
// A full 17-person month encodes to ~3 kB; these limits leave plenty of room.
const MAX_LINK = 12_000;
const MAX_JSON = 200_000;
const MAX_PEOPLE = 100;

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function encodeSchedule(s: Schedule): string {
  const c: Compact = {
    y: s.year,
    m: s.month,
    p: s.people.map((p) => [p.name, p.shifts.map((x) => (x.hours === undefined ? [x.day, x.code] : [x.day, x.code, x.hours]))]),
  };
  return toB64Url(deflateSync(strToU8(JSON.stringify(c)), { level: 9 }));
}

const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

function bad(): never {
  throw new Error("Odkaz s rozpisem je poškozený.");
}

function shiftOf(x: unknown): Shift {
  if (!Array.isArray(x)) bad();
  const [day, code, hours] = x as unknown[];
  if (!isInt(day, 1, 31) || !isText(code, 16)) bad();
  if (hours !== undefined && hours !== null && !(typeof hours === "number" && Number.isFinite(hours) && Math.abs(hours) <= 48)) bad();
  return { day, code, hours: typeof hours === "number" ? hours : undefined };
}

export function decodeSchedule(d: string): Schedule {
  if (d.length > MAX_LINK) bad();
  // `out` caps the inflated size, so a tiny "zip bomb" link cannot blow up memory.
  const raw = inflateSync(fromB64Url(d), { out: new Uint8Array(MAX_JSON + 1) });
  if (raw.length > MAX_JSON) bad();
  const c = JSON.parse(strFromU8(raw)) as Partial<Compact> | null;
  if (!c || !isInt(c.y, 2000, 2100) || !isInt(c.m, 1, 12) || !Array.isArray(c.p) || c.p.length > MAX_PEOPLE) bad();
  const people: Person[] = c.p.map((p) => {
    if (!Array.isArray(p) || !isText(p[0], 100) || !Array.isArray(p[1]) || p[1].length > 31) bad();
    return { name: p[0], shifts: p[1].map(shiftOf) };
  });
  return { year: c.y, month: c.m, people };
}

/** Keep only the named people (used to minimise what a link exposes). */
export function onlyPeople(s: Schedule, names: string[]): Schedule {
  return { ...s, people: s.people.filter((p) => names.includes(p.name)) };
}
