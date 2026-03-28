export function applySettingsChanges({
  plan,
  refs,
  regroupCapacityRowsByRole,
  touchPlan
}) {
  if (!plan) {
    return { ok: false };
  }

  plan.estimationType = refs.estimationTypeSelect.value || "story_points";
  plan.resourceGroupingType = refs.resourceGroupingTypeSelect.value || "by_roles";
  if (plan.estimationType === "story_points") {
    const selectedMode = refs.settingsTeamEstimationModeSelect.value === "manual" ? "manual" : "average";
    const rawValue = String(refs.settingsTeamEstimationValueInput.value || "").trim();
    if (selectedMode === "manual") {
      const numericValue = Number(rawValue);
      if (rawValue === "" || !Number.isFinite(numericValue) || numericValue < 0) {
        return { ok: false, error: "Enter Team value or switch to Team average." };
      }
    }
    if (!plan.teamPeriodValues || typeof plan.teamPeriodValues !== "object") {
      plan.teamPeriodValues = {};
    }
    plan.periods.forEach((period) => {
      if (!plan.teamPeriodValues[period.id]) {
        plan.teamPeriodValues[period.id] = { teamEstimationMode: "average", teamEstimationPerDay: "" };
      }
      plan.teamPeriodValues[period.id].teamEstimationMode = selectedMode;
      plan.teamPeriodValues[period.id].teamEstimationPerDay = selectedMode === "manual" ? rawValue : "";
    });
  } else if (plan.teamPeriodValues && typeof plan.teamPeriodValues === "object") {
    plan.periods.forEach((period) => {
      if (!plan.teamPeriodValues[period.id]) {
        plan.teamPeriodValues[period.id] = { teamEstimationMode: "average", teamEstimationPerDay: "" };
      }
      plan.teamPeriodValues[period.id].teamEstimationMode = "average";
      plan.teamPeriodValues[period.id].teamEstimationPerDay = "";
    });
  }

  if (plan.resourceGroupingType === "by_roles") {
    if (regroupCapacityRowsByRole(plan)) {
      touchPlan(plan);
    }
  }
  touchPlan(plan);
  return { ok: true };
}
