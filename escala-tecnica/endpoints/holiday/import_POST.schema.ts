import { z } from "zod";
import superjson from "superjson";

export const schema = z.object({ year: z.number().int().min(2000).max(2100) });

export type InputType = z.infer<typeof schema>;

export type OutputType = { created: number };

export const postHolidayImport = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/holiday/import`, {
    method: "POST",
    body: superjson.stringify(validatedInput),
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
