import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { get, put } from "@vercel/blob";
import { applyEdit, daysIn, EditError, ymOf, type Edit } from "./edit";
import type { Shift } from "./parsePdf";

export type HistoryEntry = { at: string; ym: string; before: Shift[] };

/** What we keep per person: only their own shifts, grouped by month ("2026-11"). */
export type PersonStore = {
  name: string;
  months: Record<string, Shift[]>;
  updatedAt: string;
  /** last hand edits, newest last, so `zpět` can undo them */
  history?: HistoryEntry[];
  /** months that carry hand edits (a new PDF overwrites them) */
  edited?: string[];
};

const KEEP_MONTHS = 12;
const KEEP_HISTORY = 10;

/** Stable, unguessable calendar token for a person. Derived, so nothing maps names to tokens. */
export function calendarToken(name: string): string {
  const secret = process.env.CALENDAR_SECRET ?? process.env.WHATSAPP_APP_SECRET;
  if (!secret) throw new Error("CALENDAR_SECRET or WHATSAPP_APP_SECRET is not set");
  return createHmac("sha256", secret).update(`calendar:${name}`).digest("base64url").slice(0, 32);
}

export const isToken = (t: string) => /^[A-Za-z0-9_-]{32}$/.test(t);
const pathOf = (token: string) => `people/${token}.json`;

// Storage: Vercel Blob in production; a plain folder when SHIFTSYNC_STORE_DIR is set (local dev and tests).
async function readText(path: string): Promise<string | null> {
  const dir = process.env.SHIFTSYNC_STORE_DIR;
  if (dir) return readFile(join(dir, path), "utf8").catch(() => null);
  const r = await get(path, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return new Response(r.stream).text();
}

async function writeText(path: string, text: string): Promise<void> {
  const dir = process.env.SHIFTSYNC_STORE_DIR;
  if (dir) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), text);
    return;
  }
  await put(path, text, { access: "private", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
}

export async function loadStore(token: string): Promise<PersonStore | null> {
  if (!isToken(token)) return null;
  const text = await readText(pathOf(token));
  return text ? (JSON.parse(text) as PersonStore) : null;
}

const persist = (token: string, store: PersonStore) => writeText(pathOf(token), JSON.stringify(store));

/**
 * Meta delivers webhooks at least once, so the same message can arrive twice (and a captured
 * signed body could be replayed). The first caller for a message id gets true, everyone after gets false.
 * Only a hash of the id is stored.
 */
export async function claimMessage(messageId: string): Promise<boolean> {
  const path = `seen/${createHash("sha256").update(messageId).digest("hex").slice(0, 40)}`;
  const dir = process.env.SHIFTSYNC_STORE_DIR;
  try {
    if (dir) {
      await mkdir(join(dir, "seen"), { recursive: true });
      await writeFile(join(dir, path), "", { flag: "wx" }); // fails if it exists
    } else {
      await put(path, "1", { access: "private", contentType: "text/plain", addRandomSuffix: false, allowOverwrite: false });
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if ((err as { code?: string }).code === "EEXIST" || /already exists/i.test(msg)) return false;
    // Storage trouble: rather handle a possible duplicate than drop a real message.
    console.error("whatsapp: dedupe unavailable", msg);
    return true;
  }
}

/** Adds or replaces one month from a PDF. `overwrote` lists months whose hand edits were thrown away. */
export async function saveMonth(
  name: string,
  year: number,
  month: number,
  shifts: Shift[],
): Promise<{ token: string; first: boolean; overwrote: string[] }> {
  const token = calendarToken(name);
  const existing = await loadStore(token);
  const ym = ymOf(year, month);
  const overwrote = existing?.edited?.includes(ym) ? [ym] : [];
  const months = { ...(existing?.months ?? {}), [ym]: shifts };
  const keys = Object.keys(months).sort().slice(-KEEP_MONTHS);
  await persist(token, {
    name,
    months: Object.fromEntries(keys.map((k) => [k, months[k]])),
    updatedAt: new Date().toISOString(),
    history: existing?.history,
    edited: (existing?.edited ?? []).filter((k) => k !== ym),
  });
  return { token, first: !existing, overwrote };
}

/** Applies one hand edit to a stored month. Throws EditError with a message the person can read. */
export async function editByToken(token: string, ym: string, edit: Edit): Promise<{ store: PersonStore; before: Shift[]; after: Shift[] }> {
  const store = await loadStore(token);
  if (!store) throw new EditError("Zatím nemám žádný tvůj rozpis. Pošli mi PDF.");
  const before = store.months[ym];
  if (!before) throw new EditError(`Na ${ym.slice(5)}/${ym.slice(0, 4)} nemám rozpis. Pošli mi PDF.`);
  const after = applyEdit(before, edit, daysIn(ym));
  const next: PersonStore = {
    ...store,
    months: { ...store.months, [ym]: after },
    updatedAt: new Date().toISOString(),
    history: [...(store.history ?? []), { at: new Date().toISOString(), ym, before }].slice(-KEEP_HISTORY),
    edited: [...new Set([...(store.edited ?? []), ym])],
  };
  await persist(token, next);
  return { store: next, before, after };
}

/** Undoes the last hand edit. */
export async function undoByToken(token: string): Promise<{ store: PersonStore; ym: string }> {
  const store = await loadStore(token);
  const last = store?.history?.at(-1);
  if (!store || !last) throw new EditError("Není co vracet.");
  const history = store.history!.slice(0, -1);
  const next: PersonStore = {
    ...store,
    months: { ...store.months, [last.ym]: last.before },
    updatedAt: new Date().toISOString(),
    history,
    edited: (store.edited ?? []).filter((k) => k !== last.ym || history.some((h) => h.ym === k)),
  };
  await persist(token, next);
  return { store: next, ym: last.ym };
}
