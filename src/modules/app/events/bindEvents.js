export function bindEvents({
  refs,
  appState,
  handlers
}) {
  refs.createPlanBtn.addEventListener("click", handlers.handleCreatePlan);
  refs.createPlanOverlayBtn.addEventListener("click", handlers.handleCapacityOverlayAction);
  refs.createPlanForm.addEventListener("submit", handlers.submitCreatePlan);
  refs.createPeriodForm.addEventListener("submit", handlers.submitCreatePeriod);
  refs.planSelect.addEventListener("change", handlers.handlePlanSelect);
  refs.settingsBtn.addEventListener("click", handlers.openSettingsDialog);
  refs.settingsForm.addEventListener("submit", handlers.saveSettings);
  refs.deleteConfirmForm.addEventListener("submit", handlers.submitDeleteConfirm);
  refs.bulkWorkingDaysForm.addEventListener("submit", handlers.submitBulkWorkingDays);
  refs.bulkRowEstimationForm.addEventListener("submit", handlers.submitBulkRowEstimation);
  refs.bulkLoadForm.addEventListener("submit", handlers.submitBulkLoad);

  refs.tabButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      appState.activeTab = button.dataset.tab;
      await handlers.persistAndRender();
    });
  });

  refs.addCapacityRowBtn.addEventListener("click", handlers.handleAddCapacityRow);
  refs.addQuarterBtn.addEventListener("click", handlers.handleAddQuarter);
  refs.openImportModalBtn.addEventListener("click", handlers.openImportDialog);
  refs.importOverlayBtn.addEventListener("click", handlers.handleBacklogOverlayAction);
  refs.importForm.addEventListener("submit", handlers.submitImport);
  refs.importDialog.addEventListener("close", handlers.handleImportDialogClose);
  refs.importJiraBaseUrlInput.addEventListener("input", handlers.syncImportButtonState);
  refs.importJiraBaseUrlInput.addEventListener("blur", handlers.handleImportJiraBaseUrlBlur);
  refs.importJiraBaseUrlInput.addEventListener("change", handlers.handleImportJiraBaseUrlBlur);
  refs.importEstimationFieldModeInputs.forEach((input) => {
    input.addEventListener("change", handlers.handleImportEstimationFieldModeChange);
  });
  refs.importEstimationFieldInput.addEventListener("input", () => {
    refs.importEstimationFieldInput.classList.remove("input-invalid");
    handlers.syncImportButtonState();
  });
  refs.jqlInput.addEventListener("input", () => {
    refs.jqlInput.classList.remove("input-invalid");
    handlers.syncImportButtonState();
  });

  refs.bulkRowEstimationModeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      const selectedMode =
        refs.bulkRowEstimationModeInputs.find((entry) => entry.checked)?.value || "average";
      const manual = selectedMode === "manual";
      refs.bulkRowEstimationManualWrap.style.display = manual ? "flex" : "none";
      refs.bulkRowEstimationInput.disabled = !manual;
      refs.bulkRowEstimationInput.required = manual;
      if (!manual) {
        refs.bulkRowEstimationInput.value = "";
      }
    });
  });

  refs.capacityTable.addEventListener("input", handlers.handleTableInput);
  refs.capacityTable.addEventListener("change", handlers.handleTableInput);
  refs.capacityTable.addEventListener("click", handlers.handleCapacityTableClick);
  refs.backlogTable.addEventListener("input", handlers.handleTableInput);
  refs.backlogTable.addEventListener("change", handlers.handleTableInput);
  if (refs.teamNameInput) {
    refs.teamNameInput.addEventListener("input", handlers.handleTeamNameInput);
  }
}
