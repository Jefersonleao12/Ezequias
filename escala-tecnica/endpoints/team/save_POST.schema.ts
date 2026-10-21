import { z } from "zod";
import superjson from "superjson";
import { SectorArrayValues } from "../../helpers/schema";

export const schema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1, "Informe o nome da equipe"),
  code: z.string().trim().min(1, "Informe o código").max(8),
  sector: z.enum(SectorArrayValues),
  vehicle: z.string().trim().nullable(),
  notes: z.string().trim().nullable(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = { id: number };

export const postTeamSave = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/team/save`, {
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
