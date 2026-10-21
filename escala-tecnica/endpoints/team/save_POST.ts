import superjson from "superjson";
import { db } from "../../helpers/db";
import { schema, OutputType } from "./save_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const values = {
      name: input.name,
      code: input.code.toUpperCase(),
      sector: input.sector,
      vehicle: input.vehicle || null,
      notes: input.notes || null,
    };
    if (input.id) {
      const row = await db.updateTable("teams").set(values).where("id", "=", input.id).returning("id").executeTakeFirst();
      if (!row) return new Response(superjson.stringify({ error: "Equipe não encontrada" }), { status: 404 });
      return new Response(superjson.stringify({ id: row.id } satisfies OutputType));
    }
    const row = await db.insertInto("teams").values(values).returning("id").executeTakeFirstOrThrow();
    return new Response(superjson.stringify({ id: row.id } satisfies OutputType));
  } catch (error) {
    return new Response(superjson.stringify({ error: (error as Error).message }), { status: 400 });
  }
}
