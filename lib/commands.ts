import { EDIT_CODES, findEditCode } from "./codes";

type Day = { day: number; month: number };

export type Command =
  | { kind: "help" }
  | { kind: "list" }
  | { kind: "undo" }
  | { kind: "link" }
  | { kind: "set"; at: Day; code: string }
  | { kind: "clear"; at: Day }
  | { kind: "move"; from: Day; to: Day }
  | { kind: "error"; message: string };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const VERBS: Record<string, "help" | "list" | "undo" | "link" | "set" | "clear" | "move"> = {
  pomoc: "help", help: "help", napoveda: "help", "?": "help",
  seznam: "list", rozpis: "list", moje: "list", ukaz: "list",
  zpet: "undo", undo: "undo",
  odkaz: "link", odkazy: "link", upravit: "link", editor: "link", link: "link",
  zmena: "set", nastav: "set", zadej: "set", pridej: "set",
  smaz: "clear", zrus: "clear", odeber: "clear", volno: "clear",
  presun: "move", posun: "move", prehod: "move",
};

// "12.11.", "12.11", "12. 11." and what follows it
const DATE_THEN_REST = /^(\d{1,2})\.\s?(\d{1,2})\.?(?:\s+(.*))?$/;
const DAY_ONLY = /^(\d{1,2})\.?$/;

function takeDate(str: string): { at: Day; rest: string } | null {
  const m = str.match(DATE_THEN_REST);
  if (!m) return null;
  const at = { day: Number(m[1]), month: Number(m[2]) };
  if (at.day < 1 || at.day > 31 || at.month < 1 || at.month > 12) return null;
  return { at, rest: (m[3] ?? "").trim() };
}

export const HELP_EXAMPLES = ["zmena 12.11. D7", "smaz 12.11.", "presun 12.11. 14.11.", "seznam", "zpet", "odkaz"];

/** Strict Czech commands, no AI. Anything it does not understand becomes a readable error. */
export function parseCommand(text: string): Command {
  const t = norm(text);
  const space = t.indexOf(" ");
  const verb = VERBS[space === -1 ? t : t.slice(0, space)];
  const args = space === -1 ? "" : t.slice(space + 1).trim();
  if (!verb) return { kind: "error", message: "Tomu nerozumím. Napiš „pomoc“ pro seznam příkazů." };
  if (verb === "help") return { kind: "help" };
  if (verb === "list") return { kind: "list" };
  if (verb === "undo") return { kind: "undo" };
  if (verb === "link") return { kind: "link" };

  const first = takeDate(args);
  if (!first) {
    const example = verb === "move" ? "presun 12.11. 14.11." : verb === "set" ? "zmena 12.11. D7" : "smaz 12.11.";
    return { kind: "error", message: `Chybí datum, napiš ho jako 12.11. Třeba: ${example}` };
  }
  const { at, rest } = first;

  if (verb === "clear") return { kind: "clear", at };

  if (verb === "set") {
    if (!rest) return { kind: "error", message: `Chybí kód směny. Platné: ${EDIT_CODES.join(", ")}, nebo „volno“.` };
    if (rest === "volno") return { kind: "clear", at };
    const code = findEditCode(rest);
    if (!code) return { kind: "error", message: `Kód „${rest}“ neznám. Platné: ${EDIT_CODES.join(", ")}, nebo „volno“.` };
    return { kind: "set", at, code };
  }

  // move: the target is a full date or just a day in the same month
  const full = takeDate(rest);
  const dayOnly = rest.match(DAY_ONLY);
  const to: Day | null = full && !full.rest ? full.at : dayOnly ? { day: Number(dayOnly[1]), month: at.month } : null;
  if (!to) return { kind: "error", message: "Napiš, kam to přesunout: presun 12.11. 14.11." };
  if (to.month !== at.month) return { kind: "error", message: "Přesun jde jen v rámci jednoho měsíce." };
  return { kind: "move", from: at, to };
}
