import { buildIcs } from "@/lib/ics";
import { decodeSchedule } from "@/lib/share";

/** Calendar feed for subscribing (webcal://). Same data as the page link: `?d=<encoded>&p=<name>`. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const d = q.get("d");
  if (!d) return new Response("Missing d", { status: 400 });
  try {
    const schedule = decodeSchedule(d);
    const person = schedule.people.find((p) => p.name === q.get("p")) ?? schedule.people[0];
    if (!person) return new Response("No person", { status: 404 });
    const body = buildIcs(person, schedule.year, schedule.month, { calName: `Směny ${person.name}` });
    return new Response(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="sluzby-${schedule.year}-${String(schedule.month).padStart(2, "0")}.ics"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Bad data", { status: 400 });
  }
}
