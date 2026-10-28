import { EditError, parseEdit } from "@/lib/edit";
import { editByToken, isToken, undoByToken } from "@/lib/store";

const headers = { "Cache-Control": "no-store" };

/** POST { ym, edit } applies one hand edit; POST { undo: true } reverts the last one. The token is the credential. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!isToken(token)) return Response.json({ error: "Odkaz je neplatný." }, { status: 404, headers });
  // Only the editor page itself writes here; a browser marks requests sent from other sites.
  if (req.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Nepovolený požadavek." }, { status: 403, headers });
  const body = (await req.json().catch(() => null)) as { ym?: unknown; edit?: unknown; undo?: unknown } | null;
  try {
    const store =
      body?.undo === true
        ? (await undoByToken(token)).store
        : await (async () => {
            const edit = parseEdit(body?.edit);
            if (!edit || typeof body?.ym !== "string" || !/^\d{4}-\d{2}$/.test(body.ym)) throw new EditError("Neplatná úprava.");
            return (await editByToken(token, body.ym, edit)).store;
          })();
    return Response.json({ name: store.name, months: store.months, canUndo: !!store.history?.length }, { headers });
  } catch (err) {
    if (err instanceof EditError) return Response.json({ error: err.message }, { status: 400, headers });
    console.error("edit failed", err instanceof Error ? err.message : err);
    return Response.json({ error: "Uložení se nepovedlo, zkus to znovu." }, { status: 500, headers });
  }
}
