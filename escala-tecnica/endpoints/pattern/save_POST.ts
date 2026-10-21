import superjson from "superjson";
import { db } from "../../helpers/db";
import { schema, OutputType } from "./save_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const total = input.cycleWeeks * 7;
    // descarta dias fora do ciclo
    const daysOff = Object.fromEntries(
      Object.entries(input.daysOff).map(([team, list]) => [team, list.filter((o) => o.day < total)]),
    );
    const values = {
      sector: input.sector,
      scaleType: input.scaleType,
      name: input.name,
      startDate: input.startDate,
      cycleWeeks: input.cycleWeeks,
      daysOff,
    };
    const clash = await db
      .selectFrom("schedulePatterns")
      .select("id")
      .where("sector", "=", input.sector)
      .where("startDate", "=", input.startDate)
      .where("id", "!=", input.id ?? -1)
      .executeTakeFirst();
    if (clash) {
      return new Response(
        superjson.stringify({ error: "Já existe uma escala deste setor começando nessa data. Escolha outra data ou edite a existente." }),
        { status: 400 },
      );
    }
    if (input.id) {
      const row = await db.updateTable("schedulePatterns").set(values).where("id", "=", input.id).returning("id").executeTakeFirst();
      if (!row) return new Response(superjson.stringify({ error: "Escala não encontrada" }), { status: 404 });
      return new Response(superjson.stringify({ id: row.id } satisfies OutputType));
    }
    const row = await db.insertInto("schedulePatterns").values(values).returning("id").executeTakeFirstOrThrow();
    return new Response(superjson.stringify({ id: row.id } satisfies OutputType));
  } catch (error) {
    return new Response(superjson.stringify({ error: (error as Error).message }), { status: 400 });
  }
}
