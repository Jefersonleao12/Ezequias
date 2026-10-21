import { z } from "zod";
import superjson from "superjson";
import { SectorArrayValues } from "../../helpers/schema";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

export const schema = z.object({
  sector: z.enum(SectorArrayValues),
  /** substitui os plantões do setor entre estas datas (sábados) */
  fromDate: isoDate,
  toDate: isoDate,
  shifts: z.array(
    z.object({
      teamId: z.number().int(),
      weekendStart: isoDate,
      compDates: z.array(isoDate).max(5),
    }),
  ),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = { created: number };

export const postOncallBulk = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/oncall/bulk`, {
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
