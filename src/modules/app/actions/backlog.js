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

export function openImportDialogAction({ refs, appState, getActivePlan, setMessage, syncImportButtonState }) {
  const plan = getActivePlan();
  if (!plan) {
    setMessage("Create plan first.", "error");
    return false;
  }
  refs.importJiraBaseUrlInput.value = String(plan.jiraBaseUrl || appState.jiraBaseUrl || "");
  refs.jqlInput.value = String(plan.lastImportJql || "");
  const estimationFieldName = String(plan.estimationFieldName || appState.estimationFieldName || "").trim();
  const settingsStoryPoints = String(plan.estimationType || appState.estimationType || "story_points") === "story_points";
  const isSystemField = !settingsStoryPoints;
  const normalizedCustomFieldValue = settingsStoryPoints
    ? estimationFieldName
    : "";
  refs.importEstimationFieldModeInputs.forEach((input) => {
    input.checked = input.value === (isSystemField ? "system" : "custom");
  });
  refs.importEstimationFieldInput.value = normalizedCustomFieldValue;
  refs.jqlInput.classList.remove("input-invalid");
  refs.importEstimationFieldInput.classList.remove("input-invalid");
  refs.issuesCount.textContent = "0";
  refs.importProgress.value = 0;
  syncImportButtonState();
  refs.importDialog.showModal();
  return true;
}
