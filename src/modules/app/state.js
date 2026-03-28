import { sanitizeNonNegative } from "../calculations.js";
import { getRoleOrderIndex } from "./roleCatalog.js";

export function getActivePlan(appState) {
  if (!appState.plans.length) {
    return null;
  }
  const selectedId = appState.lastSelectedPlanId || appState.plans[0].id;
  return appState.plans.find((plan) => plan.id === selectedId) || appState.plans[0];
}

export function touchPlan(plan) {
  plan.updatedAt = new Date().toISOString();
}

export function ensureTeamPeriodValues(plan) {
  if (!plan || typeof plan !== "object") {
    return;
  }
  if (!plan.teamPeriodValues || typeof plan.teamPeriodValues !== "object") {
    plan.teamPeriodValues = {};
  }
  plan.periods.forEach((period) => {
    if (!plan.teamPeriodValues[period.id]) {
      plan.teamPeriodValues[period.id] = { teamEstimationMode: "average", teamEstimationPerDay: "" };
      return;
    }
    if (!plan.teamPeriodValues[period.id].teamEstimationMode) {
      plan.teamPeriodValues[period.id].teamEstimationMode = "average";
    }
    if (plan.teamPeriodValues[period.id].teamEstimationPerDay === undefined) {
      plan.teamPeriodValues[period.id].teamEstimationPerDay = "";
    }
  });
}

export function getEstimationUnitLabel(estimationType, legacyEstimationColumnTitle, estimationTypeLabels) {
  if (estimationTypeLabels[estimationType]) {
    return estimationTypeLabels[estimationType];
  }
  const legacy = String(legacyEstimationColumnTitle || "").trim();
  if (!legacy || legacy.toLowerCase() === "estimation") {
    return estimationTypeLabels.story_points;
  }
  return legacy;
}

export function sanitizeOptionalNonNegative(value) {
  if (value === "" || value === null || value === undefined) {
    return "";
  }
  return sanitizeNonNegative(value);
}

export function regroupCapacityRowsByRole(plan, resourceGroupingType) {
  if (!plan || resourceGroupingType !== "by_roles" || !Array.isArray(plan.capacityRows)) {
    return false;
  }

  const withIndex = plan.capacityRows.map((row, index) => ({ row, index }));
  const sorted = [...withIndex].sort(
    (a, b) => getRoleOrderIndex(plan, a.row) - getRoleOrderIndex(plan, b.row) || a.index - b.index
  );
  const hasChanges = sorted.some((entry, index) => entry.row.id !== plan.capacityRows[index]?.id);
  if (!hasChanges) {
    return false;
  }
  plan.capacityRows = sorted.map((entry) => entry.row);
  return true;
}
