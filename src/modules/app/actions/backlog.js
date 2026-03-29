import { createBacklogRow } from "../../models.js";

export async function handleManualBacklogEntryModeAction({ getActivePlan, setMessage, touchPlan, persistAndRender }) {
  const plan = getActivePlan();
  if (!plan) {
    setMessage("Create plan first.", "error");
    return;
  }
  plan.backlogEntryMode = "manual";
  if (!plan.backlogRows.length) {
    plan.backlogRows.push(createBacklogRow());
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
