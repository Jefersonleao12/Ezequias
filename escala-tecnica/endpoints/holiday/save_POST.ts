import superjson from "superjson";
import { db } from "../../helpers/db";
import { schema, OutputType } from "./save_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const clash = await db
      .selectFrom("holidays")
      .select("id")
      .where("date", "=", input.date)
      .where("id", "!=", input.id ?? -1)
      .executeTakeFirst();
    if (clash) {
      return new Response(superjson.stringify({ error: "Já existe um feriado nessa data." }), { status: 400 });
    }
    const values = {
      date: input.date,
      name: input.name,
      kind: input.kind,
      dayOff: input.dayOff,
      onCallTeamIds: [...new Set(input.onCallTeamIds)],
      onCallHours: input.onCallHours,
      compDate: input.compDate,
    };
    if (input.id) {
      const row = await db.updateTable("holidays").set(values).where("id", "=", input.id).returning("id").executeTakeFirst();
      if (!row) return new Response(superjson.stringify({ error: "Feriado não encontrado" }), { status: 404 });
      return new Response(superjson.stringify({ id: row.id } satisfies OutputType));
    }
    const row = await db.insertInto("holidays").values(values).returning("id").executeTakeFirstOrThrow();
    return new Response(superjson.stringify({ id: row.id } satisfies OutputType));
  } catch (error) {
    return new Response(superjson.stringify({ error: (error as Error).message }), { status: 400 });
  }
}
