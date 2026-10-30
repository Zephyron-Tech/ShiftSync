/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from "node:fs";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { expect, test, test as base } from "vitest";
import { addCompanions, displayName } from "../lib/companions";
import { fold, listEvents, renderCalendar } from "../lib/ics";
import { applyEdit } from "../lib/edit";
import { itemsFromTextContent, parseItems, type Schedule } from "../lib/parsePdf";
import { colorAt, rectsFromOperatorList } from "../lib/pdfRects";
import { decodeSchedule, encodeSchedule, onlyPeople } from "../lib/share";

const sched = (people: Schedule["people"]): Schedule => ({ year: 2026, month: 11, people });
const s = (day: number, code: string, color?: string) => ({ day, code, ...(color ? { color } : {}) });

test("surname-first PDF names become given-name-first", () => {
  expect(displayName("Poštová Nikola")).toBe("Nikola Poštová");
  expect(displayName("Mononym")).toBe("Mononym");
});

test("same day, same code and same colour work together; other codes, colours and absences do not", () => {
  const out = addCompanions(
    sched([
      { name: "Aaa Anna", shifts: [s(3, "D7", "#ffff00"), s(4, "D7", "#ffff00"), s(5, "ŘD"), s(6, "ŠK")] },
      { name: "Bbb Bara", shifts: [s(3, "D7", "#ffff00"), s(4, "D7", "#ffc000"), s(5, "ŘD"), s(6, "ŠK")] },
      { name: "Ccc Cyril", shifts: [s(3, "D6", "#ffc000"), s(4, "D7"), s(5, "ŘD"), s(6, "ŠK")] },
      { name: "Ddd Dana", shifts: [s(3, "D7", "#ffff00")] },
    ]),
  );
  const [anna] = out.people;
  expect(anna.shifts[0].with).toEqual(["Bara Bbb", "Dana Ddd"]); // same code and colour
  expect(anna.shifts[1].with).toEqual(["Cyril Ccc"]); // Bbb is orange, Ccc has no colour so only code/time decide
  expect(anna.shifts[2].with).toBeUndefined(); // vacation never lists anybody
  expect(anna.shifts[3].with).toBeUndefined(); // training neither
  expect(JSON.stringify(out)).not.toContain("color"); // the parse-time colour is not kept
});

test("night shifts pair by code and day", () => {
  const out = addCompanions(sched([{ name: "A B", shifts: [s(12, "N18", "#ffc000")] }, { name: "C D", shifts: [s(12, "N18", "#ffc000")] }, { name: "E F", shifts: [s(12, "D6", "#ffc000")] }]));
  expect(out.people[0].shifts[0].with).toEqual(["D C"]);
});

test("rectsFromOperatorList reads fills in drawing order and colorAt returns the topmost cell", () => {
  const path = (x0: number, y0: number, x1: number, y1: number) => [0, x0, y0, 1, x1, y0, 1, x1, y1, 1, x0, y1, 3];
  const ops = { setFillRGBColor: 1, constructPath: 2, fill: 3, eoFill: 4 };
  const list = {
    fnArray: [1, 2, 1, 2, 1, 2],
    argsArray: [["#ffffff"], [4, [path(0, 0, 500, 500)], []], ["#ffff00"], [4, [path(10, 10, 60, 25)], []], ["#ff0000"], [3, [path(10, 10, 60, 25)], []]],
  };
  const rects = rectsFromOperatorList(list, ops);
  expect(rects).toHaveLength(3);
  expect(colorAt(rects, 30, 15)).toBe("#ff0000"); // the red one is drawn last
  expect(colorAt(rects, 300, 300)).toBeUndefined(); // page-sized background is ignored
});

test("ICS description gets an S kým line, escaped; edits drop it; links carry it", () => {
  const person = { name: "A B", shifts: [{ day: 3, code: "D7", hours: 11.5, with: ["Nikola Poštová", "Jiří Jiřík"] }, { day: 5, code: "R", hours: 7.5 }] };
  const ics = renderCalendar(listEvents(person, 2026, 11)).replace(/\r\n /g, ""); // unfolded
  expect(ics).toContain("DESCRIPTION:Denní směna D7 (11\\,5 h)\\nS kým: Nikola Poštová\\, Jiří Jiřík");
  expect(ics.split("\r\n").filter((l) => l.startsWith("DESCRIPTION:") && l.includes("S kým")).length).toBe(1);
  expect(applyEdit(person.shifts, { op: "set", day: 3, code: "D6" }, 30)[0].with).toBeUndefined();
  expect(applyEdit(person.shifts, { op: "move", from: 3, to: 4 }, 30)[0].with).toBeUndefined();
  const back = decodeSchedule(encodeSchedule(onlyPeople({ year: 2026, month: 11, people: [person] }, ["A B"])));
  expect(back.people[0].shifts[0].with).toEqual(["Nikola Poštová", "Jiří Jiřík"]);
  expect(back.people[0].shifts[1].with).toBeUndefined();
});

test("a hostile link cannot smuggle many or huge names", () => {
  const evil = { year: 2026, month: 11, people: [{ name: "A", shifts: [{ day: 1, code: "R", with: Array.from({ length: 30 }, () => "x") }] }] };
  expect(() => decodeSchedule(encodeSchedule(evil))).toThrow();
});

// Needs the private sample PDF and sluzby_listopad.json ({ person, day3With }); skipped without them.
const real = base.skipIf(!existsSync("sluzby_listopad.pdf") || !existsSync("sluzby_listopad.json"));
real("real PDF: the colleagues the boss colours the same way", async () => {
  const names = JSON.parse(readFileSync("sluzby_listopad.json", "utf8")) as { person: string; day3With: string[] };
  const page = await (await getDocument({ data: new Uint8Array(readFileSync("sluzby_listopad.pdf")) }).promise).getPage(1);
  const rects = rectsFromOperatorList(await page.getOperatorList(), OPS as any);
  expect(rects.length).toBeGreaterThan(1000);
  const schedule = addCompanions(parseItems(itemsFromTextContent(await page.getTextContent()), rects));
  const mine = schedule.people.find((p) => p.name === names.person)!;
  expect(mine.shifts.find((x) => x.day === 3)!.with).toEqual(names.day3With);
  // nobody is listed on a day they do not work the same shift
  for (const p of schedule.people) for (const sh of p.shifts) if (sh.with) expect(sh.with).not.toContain(displayName(p.name));
});

test("line folding counts octets, keeps characters whole and unfolds back to the original", () => {
  const long = "DESCRIPTION:" + "Žluťoučký kůň úpěl ďábelské ódy, ".repeat(8) + "konec";
  const folded = fold(long);
  for (const physical of folded.split("\r\n")) expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
  expect(folded.replace(/\r\n /g, "")).toBe(long);
  expect(fold("SHORT:line")).toBe("SHORT:line");
});
