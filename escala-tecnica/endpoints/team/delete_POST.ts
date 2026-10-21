import superjson from "superjson";
import { db } from "../../helpers/db";
import { schema, OutputType } from "./delete_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    // técnicos ficam sem equipe (ON DELETE SET NULL); folgas da equipe saem das escalas
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("teams").where("id", "=", input.id).execute();
      const patterns = await trx.selectFrom("schedulePatterns").select(["id", "daysOff"]).execute();
      for (const p of patterns) {
        const days = { ...(p.daysOff as Record<string, unknown>) };
        if (String(input.id) in days) {
          delete days[String(input.id)];
          await trx.updateTable("schedulePatterns").set({ daysOff: days as never }).where("id", "=", p.id).execute();
        }
      }
    });
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return new Response(superjson.stringify({ error: (error as Error).message }), { status: 400 });
  }
}
