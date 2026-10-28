# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Two colleagues (the author and a co-worker), shift workers in Czech healthcare-style 12 h day/night rotation. Use it about once a month, when the new "Plán pracovní doby" PDF arrives (mail/chat), mostly on a phone, to get their own shifts into the phone/Google calendar.

## Product Purpose
Take the monthly Excel-exported schedule PDF, pick yourself, check your shifts, download an `.ics` for your calendar. Success: three taps from PDF to calendar, with no surprises.

## Positioning
Reads this specific employer PDF layout (all colleagues in one grid) and extracts one person's shifts. Entirely client-side: the PDF with colleagues' names never leaves the device.

## Operating Context
Input: one-page A4 landscape PDF with ~17 people × 28–31 days, shift codes (D6, D7, N18, R, ŠK, Ev, ŘD…) and hours under each. Output: `.ics` with Europe/Prague time zone; night shifts cross midnight. Imported into Apple/Google Calendar.

## Capabilities and Constraints
- Next.js + TypeScript + Tailwind, deployed on Vercel, no backend/database.
- Default person remembered in localStorage (initial value from `NEXT_PUBLIC_DEFAULT_PERSON`).
- Unknown shift codes are shown as generic timed shifts from PDF hours; meanings of ŠK, OZP, Ev, PřČ are undecided and must not be invented.
- Sample PDF/ics contain real names and are not committed.

## Brand Commitments
Name "ShiftSync". All UI copy in Czech.

## Product Principles
1. Fewest steps from PDF to calendar.
2. Show your own shifts as a calendar month, not a list.
3. Be explicit about anything the parser did not understand.
4. Private by construction: nothing is uploaded.

## Accessibility & Inclusion
Phone-first one-handed use; WCAG AA contrast, visible focus, reduced motion respected, tap targets ≥44px.
