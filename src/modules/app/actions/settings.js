export function applySettingsChanges({
  plan,
  refs,
  regroupCapacityRowsByRole,
  touchPlan
}) {
  if (!plan) {
    return;
  }

  plan.estimationType = refs.estimationTypeSelect.value || "story_points";
  plan.resourceGroupingType = refs.resourceGroupingTypeSelect.value || "by_roles";

  if (plan.resourceGroupingType === "by_roles") {
    if (regroupCapacityRowsByRole(plan)) {
      touchPlan(plan);
    }
  }
  touchPlan(plan);
}
