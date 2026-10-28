/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { expect, test as base, test as plain } from "vitest";
import { deflateSync, strToU8 } from "fflate";
import { buildIcs, esc, listEvents } from "../lib/ics";
import { parsePdfServer } from "../lib/parsePdfServer";
import { decodeSchedule, encodeSchedule, onlyPeople } from "../lib/share";
import { extractIncoming, isMetaMediaUrl, parsePersonMap, safeEqual, verifySignature } from "../lib/whatsapp";

const withPdf = base.skipIf(!existsSync("sluzby_listopad.pdf") || !existsSync("sluzby_listopad.json"));

withPdf("server parser matches, share link roundtrips and stays small", async () => {
  const s = await parsePdfServer(readFileSync("sluzby_listopad.pdf"));
  expect(s.people.length).toBe(17);
  const mine = onlyPeople(s, [JSON.parse(readFileSync("sluzby_listopad.json", "utf8")).person]);
  const link = encodeSchedule(mine);
  expect(link.length).toBeLessThan(600);
  const back = decodeSchedule(link);
  expect(back.people[0].shifts).toEqual(mine.people[0].shifts.map((x) => ({ ...x })));
  expect(encodeSchedule(s).length).toBeLessThan(3000);
});

plain("events carry stable UIDs and overnight end date", () => {
  const p = { name: "Novák Petr", shifts: [{ day: 12, code: "N18", hours: 5.5 }] };
  const [e] = listEvents(p, 2026, 11);
  expect(e).toMatchObject({ date: "2026-11-12", endDate: "2026-11-13", startTime: "18:00", endTime: "06:30", uid: "novakpetr-20261112-n18@shiftsync" });
  expect(buildIcs(p, 2026, 11, { calName: "Směny" })).toContain("X-WR-CALNAME:Směny");
});

plain("webhook signature and payload parsing", () => {
  const body = JSON.stringify({ a: 1 });
  const sig = "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");
  expect(verifySignature(body, sig, "secret")).toBe(true);
  expect(verifySignature(body, sig, "other")).toBe(false);
  expect(verifySignature(body, null, "secret")).toBe(false);

  const payload = {
    entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "P1" }, messages: [
      { id: "wamid.1", from: "420777123456", timestamp: "1793000000", type: "document", document: { id: "M1", mime_type: "application/pdf", filename: "a.pdf" } },
      { id: "wamid.2", from: "420777123456", timestamp: "1793000000", type: "text", text: { body: "ahoj" } },
      { from: "420777123456", type: "text", text: { body: "no id" } },
    ] } }] }],
  };
  const inc = extractIncoming(payload as any, "P1");
  expect(inc.documents).toEqual([{ id: "wamid.1", from: "420777123456", at: 1793000000000, mediaId: "M1", mime: "application/pdf", filename: "a.pdf" }]);
  expect(inc.texts.map((t) => t.body)).toEqual(["ahoj"]);
  // messages for another number of the same Meta app are not ours
  expect(extractIncoming(payload as any, "P2")).toEqual({ documents: [], texts: [] });
  expect(extractIncoming({ entry: "x" })).toEqual({ documents: [], texts: [] });
  expect(parsePersonMap('{"+420 777 123 456":"Jana"}')).toEqual({ "420777123456": "Jana" });
});

plain("signature check is case-insensitive hex and rejects junk", () => {
  const body = "{}";
  const hex = createHmac("sha256", "secret").update(body).digest("hex");
  expect(verifySignature(body, "sha256=" + hex.toUpperCase(), "secret")).toBe(true);
  expect(verifySignature(body, "sha256=", "secret")).toBe(false);
  expect(verifySignature(body, hex, "secret")).toBe(false);
  expect(safeEqual("abc", "abc")).toBe(true);
  expect(safeEqual("abc", "abcd")).toBe(false);
});

plain("media is only fetched from Meta hosts over https", () => {
  expect(isMetaMediaUrl("https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1")).toBe(true);
  expect(isMetaMediaUrl("https://scontent.xx.fbcdn.net/a.pdf")).toBe(true);
  expect(isMetaMediaUrl("http://lookaside.fbsbx.com/x")).toBe(false);
  expect(isMetaMediaUrl("https://fbsbx.com.evil.test/x")).toBe(false);
  expect(isMetaMediaUrl("https://evilfbsbx.com/x")).toBe(false);
  expect(isMetaMediaUrl("http://169.254.169.254/latest")).toBe(false);
  expect(isMetaMediaUrl("not a url")).toBe(false);
});

plain("decodeSchedule refuses bombs, oversized links and malformed data", () => {
  const ok = { year: 2026, month: 11, people: [{ name: "Nováková Jana", shifts: [{ day: 3, code: "D7", hours: 11.5 }] }] };
  expect(decodeSchedule(encodeSchedule(ok)).people[0].shifts[0]).toEqual({ day: 3, code: "D7", hours: 11.5 });

  const pack = (o: unknown) => Buffer.from(deflateSync(strToU8(JSON.stringify(o)), { level: 9 })).toString("base64url");
  // ~5 MB of JSON squeezed into a short link
  const bomb = pack({ y: 2026, m: 11, p: [["x", []]], pad: "a".repeat(5_000_000) });
  expect(bomb.length).toBeLessThan(12_000);
  expect(() => decodeSchedule(bomb)).toThrow();
  expect(() => decodeSchedule("A".repeat(20_000))).toThrow();
  for (const bad of [
    { y: "2026\r\nX", m: 11, p: [] },
    { y: 2026, m: 13, p: [] },
    { y: 2026, m: 11, p: "x" },
    { y: 2026, m: 11, p: [["x", [[0, "D7"]]]] },
    { y: 2026, m: 11, p: [["x", [[1, { a: 1 }]]]] },
    { y: 2026, m: 11, p: [["x", [[1, "D7", "8"]]]] },
    { y: 2026, m: 11, p: [["", []]] },
    { y: 2026, m: 11, p: [["x".repeat(200), []]] },
  ]) {
    expect(() => decodeSchedule(pack(bad)), JSON.stringify(bad).slice(0, 60)).toThrow();
  }
});

plain("calendar text cannot inject new iCalendar lines", () => {
  expect(esc("a\r\nb\rc\nd")).toBe("a\\nb\\nc\\nd");
  expect(esc("x\u0000y;z,w\\")).toBe("xy\\;z\\,w\\\\");
  const ics = buildIcs({ name: "A\r\nATTACH:http://evil.test", shifts: [{ day: 1, code: "D7\rURL:http://evil.test" }] }, 2026, 11, {
    calName: "Směny A\r\nX-EVIL:1",
  });
  const lines = ics.split("\r\n");
  expect(lines.some((l) => /^(ATTACH|URL|X-EVIL)/.test(l))).toBe(false);
  expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
});
