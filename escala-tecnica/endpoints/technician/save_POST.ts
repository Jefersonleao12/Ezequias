import superjson from "superjson";
import { db } from "../../helpers/db";
import { schema, OutputType } from "./save_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    if (input.teamId !== null) {
      const members = await db
        .selectFrom("technicians")
        .select("id")
        .where("teamId", "=", input.teamId)
        .where("id", "!=", input.id ?? -1)
        .execute();
      if (members.length >= 2) {
        return new Response(superjson.stringify({ error: "Essa equipe já tem uma dupla completa (2 técnicos)." }), { status: 400 });
      }
    }
    const values = {
      name: input.name,
      phone: input.phone || null,
      role: input.role || null,
      teamId: input.teamId,
    };
    if (input.id) {
      const row = await db.updateTable("technicians").set(values).where("id", "=", input.id).returning("id").executeTakeFirst();
      if (!row) return new Response(superjson.stringify({ error: "Técnico não encontrado" }), { status: 404 });
      return new Response(superjson.stringify({ id: row.id } satisfies OutputType));
    }
    const row = await db.insertInto("technicians").values(values).returning("id").executeTakeFirstOrThrow();
    return new Response(superjson.stringify({ id: row.id } satisfies OutputType));
  } catch (error) {
    return new Response(superjson.stringify({ error: (error as Error).message }), { status: 400 });
  }
}
