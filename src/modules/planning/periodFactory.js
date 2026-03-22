import { generateId } from "../models.js";

/**
 * Approximate calendar days per quarter (heuristic for sprint count suggestion only).
 */
const QUARTER_DAYS_APPROX = {
  Q1: 90,
  Q2: 91,
  Q3: 92,
  Q4: 92
};

function normalizeQuarter(quarter) {
  return ["Q1", "Q2", "Q3", "Q4"].includes(quarter) ? quarter : "Q1";
}

/**
 * Suggest how many sprints fit in a quarter given sprint length in days.
 * Does not persist; callers may override with user-edited sprintCount.
 */
export function suggestSprintCount(anchorQuarter, anchorYear, sprintDurationDays) {
  const q = normalizeQuarter(anchorQuarter);
  const daysInQuarter = QUARTER_DAYS_APPROX[q] ?? 90;
  const duration = Math.max(1, Number(sprintDurationDays) || 14);
  const raw = Math.floor(daysInQuarter / duration);
  return Math.max(1, Math.min(raw, 52));
}

/**
 * Build metadata for a single quarter period (wrapper: same shape as legacy createPeriod + kind).
 */
export function buildQuarterPeriodRecord({ quarter, year, idFactory = generateId }) {
  const normalizedQuarter = normalizeQuarter(quarter);
  const y = Number(year);
  return {
    id: idFactory("period"),
    quarter: normalizedQuarter,
    year: y,
    label: `${normalizedQuarter} ${y}`,
    kind: "quarter",
    anchorQuarter: normalizedQuarter,
    anchorYear: y,
    sprintIndex: undefined
  };
}

/**
 * Build N sprint periods anchored to one quarter/year. Each has unique id and stable label.
 */
export function buildSprintPeriods({
  anchorQuarter,
  anchorYear,
  sprintCount,
  idFactory = generateId
}) {
  const q = normalizeQuarter(anchorQuarter);
  const y = Number(anchorYear);
  const n = Math.max(1, Math.min(Number(sprintCount) || 1, 52));
  const periods = [];
  for (let i = 1; i <= n; i += 1) {
    periods.push({
      id: idFactory("period"),
      quarter: q,
      year: y,
      label: `S${i} ${q} ${y}`,
      kind: "sprint",
      anchorQuarter: q,
      anchorYear: y,
      sprintIndex: i
    });
  }
  return periods;
}
