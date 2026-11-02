import type { Period } from "./types";

/**
 * Which summaries the nightly job must (re)generate. Pure function, unit-tested.
 *
 * Periods are UTC calendar periods (same keys as the UI). The job runs just after midnight UTC:
 * - the day that just ended always gets its report;
 * - if that day closed a month, the month gets its final report; if it closed a year, the year too;
 * - catch-up: any recently completed day (last 7), the last completed month and the last completed
 *   year whose report is missing or provisional (generated before the period ended) are redone,
 *   so a failed night (quota, outage) is repaired by the next run.
 * The result is ordered by priority and capped, to stay within the LLM free quota.
 */
export interface Target {
  period: Period;
  key: string;
  reason: string;
}

export interface ExistingReport {
  id: string; // `${period}:${key}`
  createdAt: string; // ISO
}

const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** First instant after the period (UTC), i.e. when its report can be final. */
export function periodEnd(period: Period, key: string): number {
  if (period === "day") return Date.parse(`${key}T00:00:00Z`) + DAY;
  if (period === "month") {
    const [y, m] = key.split("-").map(Number);
    return Date.UTC(y, m, 1);
  }
  return Date.UTC(Number(key) + 1, 0, 1);
}

export function isFinal(period: Period, key: string, existing: Map<string, string>): boolean {
  const created = existing.get(`${period}:${key}`);
  return !!created && Date.parse(created) >= periodEnd(period, key);
}

export const MAX_GENERATIONS_PER_RUN = 4;
const CATCH_UP_DAYS = 7;

export function planReports(now: Date, reports: ExistingReport[], max = MAX_GENERATIONS_PER_RUN): Target[] {
  const existing = new Map(reports.map((r) => [r.id, r.createdAt]));
  const today = Date.parse(`${isoDay(now.getTime())}T00:00:00Z`);
  const yesterday = isoDay(today - DAY);
  const yMonth = yesterday.slice(0, 7);
  const yYear = yesterday.slice(0, 4);
  const monthJustEnded = isoDay(today).slice(0, 7) !== yMonth;
  const yearJustEnded = isoDay(today).slice(0, 4) !== yYear;

  const candidates: Target[] = [{ period: "day", key: yesterday, reason: "fin de journée" }];
  if (monthJustEnded) candidates.push({ period: "month", key: yMonth, reason: "fin de mois" });
  if (yearJustEnded) candidates.push({ period: "year", key: yYear, reason: "fin d'année" });

  // Catch-up of completed periods.
  for (let i = 2; i <= CATCH_UP_DAYS; i++) candidates.push({ period: "day", key: isoDay(today - i * DAY), reason: "rattrapage" });
  const lastMonth = monthJustEnded ? yMonth : isoDay(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).slice(0, 7);
  candidates.push({ period: "month", key: lastMonth, reason: "rattrapage" });
  const lastYear = yearJustEnded ? yYear : String(now.getUTCFullYear() - 1);
  candidates.push({ period: "year", key: lastYear, reason: "rattrapage" });

  const seen = new Set<string>();
  return candidates
    .filter((t) => {
      const id = `${t.period}:${t.key}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return !isFinal(t.period, t.key, existing);
    })
    .slice(0, max);
}
