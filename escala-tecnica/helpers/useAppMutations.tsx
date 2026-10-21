import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postTeamSave } from "../endpoints/team/save_POST.schema";
import { postTeamDelete } from "../endpoints/team/delete_POST.schema";
import { postTechnicianSave } from "../endpoints/technician/save_POST.schema";
import { postTechnicianDelete } from "../endpoints/technician/delete_POST.schema";
import { postAbsenceSave } from "../endpoints/absence/save_POST.schema";
import { postAbsenceDelete } from "../endpoints/absence/delete_POST.schema";
import { postSettingsSave } from "../endpoints/settings/save_POST.schema";
import { postPatternSave } from "../endpoints/pattern/save_POST.schema";
import { postPatternDelete } from "../endpoints/pattern/delete_POST.schema";
import { postOncallBulk } from "../endpoints/oncall/bulk_POST.schema";
import { postOncallSave } from "../endpoints/oncall/save_POST.schema";
import { postOncallDelete } from "../endpoints/oncall/delete_POST.schema";
import { postHolidaySave } from "../endpoints/holiday/save_POST.schema";
import { postHolidayDelete } from "../endpoints/holiday/delete_POST.schema";
import { postHolidayImport } from "../endpoints/holiday/import_POST.schema";
import { toast } from "./toast";

/** Todas as mutações do app; cada uma recarrega os dados ao concluir. */
export function useAppMutations() {
  const qc = useQueryClient();
  const opts = <T, R>(fn: (input: T) => Promise<R>, success?: string) => ({
    mutationFn: fn,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["appData"] });
      if (success) toast(success);
    },
    onError: (err: Error) => {
      // erros de validação (zod) chegam como JSON com a lista de problemas
      let message = err.message;
      try {
        const issues = JSON.parse(message);
        if (Array.isArray(issues) && issues[0]?.message) message = issues[0].message;
      } catch {
        // mensagem já é texto simples
      }
      toast.error(message);
    },
  });
  return {
    saveTeam: useMutation(opts(postTeamSave, "Equipe salva")),
    deleteTeam: useMutation(opts(postTeamDelete, "Equipe excluída")),
    saveTechnician: useMutation(opts(postTechnicianSave, "Técnico salvo")),
    deleteTechnician: useMutation(opts(postTechnicianDelete, "Técnico excluído")),
    saveAbsence: useMutation(opts(postAbsenceSave, "Ausência registrada")),
    deleteAbsence: useMutation(opts(postAbsenceDelete, "Ausência removida")),
    saveSettings: useMutation(opts(postSettingsSave, "Configurações salvas")),
    savePattern: useMutation(opts(postPatternSave, "Escala salva")),
    deletePattern: useMutation(opts(postPatternDelete, "Escala excluída")),
    bulkOnCall: useMutation(opts(postOncallBulk, "Rodízio de plantão salvo")),
    saveOnCall: useMutation(opts(postOncallSave, "Plantão salvo")),
    deleteOnCall: useMutation(opts(postOncallDelete, "Plantão removido")),
    saveHoliday: useMutation(opts(postHolidaySave, "Feriado salvo")),
    deleteHoliday: useMutation(opts(postHolidayDelete, "Feriado removido")),
    importHolidays: useMutation(opts(postHolidayImport)),
  };
}
