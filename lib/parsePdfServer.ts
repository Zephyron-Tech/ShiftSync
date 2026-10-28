import { itemsFromTextContent, parseItems, type Schedule } from "./parsePdf";

/** Node variant of parsePdf (no browser worker). Used by the WhatsApp webhook. */
export async function parsePdfServer(data: ArrayBuffer | Uint8Array): Promise<Schedule> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdf.js loads its "fake worker" by a dynamic path import that the Vercel file tracer cannot see.
  // Importing it explicitly gets it into the bundle and hands it to pdf.js directly.
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const page = await doc.getPage(1);
  return parseItems(itemsFromTextContent(await page.getTextContent()));
}
