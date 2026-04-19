import { createBacklogRow } from "../../models.js";
import { applyDefaultRoleSplitsToBacklogRows } from "../services/backlogRoleSplits.js";

export async function handleManualBacklogEntryModeAction({ getActivePlan, setMessage, touchPlan, persistAndRender }) {
  const plan = getActivePlan();
  if (!plan) {
    setMessage("Create plan first.", "error");
    return;
  }
  plan.backlogEntryMode = "manual";
  if (!plan.backlogRows.length) {
    plan.backlogRows.push(createBacklogRow());
    applyDefaultRoleSplitsToBacklogRows(plan);
  }
  touchPlan(plan);
  await persistAndRender("Manual backlog entry mode enabled.", "success");
}

export function openImportDialogAction({
  refs,
  appState,
  getActivePlan,
  setMessage,
  syncImportButtonState,
  syncImportEstimationFieldUi
}) {
  const plan = getActivePlan();
  if (!plan) {
    setMessage("Create plan first.", "error");
    return false;
  }
  if (typeof syncImportEstimationFieldUi === "function") {
    syncImportEstimationFieldUi();
  }
  refs.importJiraBaseUrlInput.value = String(plan.jiraBaseUrl || appState.jiraBaseUrl || "");
  refs.jqlInput.value = String(plan.lastImportJql || "");
  refs.jqlInput.classList.remove("input-invalid");
  if (refs.importJiraEstimationKindStoryPoints && refs.importJiraEstimationKindPersonDays) {
    const kind =
      plan.importEstimationFieldKind === "person_days" || plan.importEstimationFieldKind === "story_points"
        ? plan.importEstimationFieldKind
        : plan.estimationType === "person_days"
          ? "person_days"
          : "story_points";
    if (kind === "person_days") {
      refs.importJiraEstimationKindPersonDays.checked = true;
      refs.importJiraEstimationKindStoryPoints.checked = false;
    } else {
      refs.importJiraEstimationKindStoryPoints.checked = true;
      refs.importJiraEstimationKindPersonDays.checked = false;
    }
  }
  if (refs.importJiraEstimationFieldInput) {
    refs.importJiraEstimationFieldInput.value = String(plan.estimationFieldName || appState.estimationFieldName || "");
    refs.importJiraEstimationFieldInput.classList.remove("input-invalid");
  }
  refs.issuesCount.textContent = "0";
  refs.importProgress.value = 0;
  syncImportButtonState();
  refs.importDialog.showModal();
  return true;
}
