import { listEvents, renderCalendar } from "@/lib/ics";
import { isToken, loadStore } from "@/lib/store";

/** Stable per-person calendar feed (webcal://…/api/cal/<token>). Every month the bot has stored for that person. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!isToken(token)) return new Response("Not found", { status: 404 });
  const store = await loadStore(token).catch(() => null);
  if (!store) return new Response("Not found", { status: 404 });

  const events = Object.entries(store.months).flatMap(([ym, shifts]) => {
    const [year, month] = ym.split("-").map(Number);
    return listEvents({ name: store.name, shifts }, year, month);
  });
  return new Response(renderCalendar(events, { calName: `Směny ${store.name}`, refreshHours: 24 }), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="sluzby.ics"', "Cache-Control": "private, max-age=300" },
  });
}
