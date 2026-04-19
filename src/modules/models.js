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

/** Equal split of 100% across roles (last role absorbs rounding). Used for new plans and migration. */
export function buildEqualDefaultRoleSplitPctByRoleId(roleOptions) {
  const opts = (roleOptions || []).filter((o) => o?.id);
  const n = opts.length;
  if (n === 0) {
    return {};
  }
  const out = {};
  let allocated = 0;
  for (let i = 0; i < n; i += 1) {
    if (i === n - 1) {
      out[opts[i].id] = Number((100 - allocated).toFixed(2));
    } else {
      const v = Number((100 / n).toFixed(2));
      out[opts[i].id] = v;
      allocated += v;
    }
  }
  return out;
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
    /** `story_points` | `person_days` — semantic type of `estimation` when set (import/manual); legacy rows omit. */
    estimationKind: "",
    /** Primary sprint/quarter period to consume Story Points from (sprint mode); optional in quarter mode. */
    targetPeriodId: "",
    /** When resourceGroupingType is by_member: capacity row id to attribute planned demand to (legacy if no per-role map). */
    targetCapacityRowId: "",
    /** When resourceGroupingType is by_member: role option id → capacity row id for split-by-role planning. */
    targetCapacityRowIdByRoleId: {},
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
  useBuffers = false,
  allBuffersPercent = 0,
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
  const roleOptions = createDefaultRoleOptions();

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
    useBuffers: Boolean(useBuffers),
    allBuffersPercent: Number(allBuffersPercent) >= 0 ? Number(allBuffersPercent) : 0,
    jiraBaseUrl: String(jiraBaseUrl || "").trim().replace(/\/+$/, ""),
    estimationFieldName: String(estimationFieldName || "").trim(),
    /** Last-used Jira field semantic type in Import dialog; also default for next open. */
    importEstimationFieldKind: String(estimationType || "story_points") === "person_days" ? "person_days" : "story_points",
    defaultWorkingDays: Number(defaultWorkingDays) >= 0 ? Number(defaultWorkingDays) : 0,
    /** Default Load (%) for capacity rows; Settings applies to all rows on Save. */
    defaultLoadPercent: 100,
    /** By roles: default Split (%) per role id; must sum to 100. Applied when split cell is empty. */
    defaultRoleSplitPctByRoleId: buildEqualDefaultRoleSplitPctByRoleId(roleOptions),
    /** Capacity table UI: Full (all columns) or Compact (hide Days off and Per member). */
    capacityTableViewMode: "full",
    periods: [firstPeriod],
    teamPeriodValues: {
      [firstPeriod.id]: {
        teamEstimationMode: "average",
        teamEstimationPerDay: ""
      }
    },
    backlogEntryMode: "import",
    lastImportJql: "",
    roleOptions,
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
