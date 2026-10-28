import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import { runCommand } from "../lib/commandHandler";
import { parseCommand } from "../lib/commands";
import { applyEdit, EditError, parseEdit, resolveMonth } from "../lib/edit";
import { calendarToken, claimMessage, loadStore, saveMonth } from "../lib/store";

const shifts = [
  { day: 3, code: "D7" },
  { day: 12, code: "R" },
];

test("applyEdit: set, clear, move and the mistakes people can make", () => {
  expect(applyEdit(shifts, { op: "set", day: 12, code: "D7" }, 30).find((s) => s.day === 12)?.code).toBe("D7");
  expect(applyEdit(shifts, { op: "set", day: 5, code: "N18" }, 30).map((s) => s.day)).toEqual([3, 5, 12]);
  expect(applyEdit(shifts, { op: "clear", day: 3 }, 30).map((s) => s.day)).toEqual([12]);
  expect(applyEdit(shifts, { op: "move", from: 12, to: 14 }, 30).map((s) => s.day)).toEqual([3, 14]);
  expect(() => applyEdit(shifts, { op: "set", day: 31, code: "D7" }, 30)).toThrow(EditError);
  expect(() => applyEdit(shifts, { op: "set", day: 5, code: "XX" }, 30)).toThrow(/neznám/);
  expect(() => applyEdit(shifts, { op: "clear", day: 5 }, 30)).toThrow(/žádnou směnu/);
  expect(() => applyEdit(shifts, { op: "move", from: 12, to: 3 }, 30)).toThrow(/už směnu máš/);
  expect(() => applyEdit(shifts, { op: "move", from: 5, to: 6 }, 30)).toThrow(/nemám co přesunout/);
});

test("applyEdit does not mutate its input", () => {
  const before = JSON.stringify(shifts);
  applyEdit(shifts, { op: "clear", day: 3 }, 30);
  expect(JSON.stringify(shifts)).toBe(before);
});

test("resolveMonth picks the stored month closest to now", () => {
  const keys = ["2025-11", "2026-11", "2026-12"];
  expect(resolveMonth(keys, 11, new Date(2026, 10, 10))).toBe("2026-11");
  expect(resolveMonth(keys, 12, new Date(2026, 10, 10))).toBe("2026-12");
  expect(resolveMonth(keys, 3, new Date(2026, 10, 10))).toBeNull();
});

test("parseCommand: spellings people really type", () => {
  expect(parseCommand("zmena 12.11. D7")).toEqual({ kind: "set", at: { day: 12, month: 11 }, code: "D7" });
  expect(parseCommand("Změna 12. 11. n18")).toEqual({ kind: "set", at: { day: 12, month: 11 }, code: "N18" });
  expect(parseCommand("nastav 5.12 rd")).toEqual({ kind: "set", at: { day: 5, month: 12 }, code: "ŘD" });
  expect(parseCommand("zmena 12.11. volno")).toEqual({ kind: "clear", at: { day: 12, month: 11 } });
  expect(parseCommand("smaž 12.11.")).toEqual({ kind: "clear", at: { day: 12, month: 11 } });
  expect(parseCommand("přesun 12.11. 14.11.")).toEqual({ kind: "move", from: { day: 12, month: 11 }, to: { day: 14, month: 11 } });
  expect(parseCommand("presun 12.11. 14")).toEqual({ kind: "move", from: { day: 12, month: 11 }, to: { day: 14, month: 11 } });
  expect(parseCommand("zpět")).toEqual({ kind: "undo" });
  expect(parseCommand("SEZNAM")).toEqual({ kind: "list" });
  expect(parseCommand("pomoc")).toEqual({ kind: "help" });
  expect(parseCommand("odkaz")).toEqual({ kind: "link" });
});

test("parseCommand: bad input becomes a readable error", () => {
  for (const bad of ["ahoj", "zmena", "zmena 12.11.", "zmena 12.11. XYZ", "zmena 32.11. D7", "zmena 12.13. D7", "presun 12.11.", "presun 12.11. 3.12."]) {
    expect(parseCommand(bad).kind, bad).toBe("error");
  }
});

beforeEach(() => {
  process.env.SHIFTSYNC_STORE_DIR = mkdtempSync(join(tmpdir(), "shiftsync-"));
  process.env.WHATSAPP_APP_SECRET = "secret";
});

const now = new Date(2026, 10, 10);
const run = (text: string) => runCommand({ name: "Jana", text, base: "https://x.test", now });

test("end to end: edit, undo and the new PDF overwriting edits", async () => {
  expect(await run("seznam")).toMatch(/Pošli mi PDF/);
  await saveMonth("Jana", 2026, 11, [{ day: 3, code: "D7", hours: 11.5 }, { day: 12, code: "R", hours: 7.5 }]);

  expect(await run("zmena 12.11. D7")).toMatch(/12\. 11\. R → D7 \(07:00–19:30\)/);
  expect(await run("presun 3.11. 4.11.")).toMatch(/D7: 3\. 11\. → 4\. 11\./);
  const tok = calendarToken("Jana");
  expect((await loadStore(tok))!.months["2026-11"].map((s) => `${s.day}${s.code}`)).toEqual(["4D7", "12D7"]);
  expect(await run("seznam")).toMatch(/D7: 4\. 12\./);

  expect(await run("zpet")).toMatch(/Vrátil/);
  expect((await loadStore(tok))!.months["2026-11"].map((s) => s.day)).toEqual([3, 12]);
  expect(await run("zmena 20.11. Q")).toMatch(/neznám/);
  expect(await run("zmena 5.3. D7")).toMatch(/nemám rozpis/);
  expect(await run("odkaz")).toContain(`#e=${tok}`);

  const again = await saveMonth("Jana", 2026, 11, [{ day: 1, code: "R" }]);
  expect(again.overwrote).toEqual(["2026-11"]);
  const clean = await saveMonth("Jana", 2026, 11, [{ day: 1, code: "R" }]);
  expect(clean.overwrote).toEqual([]);
});

test("pomoc explains every command and lists the codes", async () => {
  const help = await runCommand({ name: "Jana", text: "pomoc", base: "https://x.test", now });
  for (const word of ["zmena 12.11. D7", "smaz 12.11.", "presun 12.11. 14.11.", "zpet", "seznam", "odkaz"]) expect(help).toContain(word);
  for (const code of ["D7.3", "N19", "ŘD", "Ne", "NV", "RH", "Ev"]) expect(help).toContain(code);
  expect(help).toContain("24 hodin");
  expect(help).toContain("/#e=");
  expect(help.length).toBeLessThan(2000);
});

test("a redelivered webhook message is handled only once", async () => {
  expect(await claimMessage("wamid.A")).toBe(true);
  expect(await claimMessage("wamid.A")).toBe(false);
  expect(await claimMessage("wamid.B")).toBe(true);
});

test("parseEdit only accepts well-formed edits", () => {
  expect(parseEdit({ op: "set", day: 3, code: "D7" })).toEqual({ op: "set", day: 3, code: "D7" });
  for (const bad of [null, "x", [], { op: "set", day: "3", code: "D7" }, { op: "set", day: 1.5, code: "D7" }, { op: "move", from: 1 }, { op: "drop", day: 1 }]) {
    expect(parseEdit(bad), JSON.stringify(bad)).toBeNull();
  }
});
