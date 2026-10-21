import { z } from "zod";
import superjson from "superjson";
import { SectorArrayValues } from "../../helpers/schema";

const time = z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido");
const ranges = z
  .string()
  .trim()
  .regex(/^(\d{2}:\d{2}-\d{2}:\d{2})(,\s*\d{2}:\d{2}-\d{2}:\d{2})*$/, "Use o formato 08:00-12:00,14:00-18:00");

export const schema = z.object({
  sector: z.enum(SectorArrayValues),
  minCoverage: z.array(z.number().int().min(0).max(50)).length(7),
  maxConsecutive: z.number().int().min(1).max(13),
  hoursSixOne: z.number().min(1).max(12),
  hoursSixOneSaturday: z.number().min(0).max(12),
  hoursFiveTwo: z.number().min(1).max(12),
  shiftStart: time,
  shiftEnd: time,
  onCallTeams: z.number().int().min(0).max(10),
  onCallSaturday: ranges.or(z.literal("")),
  onCallSunday: ranges.or(z.literal("")),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = { ok: true };

export const postSettingsSave = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/settings/save`, {
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
