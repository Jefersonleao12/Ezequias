import { z } from "zod";
import superjson from "superjson";
import { ScaleTypeArrayValues, SectorArrayValues } from "../../helpers/schema";

const offSchema = z.object({ day: z.number().int().min(0), kind: z.enum(["regular", "compensatoria"]) });

export const schema = z
  .object({
    id: z.number().int().optional(),
    sector: z.enum(SectorArrayValues),
    scaleType: z.enum(ScaleTypeArrayValues),
    name: z.string().trim().min(1, "Dê um nome à escala"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    cycleWeeks: z.number().int().min(1).max(12),
    daysOff: z.record(z.string(), z.array(offSchema)),
  })
  .refine(
    (v) => {
      const [y, m, d] = v.startDate.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
    },
    { message: "A escala deve começar numa segunda-feira", path: ["startDate"] },
  );

export type InputType = z.infer<typeof schema>;

export type OutputType = { id: number };

export const postPatternSave = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/pattern/save`, {
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
