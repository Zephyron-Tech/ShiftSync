import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type IncomingDocument = { id: string; from: string; at: number; mediaId: string; mime: string; filename?: string };
export type IncomingText = { id: string; from: string; at: number; body: string };
export type Incoming = { documents: IncomingDocument[]; texts: IncomingText[] };

/** Constant-time string comparison (hashing first hides the length too). */
export function safeEqual(a: string, b: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

/** Meta signs the raw body with the app secret: `X-Hub-Signature-256: sha256=<hex>`. */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return safeEqual(expected, header.slice("sha256=".length).toLowerCase());
}

type Message = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  document?: { id?: string; mime_type?: string; filename?: string };
};
type Value = { metadata?: { phone_number_id?: string }; messages?: Message[] };

/** Messages to our number only (`phoneId`), each with Meta's message id and send time in ms. */
export function extractIncoming(payload: unknown, phoneId?: string): Incoming {
  const out: Incoming = { documents: [], texts: [] };
  const entries = (payload as { entry?: { changes?: { field?: string; value?: Value }[] }[] })?.entry;
  for (const e of Array.isArray(entries) ? entries : []) {
    for (const ch of Array.isArray(e?.changes) ? e.changes : []) {
      if (ch?.field !== "messages") continue;
      if (phoneId && ch.value?.metadata?.phone_number_id !== phoneId) continue;
      const messages = ch.value?.messages;
      for (const m of Array.isArray(messages) ? messages : []) {
        if (typeof m?.from !== "string" || typeof m.id !== "string") continue;
        const at = Number(m.timestamp) * 1000;
        if (m.type === "document" && typeof m.document?.id === "string") {
          out.documents.push({ id: m.id, from: m.from, at, mediaId: m.document.id, mime: m.document.mime_type ?? "", filename: m.document.filename });
        } else if (m.type === "text") {
          out.texts.push({ id: m.id, from: m.from, at, body: typeof m.text?.body === "string" ? m.text.body : "" });
        }
      }
    }
  }
  return out;
}

/** PERSON_MAP='{"420777123456":"Příjmení Jméno"}' (WhatsApp ids are digits only, no "+"). */
export function parsePersonMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.replace(/\D/g, ""), v]));
  } catch {
    return {};
  }
}

const graph = (v: string) => `${process.env.WHATSAPP_GRAPH_BASE ?? "https://graph.facebook.com"}/${v}`; // base override only for local tests

/** A schedule PDF is a few hundred kB; anything far bigger is not one. */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
// The bearer token goes along with the download, so only Meta's own media hosts get it.
const MEDIA_HOSTS = ["fbsbx.com", "fbcdn.net", "facebook.com", "whatsapp.net", "whatsapp.com"];

export function isMetaMediaUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && MEDIA_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  if (Number(res.headers.get("content-length") ?? 0) > max) throw new Error("media too large");
  const reader = res.body?.getReader();
  if (!reader) throw new Error("media body missing");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new Error("media too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export async function downloadMedia(mediaId: string, token: string, version = "v25.0"): Promise<Uint8Array> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(mediaId)) throw new Error("bad media id");
  const auth = { Authorization: `Bearer ${token}` };
  const meta = await fetch(`${graph(version)}/${mediaId}`, { headers: auth, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!meta.ok) throw new Error(`media lookup ${meta.status}`);
  const { url, file_size } = (await meta.json()) as { url?: string; file_size?: number };
  if (!url) throw new Error("media url missing");
  if (!isMetaMediaUrl(url) && !process.env.WHATSAPP_GRAPH_BASE) throw new Error("media url not on a Meta host");
  if (typeof file_size === "number" && file_size > MAX_MEDIA_BYTES) throw new Error("media too large");
  const file = await fetch(url, { headers: auth, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!file.ok) throw new Error(`media download ${file.status}`);
  return readCapped(file, MAX_MEDIA_BYTES);
}

export async function sendText(phoneId: string, to: string, body: string, token: string, version = "v25.0") {
  const res = await fetch(`${graph(version)}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { preview_url: true, body } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`send ${res.status}`);
}
