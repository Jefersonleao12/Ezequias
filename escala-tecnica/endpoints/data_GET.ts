import superjson from "superjson";
import { db } from "../helpers/db";
import type { PatternDays } from "../helpers/scheduleEngine";
import { OutputType } from "./data_GET.schema";

export async function handle(request: Request) {
  try {
    const [teams, technicians, absences, settings, patterns, onCallShifts, holidays] = await Promise.all([
      db.selectFrom("teams").select(["id", "name", "code", "sector", "vehicle", "notes"]).orderBy("sector", "desc").orderBy("code").execute(),
      db.selectFrom("technicians").select(["id", "name", "phone", "role", "teamId"]).orderBy("name").execute(),
      db.selectFrom("absences").select(["id", "technicianId", "startDate", "endDate", "kind", "notes"]).orderBy("startDate").execute(),
      db.selectFrom("sectorSettings").selectAll().execute(),
      db.selectFrom("schedulePatterns").select(["id", "sector", "scaleType", "name", "startDate", "cycleWeeks", "daysOff"]).orderBy("startDate").execute(),
      db.selectFrom("onCallShifts").select(["id", "teamId", "weekendStart", "compDates", "notes"]).orderBy("weekendStart").execute(),
      db.selectFrom("holidays").select(["id", "date", "name", "kind", "dayOff", "onCallTeamIds", "onCallHours", "compDate"]).orderBy("date").execute(),
    ]);
    const output: OutputType = {
      teams,
      technicians,
      absences,
      settings: settings.map((s) => ({
        sector: s.sector,
        minCoverage: (s.minCoverage as number[]).map(Number),
        maxConsecutive: s.maxConsecutive,
        hoursSixOne: Number(s.hoursSixOne),
        hoursSixOneSaturday: Number(s.hoursSixOneSaturday),
        hoursFiveTwo: Number(s.hoursFiveTwo),
        shiftStart: s.shiftStart,
        shiftEnd: s.shiftEnd,
        onCallTeams: s.onCallTeams,
        onCallSaturday: s.onCallSaturday,
        onCallSunday: s.onCallSunday,
      })),
      patterns: patterns.map((p) => ({ ...p, daysOff: p.daysOff as unknown as PatternDays })),
      onCallShifts: onCallShifts.map((s) => ({ ...s, compDates: s.compDates as string[] })),
      holidays: holidays.map((h) => ({ ...h, onCallTeamIds: (h.onCallTeamIds as number[]).map(Number) })),
    };
    return new Response(superjson.stringify(output));
  } catch (error) {
    console.error(error);
    return new Response(superjson.stringify({ error: (error as Error).message }), { status: 500 });
  }
}
