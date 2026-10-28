import { editCodeLabel } from "./codes";
import { parseCommand } from "./commands";
import { EditError, resolveMonth, ymOf } from "./edit";
import { calendarToken, editByToken, loadStore, undoByToken } from "./store";
import type { Shift } from "./parsePdf";

const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
const d = (day: number, month: number) => `${day}. ${month}.`;

function helpText(base: string, token: string) {
  return [
    "Přepošli mi PDF s rozpisem a uložím ti směny do kalendáře.",
    "",
    "Změna směny, když šéf něco změní a nepřijde nové PDF:",
    "• zmena 12.11. D7",
    "  Na 12. 11. nastaví směnu D7. Původní směnu přepíše, a když tam žádná nebyla, přidá ji.",
    "• smaz 12.11.",
    "  Zruší směnu v ten den, zůstane volno. Stejně funguje „volno 12.11.“.",
    "• presun 12.11. 14.11.",
    "  Přesune směnu z 12. 11. na 14. 11. Na cílový den nesmíš mít jinou směnu, v tom případě použij „zmena“.",
    "• zpet",
    "  Vrátí poslední úpravu. Jde zopakovat a vracet jednu po druhé.",
    "",
    "Kontrola:",
    "• seznam",
    "  Vypíše tvoje směny tohoto měsíce, seskupené podle kódu.",
    "• odkaz",
    "  Pošle odkaz na přidání odběru kalendáře a odkaz na úpravy klepáním v kalendáři.",
    "",
    "Kódy směn:",
    "D5, D6, D7, D7.3, D8 denní, N18, N19 noční, R ranní, Ev svátek, ŘD dovolená, Ne nemoc, NV náhradní volno, RH rehabilitace.",
    "Datum piš jako den.měsíc, třeba 12.11.",
    "",
    "Změny se v kalendáři projeví do 24 hodin. Nové PDF na měsíc s ručními úpravami je přepíše, platí rozpis z PDF.",
    `Úpravy v kalendáři: ${base}/#e=${token}`,
  ].join("\n");
}

function listText(name: string, ym: string, shifts: Shift[]) {
  if (!shifts.length) return `Na ${MONTHS[Number(ym.slice(5)) - 1]} nemáš žádné směny.`;
  const byCode = new Map<string, number[]>();
  for (const s of shifts) byCode.set(s.code, [...(byCode.get(s.code) ?? []), s.day]);
  const lines = [...byCode].map(([code, days]) => `${code}: ${days.map((x) => `${x}.`).join(" ")}`);
  return `${name}, ${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)} (${shifts.length} směn):\n${lines.join("\n")}`;
}

/** Runs one WhatsApp text from a known person and returns the reply. Never throws for user mistakes. */
export async function runCommand(opts: { name: string; text: string; base: string; now?: Date }): Promise<string> {
  const now = opts.now ?? new Date();
  const token = calendarToken(opts.name);
  const cmd = parseCommand(opts.text);

  try {
    if (cmd.kind === "error") return cmd.message;
    if (cmd.kind === "help") return helpText(opts.base, token);
    if (cmd.kind === "link") return `Odběr kalendáře: ${opts.base}/#s=${token}\nÚpravy směn: ${opts.base}/#e=${token}`;

    const store = await loadStore(token);
    if (!store) return "Zatím nemám žádný tvůj rozpis. Pošli mi PDF.";

    if (cmd.kind === "list") {
      const ym = resolveMonth(Object.keys(store.months), now.getMonth() + 1, now) ?? Object.keys(store.months).sort().at(-1)!;
      return listText(store.name, ym, store.months[ym]);
    }
    if (cmd.kind === "undo") {
      const { store: next, ym } = await undoByToken(token);
      return `Vrátil jsem poslední úpravu (${MONTHS[Number(ym.slice(5)) - 1]}). Teď platí:\n${listText(next.name, ym, next.months[ym])}`;
    }

    const monthNumber = cmd.kind === "move" ? cmd.from.month : cmd.at.month;
    const ym = resolveMonth(Object.keys(store.months), monthNumber, now);
    if (!ym) return `Na ${MONTHS[monthNumber - 1]} nemám rozpis. Pošli mi PDF.`;
    const edit =
      cmd.kind === "set" ? ({ op: "set", day: cmd.at.day, code: cmd.code } as const)
      : cmd.kind === "clear" ? ({ op: "clear", day: cmd.at.day } as const)
      : ({ op: "move", from: cmd.from.day, to: cmd.to.day } as const);
    const { before } = await editByToken(token, ym, edit);

    const find = (list: Shift[], day: number) => list.find((s) => s.day === day);
    let msg: string;
    if (edit.op === "set") msg = `${d(edit.day, monthNumber)} ${find(before, edit.day)?.code ?? "volno"} → ${edit.code} (${editCodeLabel(edit.code)})`;
    else if (edit.op === "clear") msg = `${d(edit.day, monthNumber)} ${find(before, edit.day)?.code} → volno`;
    else msg = `${find(before, edit.from)?.code}: ${d(edit.from, monthNumber)} → ${d(edit.to, monthNumber)}`;
    return `Hotovo: ${msg}.\nKalendář se obnoví do 24 hodin. Chyba? Napiš „zpet“.`;
  } catch (err) {
    if (err instanceof EditError) return err.message;
    console.error("whatsapp: command failed", err instanceof Error ? err.message : err);
    return "Tohle se nepovedlo uložit. Zkus to za chvíli znovu.";
  }
}

export { ymOf };
