/**
 * Planning time granularity: how periods are sliced for capacity/backlog.
 * - quarter: one period per calendar quarter (legacy / default).
 * - sprint: N periods (sprints) anchored inside a quarter; estimation forced to story points at constraint layer.
 */
export const PLANNING_TIME_MODE = {
  quarter: "quarter",
  sprint: "sprint"
};

/** Velocity is optional; consumed later when formulas are defined. */
export const VELOCITY_MODE = {
  none: "none",
  per_period: "per_period"
};
