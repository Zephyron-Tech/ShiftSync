/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { expect, test as base } from "vitest";
import { parseItems } from "../lib/parsePdf";
import { buildIcs } from "../lib/ics";

// Sample PDF is private (real names) and not in the repo; so are the names it is checked against
// (sluzby_listopad.json: { "person": …, "nightPerson": … }). Tests skip without them.
const test = base.skipIf(!existsSync("sluzby_listopad.pdf") || !existsSync("sluzby_listopad.json"));
const names = (): { person: string; nightPerson: string } => JSON.parse(readFileSync("sluzby_listopad.json", "utf8"));

async function load() {
  const data = new Uint8Array(readFileSync("sluzby_listopad.pdf"));
  const page = await (await getDocument({ data }).promise).getPage(1);
  const tc = await page.getTextContent();
  return parseItems(tc.items.map((i: any) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width })));
}

test("parses sample", async () => {
  const s = await load();
  expect([s.year, s.month, s.people.length]).toEqual([2026, 11, 17]);
  const mine = s.people.find((p) => p.name === names().person)!;
  expect(mine.shifts.slice(0, 5).map(({ day, code }) => ({ day, code }))).toEqual([
    { day: 3, code: "D7" }, { day: 4, code: "D7" }, { day: 5, code: "D7" }, { day: 6, code: "R" }, { day: 9, code: "R" },
  ]);
  expect(mine.shifts.find((x) => x.code === "Ev")!.day).toBe(17);
  const night = s.people.find((p) => p.name === names().nightPerson)!;
  expect(night.shifts.filter((x) => x.code === "N18").map((x) => x.day)).toEqual([12, 13, 17, 24]);
});

test("night shift crosses midnight", async () => {
  const s = await load();
  const ics = buildIcs(s.people.find((p) => p.name === names().nightPerson)!, 2026, 11);
  expect(ics).toContain("DTSTART;TZID=Europe/Prague:20261112T180000");
  expect(ics).toContain("DTEND;TZID=Europe/Prague:20261113T063000");
});

test("matches reference format, unknown code uses PDF hours", async () => {
  const s = await load();
  const ics = buildIcs(s.people.find((p) => p.name === names().person)!, 2026, 11);
  expect(ics).toContain("SUMMARY:Směna D7");
  expect(ics).toContain("DESCRIPTION:Denní směna D7 (11\\,5 h)");
  expect(ics).toContain("DESCRIPTION:Ranní směna R (7\\,5 h)");
  expect(ics).toContain("DTSTART;TZID=Europe/Prague:20261117T070000\r\nDTEND;TZID=Europe/Prague:20261117T150000");
  expect(ics).toContain("DESCRIPTION:Směna Ev (7\\,5 h)");
  expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(16);
});
