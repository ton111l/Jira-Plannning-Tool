export const APP_STATE_VERSION = 1;
export const DEFAULT_TAB = "capacity";
export const BACKLOG_REQUIRED_FIELDS = ["key", "summary", "status", "issueType", "priority", "estimation"];

export function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function createPeriod(quarter = "Q1", year = new Date().getFullYear()) {
  const normalizedQuarter = ["Q1", "Q2", "Q3", "Q4"].includes(quarter) ? quarter : "Q1";
  return {
    id: generateId("period"),
    quarter: normalizedQuarter,
    year: Number(year),
    label: `${normalizedQuarter} ${year}`
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

export function createCapacityRow(periods = []) {
  const periodValues = {};
  for (const period of periods) {
    periodValues[period.id] = createEmptyCapacityPeriodValues();
  }

  return {
    id: generateId("capacity_row"),
    memberName: "",
    role: "",
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
  estimationFieldName = ""
}) {
  const firstPeriod = createPeriod(quarter, year);
  const nowIso = new Date().toISOString();

  return {
    id: generateId("plan"),
    name: String(name || "").trim(),
    estimationType: String(estimationType || "story_points"),
    resourceGroupingType: String(resourceGroupingType || "by_roles"),
    jiraBaseUrl: String(jiraBaseUrl || "").trim().replace(/\/+$/, ""),
    estimationFieldName: String(estimationFieldName || "").trim(),
    periods: [firstPeriod],
    teamPeriodValues: {
      [firstPeriod.id]: {
        teamEstimationMode: "average",
        teamEstimationPerDay: ""
      }
    },
    backlogEntryMode: "import",
    lastImportJql: "",
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
