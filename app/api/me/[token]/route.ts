import { isToken, loadStore } from "@/lib/store";

const headers = { "Cache-Control": "no-store" };

/** Everything the editor needs: the person's name, stored months and whether there is something to undo. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!isToken(token)) return Response.json({ error: "Odkaz je neplatný." }, { status: 404, headers });
  const store = await loadStore(token).catch(() => null);
  if (!store) return Response.json({ error: "Zatím tu nemám žádný rozpis. Pošli botovi PDF." }, { status: 404, headers });
  return Response.json({ name: store.name, months: store.months, canUndo: !!store.history?.length }, { headers });
}
