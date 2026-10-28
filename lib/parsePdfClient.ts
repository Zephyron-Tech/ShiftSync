import { itemsFromTextContent, parseItems, type Schedule } from "./parsePdf";

/** Browser variant: pdf.js with its worker. Kept apart so server bundles never see the worker URL. */
export async function parsePdf(data: ArrayBuffer): Promise<Schedule> {
  // Legacy build: includes polyfills for browsers without Uint8Array.toHex (older iOS/Chrome).
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const page = await doc.getPage(1);
  return parseItems(itemsFromTextContent(await page.getTextContent()));
}
