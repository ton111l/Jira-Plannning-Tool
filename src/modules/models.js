import { createDefaultVelocity } from "./planning/planConstraints.js";
import { PLANNING_TIME_MODE } from "./planning/constants.js";

export const APP_STATE_VERSION = 1;
export const DEFAULT_TAB = "capacity";
export const BACKLOG_REQUIRED_FIELDS = ["key", "summary", "status", "issueType", "priority", "estimation"];

export function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function createPeriod(quarter = "Q1", year = new Date().getFullYear(), meta = {}) {
  const normalizedQuarter = ["Q1", "Q2", "Q3", "Q4"].includes(quarter) ? quarter : "Q1";
  const y = Number(year);
  const kind = meta.kind || "quarter";
  return {
    id: generateId("period"),
    quarter: normalizedQuarter,
    year: y,
    label: meta.label ?? `${normalizedQuarter} ${y}`,
    kind,
    anchorQuarter: meta.anchorQuarter ?? normalizedQuarter,
    anchorYear: meta.anchorYear ?? y,
    sprintIndex: meta.sprintIndex
  };
}

export function createEmptyCapacityPeriodValues() {
  return {
    daysOff: 0,
    workingDays: 0,
    availableCapacity: 0,
    rowEstimationPerDay: "",
    plannedEstimation: "",
    availableBalance: 0
  };
}

export function createDefaultRoleOptions() {
  return ["Developer", "Analyst", "QA"].map((label) => ({
    id: generateId("role_opt"),
    label
  }));
}

export function createCapacityRow(periods = []) {
  const periodValues = {};
  for (const period of periods) {
    periodValues[period.id] = createEmptyCapacityPeriodValues();
  }

  return {
    id: generateId("capacity_row"),
    memberName: "",
    roleId: "",
    loadPercent: 100,
    periodValues
  };
}

export function createBacklogRow(overrides = {}) {
  return {
    id: generateId("backlog_row"),
    key: "",
    summary: "",
    status: "",
    issueType: "",
    priority: "",
    estimation: "",
    /** Primary sprint/quarter period to consume Story Points from (sprint mode); optional in quarter mode. */
    targetPeriodId: "",
    source: "manual",
    ...overrides
  };
}

export function createPlan({
  name,
  quarter,
  year,
  estimationType = "story_points",
  resourceGroupingType = "by_team",
  jiraBaseUrl = "",
  estimationFieldName = "",
  defaultWorkingDays = 0,
  planningTimeMode = PLANNING_TIME_MODE.quarter,
  sprintDurationDays = 14,
  sprintCount = 1
}) {
  const firstPeriod = createPeriod(quarter, year);
  const nowIso = new Date().toISOString();
  const anchorQ = firstPeriod.anchorQuarter || firstPeriod.quarter;
  const anchorY = firstPeriod.anchorYear ?? firstPeriod.year;

  return {
    id: generateId("plan"),
    name: String(name || "").trim(),
    /** quarter | sprint — sprint slices the anchor quarter into N periods; constraints layer forces Story Points. */
    planningTimeMode: String(planningTimeMode || PLANNING_TIME_MODE.quarter),
    anchorQuarter: anchorQ,
    anchorYear: anchorY,
    /** Hint for suggestSprintCount; user-editable when UI exists. */
    sprintDurationDays: Math.max(1, Number(sprintDurationDays) || 14),
    /** Number of sprint periods when planningTimeMode is sprint; stored for future use. */
    sprintCount: Math.max(1, Math.min(Number(sprintCount) || 1, 52)),
    velocity: createDefaultVelocity(),
    estimationType: String(estimationType || "story_points"),
    resourceGroupingType: String(resourceGroupingType || "by_roles"),
    jiraBaseUrl: String(jiraBaseUrl || "").trim().replace(/\/+$/, ""),
    estimationFieldName: String(estimationFieldName || "").trim(),
    defaultWorkingDays: Number(defaultWorkingDays) >= 0 ? Number(defaultWorkingDays) : 0,
    /** Default Load (%) for capacity rows; Settings applies to all rows on Save. */
    defaultLoadPercent: 100,
    periods: [firstPeriod],
    teamPeriodValues: {
      [firstPeriod.id]: {
        teamEstimationMode: "average",
        teamEstimationPerDay: ""
      }
    },
    backlogEntryMode: "import",
    lastImportJql: "",
    roleOptions: createDefaultRoleOptions(),
    capacityRows: [createCapacityRow([firstPeriod])],
    backlogRows: [],
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

export function createDefaultState() {
  return {
    version: APP_STATE_VERSION,
    plans: [],
    lastSelectedPlanId: null,
    activeTab: DEFAULT_TAB,
    jiraBaseUrl: "",
    estimationFieldName: "",
    estimationType: "story_points",
    resourceGroupingType: "by_team",
    estimationColumnTitle: "Estimation"
  };
}
