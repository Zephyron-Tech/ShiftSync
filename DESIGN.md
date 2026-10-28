# Design: ShiftSync

Direction: **Světlo směny**. Each calendar day carries a 24 h strip that shows the real daylight window in Plzeň (NOAA sunrise equation, `lib/sun.ts`); a shift is a bar across it. Operate surface, phone-first.

## Colour
- Ground `--bg` #eef2f8 (dark: #0b1122), surface #ffffff, ink #0f1a33, secondary ink #4a5772, line #d3dbe8.
- Shift tones: day (D*) amber #f0ab2a, morning (R) sky #7dbfe8, night (N*) indigo #243069 (dark: #6c7fe6), unknown code slate dashed outline.
- Track: night tint #dde3f0, lit tint #fff3d1. Accent/primary button indigo #243069 (dark: #a9b8ff).
- Colour never carries a shift alone: every cell also prints the code.

## Type
Atkinson Hyperlegible Next (latin + latin-ext), single family. Scale: 3xl month title, lg detail heading, base body, 11–14 px calendar labels. No tabular-nums (face draws a slashed zero that reads as strikethrough).

## Layout
Everything fits one screen without scrolling (checked at 375x667, 390x844, 1280x800). Calendar cell height is computed from `100dvh` and the number of week rows (`.cal-track` in `globals.css`), so the month shrinks to the space left.
- Phone: header, person select, month + counts, calendar, one-line day detail, fixed bottom button that opens an export bottom sheet (`<dialog>`).
- >=1024 px: 22 rem left column (person, month, day detail, export options inline) + calendar right.

## Components
Select, primary button (h-14, radius 12), calendar cell buttons (aria-pressed, full spoken label), bars with 3–4 px radius, dashed notice for unknown codes.

## Motion
One moment: bars grow in once (520 ms, ease-out expo, staggered 16 ms) when a schedule loads; disabled under `prefers-reduced-motion`.

## Rules
No eyebrows, no gradient text, no glass, no coloured side-borders, no emoji/glyph icons (icons are drawn SVG strokes 1.75).
