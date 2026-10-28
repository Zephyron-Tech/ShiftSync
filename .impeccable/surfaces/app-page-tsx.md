---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: []
---

# Surface brief: ShiftSync main screen (Operate)

Scope: single page, phone-first. Task: upload monthly schedule PDF, pick person, check shifts in a month calendar, download .ics.

## Direction contract
THESIS: The light a shift is worked in. Every calendar day carries a 24 h strip showing the real daylight window in Prague; a shift is a bar across it. Refuses the generic list/card dashboard and the plain colour-chip calendar.
OWN-WORLD: Cool pale-blue ground, ink navy text, one family of sky colours: sun-amber (day D*), dawn-sky (morning R), indigo (night N*), slate dashed (unknown code). Atkinson Hyperlegible Next, tabular figures. Standard controls (select, buttons, month grid). Radius 12 on controls, 4 on strips.
STORY: Visitor sees their month at a glance, knows which shifts start in the dark, trusts the parse because unknown codes are called out, and downloads .ics with one thumb tap.
FIRST VIEWPORT: Empty state: heading, one-line privacy note, large "Vybrat PDF" button, below it three sample strips (D7, R, N18) that double as legend. Loaded state: wordmark + "Jiný rozpis", person select, month title with shift count and hours, 7-column calendar with strips, sticky bottom "Stáhnout .ics" bar.
FORM: assigned direction 5 of 7 grounded candidates (light of the shift), seed: seed:c7480fad60d98cd0.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
