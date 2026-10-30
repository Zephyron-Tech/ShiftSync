export type Rect = { x0: number; x1: number; y0: number; y1: number; fill: string };

type OperatorList = { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> };
type Ops = { setFillRGBColor: number; constructPath: number; fill: number; eoFill: number };

/**
 * Filled rectangles with their colour, in drawing order (the last one covering a point is what you see).
 * Reads pdf.js's operator list, so it works the same in the browser and on the server.
 */
export function rectsFromOperatorList(list: OperatorList, OPS: Ops): Rect[] {
  const rects: Rect[] = [];
  let fill = "#000000";
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i] as unknown[] | null;
    if (!args) continue;
    if (fn === OPS.setFillRGBColor) {
      if (typeof args[0] === "string") fill = args[0];
    } else if (fn === OPS.constructPath && (args[0] === OPS.fill || args[0] === OPS.eoFill)) {
      // pdf.js 5+: args = [paintOp, [pathData], minMax], pathData = [0 x y, 1 x y, 2 c1x c1y c2x c2y x y, 3]
      const first = Array.isArray(args[1]) ? (args[1] as unknown[])[0] : null;
      if (!first || typeof first === "number") continue;
      const p = Array.from(first as ArrayLike<number>);
      const xs: number[] = [];
      const ys: number[] = [];
      for (let k = 0; k < p.length; ) {
        if (p[k] === 0 || p[k] === 1) {
          xs.push(p[k + 1]);
          ys.push(p[k + 2]);
          k += 3;
        } else if (p[k] === 2) {
          xs.push(p[k + 5]);
          ys.push(p[k + 6]);
          k += 7;
        } else k += 1;
      }
      if (xs.length) rects.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), fill });
    }
  }
  return rects;
}

/** Colour of the topmost cell-sized fill under a point; undefined when there is none. */
export function colorAt(rects: Rect[], x: number, y: number): string | undefined {
  let found: string | undefined;
  for (const r of rects) {
    // cell-sized only: skips page and table backgrounds, allows cells merged over several days
    if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1 && r.y1 - r.y0 < 30 && r.x1 - r.x0 < 800) found = r.fill;
  }
  return found;
}
