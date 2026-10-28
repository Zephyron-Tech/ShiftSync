import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
const data = new Uint8Array(fs.readFileSync(process.argv[2]));
const doc = await getDocument({ data }).promise;
const page = await doc.getPage(1);
const tc = await page.getTextContent();
for (const it of tc.items) if (it.str.trim()) console.log(it.transform[4].toFixed(1), it.transform[5].toFixed(1), it.width.toFixed(1), JSON.stringify(it.str));
