import superjson from "superjson";
import { db } from "../../helpers/db";
import { schema, OutputType } from "./save_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const values = {
      minCoverage: input.minCoverage,
      maxConsecutive: input.maxConsecutive,
      hoursSixOne: input.hoursSixOne,
      hoursSixOneSaturday: input.hoursSixOneSaturday,
      hoursFiveTwo: input.hoursFiveTwo,
      shiftStart: input.shiftStart,
      shiftEnd: input.shiftEnd,
      onCallTeams: input.onCallTeams,
      onCallSaturday: input.onCallSaturday,
      onCallSunday: input.onCallSunday,
    };
    await db
      .insertInto("sectorSettings")
      .values({ sector: input.sector, ...values })
      .onConflict((oc) => oc.column("sector").doUpdateSet(values))
      .execute();
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return new Response(superjson.stringify({ error: (error as Error).message }), { status: 400 });
  }
}
