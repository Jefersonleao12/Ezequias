import superjson from "superjson";
import { db } from "../../helpers/db";
import { schema, OutputType } from "./delete_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    await db.deleteFrom("technicians").where("id", "=", input.id).execute();
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return new Response(superjson.stringify({ error: (error as Error).message }), { status: 400 });
  }
}
