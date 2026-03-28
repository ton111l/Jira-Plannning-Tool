import { PLANNING_TIME_MODE, VELOCITY_MODE } from "./constants.js";

/**
 * Effective estimation type for calculations: sprint-mode plans are story-points only.
 */
export function getEffectiveEstimationType(plan) {
  if (!plan || typeof plan !== "object") {
    return "story_points";
  }
  const mode = plan.planningTimeMode || PLANNING_TIME_MODE.quarter;
  if (mode === PLANNING_TIME_MODE.sprint) {
    return "story_points";
  }
  return plan.estimationType || "story_points";
}

/**
 * Whether Man-days estimation is allowed for this plan.
 */
export function isPersonDaysAllowed(plan) {
  const mode = plan?.planningTimeMode || PLANNING_TIME_MODE.quarter;
  return mode === PLANNING_TIME_MODE.quarter;
}

/**
 * Validate plan structural invariants (no UI).
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function assertPlanInvariants(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object") {
    return { ok: false, errors: ["Plan is missing."] };
  }

  const mode = plan.planningTimeMode || PLANNING_TIME_MODE.quarter;

  if (mode === PLANNING_TIME_MODE.sprint && plan.estimationType === "person_days") {
    errors.push("Sprint planning mode requires Story Points estimation.");
  }

  if (!Array.isArray(plan.periods) || plan.periods.length === 0) {
    errors.push("Plan must have at least one period.");
  }

  for (const period of plan.periods || []) {
    if (!period?.id) {
      errors.push("Every period must have an id.");
      break;
    }
    if (!period.kind) {
      errors.push(`Period ${period.id} is missing kind.`);
    }
  }

  if (mode === PLANNING_TIME_MODE.sprint) {
    for (const period of plan.periods || []) {
      if (period.kind !== "sprint") {
        errors.push(`Sprint mode plan contains non-sprint period: ${period.id}.`);
      }
    }
  }

  const periodIds = new Set((plan.periods || []).map((p) => p.id));
  for (const row of plan.backlogRows || []) {
    const target = row?.targetPeriodId;
    if (target && String(target).trim() && !periodIds.has(String(target))) {
      errors.push(`Backlog row references unknown targetPeriodId: ${target}.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Placeholder for future mode transitions (quarter ↔ sprint). Safe no-op for now.
 * When implemented: remap period ids, capacity periodValues, teamPeriodValues, backlog targetPeriodId.
 */
export function normalizePlanForMode(plan) {
  if (!plan || typeof plan !== "object") {
    return;
  }
  if (plan.planningTimeMode === PLANNING_TIME_MODE.sprint && plan.estimationType === "person_days") {
    plan.estimationType = "story_points";
  }
}

/**
 * Default velocity container for new plans.
 */
export function createDefaultVelocity() {
  return {
    mode: VELOCITY_MODE.none,
    perPeriod: {}
  };
}
