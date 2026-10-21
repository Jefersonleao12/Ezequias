import { z } from "zod";
import superjson from "superjson";
import { AbsenceKindArrayValues } from "../../helpers/schema";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

export const schema = z
  .object({
    id: z.number().int().optional(),
    technicianId: z.number().int(),
    startDate: isoDate,
    endDate: isoDate,
    kind: z.enum(AbsenceKindArrayValues),
    notes: z.string().trim().nullable(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "A data final deve ser igual ou posterior à inicial", path: ["endDate"] });

export type InputType = z.infer<typeof schema>;

export type OutputType = { id: number };

export const postAbsenceSave = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/absence/save`, {
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
