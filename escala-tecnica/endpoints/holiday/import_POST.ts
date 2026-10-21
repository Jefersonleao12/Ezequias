import superjson from "superjson";
import { db } from "../../helpers/db";
import { scheduleEngine } from "../../helpers/scheduleEngine";
import { schema, OutputType } from "./import_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const list = scheduleEngine.brazilNationalHolidays(input.year);
    // não sobrescreve feriados já cadastrados na mesma data
    const rows = await db
      .insertInto("holidays")
      .values(list.map((h) => ({ date: h.date, name: h.name, kind: h.kind, dayOff: h.dayOff, onCallTeamIds: [] })))
      .onConflict((oc) => oc.column("date").doNothing())
      .returning("id")
      .execute();
    return new Response(superjson.stringify({ created: rows.length } satisfies OutputType));
  } catch (error) {
    return new Response(superjson.stringify({ error: (error as Error).message }), { status: 400 });
  }
}
