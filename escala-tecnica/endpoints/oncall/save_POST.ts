import superjson from "superjson";
import { db } from "../../helpers/db";
import { schema, OutputType } from "./save_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const clash = await db
      .selectFrom("onCallShifts")
      .select("id")
      .where("teamId", "=", input.teamId)
      .where("weekendStart", "=", input.weekendStart)
      .where("id", "!=", input.id ?? -1)
      .executeTakeFirst();
    if (clash) {
      return new Response(superjson.stringify({ error: "Essa dupla já está de plantão nesse fim de semana." }), { status: 400 });
    }
    const values = {
      teamId: input.teamId,
      weekendStart: input.weekendStart,
      compDates: [...new Set(input.compDates)].sort(),
      notes: input.notes || null,
    };
    if (input.id) {
      const row = await db.updateTable("onCallShifts").set(values).where("id", "=", input.id).returning("id").executeTakeFirst();
      if (!row) return new Response(superjson.stringify({ error: "Plantão não encontrado" }), { status: 404 });
      return new Response(superjson.stringify({ id: row.id } satisfies OutputType));
    }
    const row = await db.insertInto("onCallShifts").values(values).returning("id").executeTakeFirstOrThrow();
    return new Response(superjson.stringify({ id: row.id } satisfies OutputType));
  } catch (error) {
    return new Response(superjson.stringify({ error: (error as Error).message }), { status: 400 });
  }
}
