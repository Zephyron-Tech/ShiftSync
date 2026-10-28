import { beforeEach, expect, test, vi } from "vitest";

// In-memory stand-in for @vercel/blob (private store).
const files = new Map<string, string>();
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (path: string, body: string) => void files.set(path, body)),
  get: vi.fn(async (path: string) =>
    files.has(path) ? { statusCode: 200, stream: new Response(files.get(path)).body, blob: {}, headers: new Headers() } : null,
  ),
}));

import { listEvents, renderCalendar } from "../lib/ics";
import { calendarToken, isToken, loadStore, saveMonth } from "../lib/store";

beforeEach(() => {
  files.clear();
  process.env.WHATSAPP_APP_SECRET = "secret";
});

test("token is stable, unguessable-looking and per person", () => {
  const a = calendarToken("Nováková Jana");
  expect(a).toBe(calendarToken("Nováková Jana"));
  expect(a).not.toBe(calendarToken("Novák Petr"));
  expect(isToken(a)).toBe(true);
  expect(isToken("../etc/passwd")).toBe(false);
});

test("months accumulate and the feed carries all of them", async () => {
  const nov = await saveMonth("Nováková Jana", 2026, 11, [{ day: 3, code: "D7", hours: 11.5 }]);
  expect(nov.first).toBe(true);
  const dec = await saveMonth("Nováková Jana", 2026, 12, [{ day: 1, code: "N18", hours: 5.5 }]);
  expect(dec.first).toBe(false);
  expect(dec.token).toBe(nov.token);

  const store = (await loadStore(nov.token))!;
  expect(Object.keys(store.months)).toEqual(["2026-11", "2026-12"]);

  const events = Object.entries(store.months).flatMap(([ym, shifts]) => {
    const [y, m] = ym.split("-").map(Number);
    return listEvents({ name: store.name, shifts }, y, m);
  });
  const ics = renderCalendar(events, { calName: "Směny", refreshHours: 6 });
  expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
  expect(ics).toContain("DTSTART;TZID=Europe/Prague:20261201T180000");
  expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H");
});

test("re-sending a month replaces it instead of duplicating", async () => {
  await saveMonth("Jana", 2026, 11, [{ day: 3, code: "D7" }]);
  const r = await saveMonth("Jana", 2026, 11, [{ day: 4, code: "R" }]);
  const store = (await loadStore(r.token))!;
  expect(store.months["2026-11"]).toEqual([{ day: 4, code: "R" }]);
});

test("unknown token gives null", async () => {
  expect(await loadStore("a".repeat(32))).toBeNull();
});
