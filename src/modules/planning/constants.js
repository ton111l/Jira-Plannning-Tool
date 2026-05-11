/**
 * Planning time granularity: how periods are sliced for capacity/backlog.
 * - quarter: one period per calendar quarter (legacy / default).
 * - sprint: N periods (sprints) anchored inside a quarter; estimation forced to story points at constraint layer.
 */
export const PLANNING_TIME_MODE = {
  quarter: "quarter",
  sprint: "sprint"
};

/** Max Jira search results per import and max backlog rows for the plan (new keys skip when full). */
export const BACKLOG_MAX_ISSUES = 100;

/** Velocity is optional; consumed later when formulas are defined. */
export const VELOCITY_MODE = {
  none: "none",
  per_period: "per_period"
};
