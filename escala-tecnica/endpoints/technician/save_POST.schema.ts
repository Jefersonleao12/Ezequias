import { z } from "zod";
import superjson from "superjson";

export const schema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1, "Informe o nome do técnico"),
  phone: z.string().trim().nullable(),
  role: z.string().trim().nullable(),
  teamId: z.number().int().nullable(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = { id: number };

export const postTechnicianSave = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/technician/save`, {
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
