import { colorAt, type Rect } from "./pdfRects";

/** `color` is the PDF cell fill, only used while parsing; `with` lists colleagues on the same shift ("Jméno Příjmení"). */
export type Shift = { day: number; code: string; hours?: number; with?: string[]; color?: string };
export type Person = { name: string; shifts: Shift[] };
export type Schedule = { year: number; month: number; people: Person[] };

type Item = { str: string; x: number; y: number; w: number };

const MONTHS = [
  "leden", "únor", "březen", "duben", "květen", "červen",
  "červenec", "srpen", "září", "říjen", "listopad", "prosinec",
];

const MAX_ITEMS = 20_000;

const cx = (i: Item) => i.x + i.w / 2;

/** Pure layout logic over text items (testable without pdf.js). */
export function parseItems(items: Item[], rects: Rect[] = []): Schedule {
  const clean = items.filter((i) => i.str.trim());
  // A real schedule page has ~1–2k text items; the layout search below is quadratic, so refuse absurd input.
  if (clean.length > MAX_ITEMS) throw new Error("PDF má příliš mnoho textu, tohle není rozpis.");

  const title = clean.find((i) => /^[^\d\s]+\s+\d{4}$/.test(i.str.trim()) && MONTHS.includes(i.str.trim().split(/\s+/)[0].toLowerCase()));
  if (!title) throw new Error("Nenalezen nadpis s měsícem a rokem (např. „Listopad 2026“).");
  const [mName, yStr] = title.str.trim().split(/\s+/);
  const month = MONTHS.indexOf(mName.toLowerCase()) + 1;
  const year = Number(yStr);

  // Day-number header: row (by y) with the most 1..31 integers.
  const nums = clean.filter((i) => /^\d{1,2}$/.test(i.str) && +i.str >= 1 && +i.str <= 31);
  const rows = new Map<number, Item[]>();
  for (const n of nums) {
    const key = [...rows.keys()].find((k) => Math.abs(k - n.y) < 1.5) ?? n.y;
    rows.set(key, [...(rows.get(key) ?? []), n]);
  }
  const headerRows = [...rows.entries()].filter(([, r]) => r.length >= 28).sort((a, b) => b[0] - a[0]);
  if (!headerRows.length) throw new Error("Nenalezen řádek s čísly dnů.");
  const [topY, header] = headerRows[0];
  const bottomY = headerRows.length > 1 ? headerRows[headerRows.length - 1][0] : -Infinity;
  const columns = header.map((h) => ({ day: +h.str, x: cx(h) })).sort((a, b) => a.x - b.x);
  const pitch = (columns[columns.length - 1].x - columns[0].x) / (columns.length - 1);
  const gridLeft = columns[0].x - pitch / 2;
  const gridRight = columns[columns.length - 1].x + pitch / 2;

  // Names: items in the left margin between the header rows.
  const nameItems = clean
    .filter((i) => i.x < gridLeft - 20 && i.y < topY - 2 && i.y > bottomY + 2 && /\p{L}{2,}\s+\p{L}{2,}/u.test(i.str))
    .sort((a, b) => b.y - a.y);

  const people: Person[] = nameItems.map((n, idx) => {
    const yTop = n.y + 5;
    const yBottom = idx + 1 < nameItems.length ? nameItems[idx + 1].y + 5 : bottomY;
    const shifts: Shift[] = [];
    for (const it of clean) {
      const c = cx(it);
      // code row = same baseline as name (hours row lies lower)
      if (Math.abs(it.y - n.y) > 2.5 || c < gridLeft || c > gridRight) continue;
      if (it.y > yTop || it.y <= yBottom) continue;
      const col = columns.reduce((best, k) => (Math.abs(k.x - c) < Math.abs(best.x - c) ? k : best));
      // hours row sits ~9pt below the code in the same column
      const h = clean.find(
        (o) => o.y < it.y - 5 && o.y > it.y - 14 && Math.abs(cx(o) - col.x) < pitch / 2 && /^-?\d+[,.]*\d*$/.test(o.str.trim()),
      );
      const hours = h ? Number(h.str.trim().replace(",.", ",").replace(",", ".")) : undefined;
      shifts.push({ day: col.day, code: it.str.trim(), hours: Number.isFinite(hours) ? hours : undefined, color: colorAt(rects, c, it.y + 3) });
    }
    return { name: n.str.trim(), shifts: shifts.sort((a, b) => a.day - b.day) };
  });

  return { year, month, people };
}

type TextContentLike = { items: unknown[] };

export function itemsFromTextContent(tc: TextContentLike): Item[] {
  return (tc.items as { str?: string; transform: number[]; width: number }[])
    .filter((i) => typeof i.str === "string")
    .map((i) => ({ str: i.str as string, x: i.transform[4], y: i.transform[5], w: i.width }));
}
