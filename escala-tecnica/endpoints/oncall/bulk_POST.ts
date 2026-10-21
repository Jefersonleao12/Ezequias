import superjson from "superjson";
import { db } from "../../helpers/db";
import { schema, OutputType } from "./bulk_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const teams = await db.selectFrom("teams").select("id").where("sector", "=", input.sector).execute();
    const teamIds = teams.map((t) => t.id);
    if (input.shifts.some((s) => !teamIds.includes(s.teamId))) {
      return new Response(superjson.stringify({ error: "Equipe não pertence ao setor" }), { status: 400 });
    }
    await db.transaction().execute(async (trx) => {
      if (teamIds.length > 0) {
        await trx
          .deleteFrom("onCallShifts")
          .where("teamId", "in", teamIds)
          .where("weekendStart", ">=", input.fromDate)
          .where("weekendStart", "<=", input.toDate)
          .execute();
      }
      if (input.shifts.length > 0) {
        await trx
          .insertInto("onCallShifts")
          .values(input.shifts.map((s) => ({ teamId: s.teamId, weekendStart: s.weekendStart, compDates: s.compDates })))
          .execute();
      }
    });
    return new Response(superjson.stringify({ created: input.shifts.length } satisfies OutputType));
  } catch (error) {
    return new Response(superjson.stringify({ error: (error as Error).message }), { status: 400 });
  }
}
