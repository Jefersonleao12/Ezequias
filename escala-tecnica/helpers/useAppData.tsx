import { useQuery } from "@tanstack/react-query";
import { getData } from "../endpoints/data_GET.schema";

export const APP_DATA_QUERY_KEY = ["appData"] as const;

/** Carrega equipes, técnicos, ausências, configurações e escalas de uma vez (volume pequeno). */
export function useAppData() {
  return useQuery({
    queryKey: APP_DATA_QUERY_KEY,
    queryFn: () => getData(),
    placeholderData: (prev) => prev,
  });
}
