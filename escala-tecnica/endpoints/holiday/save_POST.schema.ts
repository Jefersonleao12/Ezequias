import { z } from "zod";
import superjson from "superjson";
import { HolidayKindArrayValues } from "../../helpers/schema";

export const schema = z.object({
  id: z.number().int().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  name: z.string().trim().min(1, "Informe o nome do feriado"),
  kind: z.enum(HolidayKindArrayValues),
  dayOff: z.boolean(),
  onCallTeamIds: z.array(z.number().int()).max(20),
  onCallHours: z
    .string()
    .trim()
    .regex(/^(\d{2}:\d{2}-\d{2}:\d{2})(,\s*\d{2}:\d{2}-\d{2}:\d{2})*$/, "Use o formato 08:00-12:00,14:00-18:00"),
  compDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").nullable(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = { id: number };

export const postHolidaySave = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/holiday/save`, {
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
