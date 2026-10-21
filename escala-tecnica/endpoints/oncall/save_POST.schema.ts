import { z } from "zod";
import superjson from "superjson";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

export const schema = z
  .object({
    id: z.number().int().optional(),
    teamId: z.number().int(),
    weekendStart: isoDate,
    compDates: z.array(isoDate).max(5),
    notes: z.string().trim().nullable(),
  })
  .refine(
    (v) => {
      const [y, m, d] = v.weekendStart.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 6;
    },
    { message: "O plantão começa num sábado", path: ["weekendStart"] },
  );

export type InputType = z.infer<typeof schema>;

export type OutputType = { id: number };

export const postOncallSave = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/oncall/save`, {
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
