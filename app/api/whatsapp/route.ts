import { after } from "next/server";
import { parsePdfServer } from "@/lib/parsePdfServer";
import { encodeSchedule, onlyPeople } from "@/lib/share";
import { runCommand } from "@/lib/commandHandler";
import { claimMessage, saveMonth } from "@/lib/store";
import { downloadMedia, extractIncoming, parsePersonMap, safeEqual, sendText, verifySignature } from "@/lib/whatsapp";

/** Older messages are ignored: Meta only redelivers recent ones, so this also stops replays of captured bodies. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];

function baseUrl(): string {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

/** Meta calls this once when the webhook is saved in the app dashboard. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (q.get("hub.mode") === "subscribe" && expected && safeEqual(q.get("hub.verify_token") ?? "", expected)) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!secret || !token || !phoneId) return new Response("Not configured", { status: 500 });

  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return new Response("Bad signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const incoming = extractIncoming(payload, phoneId.trim());
  const people = parsePersonMap(process.env.PERSON_MAP);
  const version = process.env.WHATSAPP_GRAPH_VERSION ?? "v25.0";
  // Only numbers listed in PERSON_MAP are served; everyone else is ignored. Each message is handled once.
  const fresh = async (m: { id: string; from: string; at: number }) =>
    Object.hasOwn(people, m.from) && Number.isFinite(m.at) && Date.now() - m.at < MAX_AGE_MS && (await claimMessage(m.id));

  // Answer Meta right away; the PDF work happens after the response.
  after(async () => {
    for (const t of incoming.texts) {
      if (!(await fresh(t))) continue;
      const person = people[t.from];
      const reply = await runCommand({ name: person, text: t.body, base: baseUrl() });
      await sendText(phoneId, t.from, reply, token, version).catch(() => {});
    }
    for (const d of incoming.documents) {
      if (!(await fresh(d))) continue;
      const person = people[d.from];
      try {
        if (d.mime !== "application/pdf") {
          await sendText(phoneId, d.from, "Tohle není PDF. Přepošli rozpis jako PDF soubor.", token, version);
          continue;
        }
        const schedule = await parsePdfServer(await downloadMedia(d.mediaId, token, version));
        const mine = schedule.people.find((p) => p.name === person);
        if (!mine) {
          await sendText(phoneId, d.from, `V rozpisu jsem nenašel jméno „${person}“. Zkontroluj, že je to správný rozpis.`, token, version);
          continue;
        }
        const base = baseUrl();
        const month = `${MONTHS[schedule.month - 1]} ${schedule.year}`;
        const link = `${base}/#d=${encodeSchedule(onlyPeople(schedule, [person]))}&p=${encodeURIComponent(person)}`;
        let preview = link;
        let rest = "";
        try {
          const { token: calToken, first, overwrote } = await saveMonth(person, schedule.year, schedule.month, mine.shifts);
          const sub = `${base}/#s=${calToken}&p=${encodeURIComponent(person)}`;
          // the preview carries the feed token too, so its export panel can offer the live subscription
          preview = `${link}&t=${calToken}`;
          rest += first
            ? `\n\nKalendář si stačí přidat jednou, další rozpisy už jen přepošli a doplní se sám:\n${sub}`
            : `\n\nDoplnil jsem to do tvého kalendáře, změna se projeví do 24 hodin.\nOdběr kalendáře (přidává se jen jednou):\n${sub}`;
          if (overwrote.length) rest += "\nPozor: ručně upravené směny na tento měsíc jsem přepsal rozpisem z PDF.";
          rest += `\nZměnu směny pošli jako text, např. „zmena 12.11. D7“, nebo napiš „pomoc“.`;
        } catch (err) {
          console.error("whatsapp: saving month failed", err instanceof Error ? err.message : err);
        }
        const text = `Rozpis na ${month}: ${mine.shifts.length} směn.\nNáhled:\n${preview}${rest}`;
        await sendText(phoneId, d.from, text, token, version);
      } catch (err) {
        console.error("whatsapp: processing failed", err instanceof Error ? err.message : err);
        await sendText(phoneId, d.from, "Rozpis se mi nepodařilo přečíst. Zkus ho nahrát ručně v appce.", token, version).catch(() => {});
      }
    }
  });

  return new Response("ok", { status: 200 });
}
