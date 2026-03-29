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
  if (refs.settingsAddRoleBtn) {
    refs.settingsAddRoleBtn.addEventListener("click", handlers.handleSettingsAddRoleRow);
  }
  if (refs.settingsRolesList) {
    refs.settingsRolesList.addEventListener("click", handlers.handleSettingsRolesListClick);
  }
  refs.deleteConfirmForm.addEventListener("submit", handlers.submitDeleteConfirm);
  refs.addRoleForm.addEventListener("submit", handlers.submitAddRole);
  refs.addRoleCancelBtn.addEventListener("click", () => refs.addRoleDialog.close());
  refs.addRoleNameInput.addEventListener("input", () => {
    refs.addRoleNameInput.classList.remove("input-invalid");
  });
  refs.addRoleDialog.addEventListener("close", handlers.handleAddRoleDialogClose);
  refs.bulkRowEstimationForm.addEventListener("submit", handlers.submitBulkRowEstimation);

  refs.tabButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      appState.activeTab = button.dataset.tab;
      await handlers.persistAndRender();
    });
  });

  refs.addCapacityRowBtn.addEventListener("click", handlers.handleAddCapacityRow);
  if (refs.capacityTableViewModeSelect) {
    refs.capacityTableViewModeSelect.addEventListener("change", handlers.handleCapacityTableViewModeChange);
  }
  refs.addQuarterBtn.addEventListener("click", handlers.handleAddQuarter);
  refs.openImportModalBtn.addEventListener("click", handlers.openImportDialog);
  refs.importOverlayBtn.addEventListener("click", handlers.handleBacklogOverlayAction);
  refs.importForm.addEventListener("submit", handlers.submitImport);
  refs.importDialog.addEventListener("close", handlers.handleImportDialogClose);
  refs.importJiraBaseUrlInput.addEventListener("input", handlers.syncImportButtonState);
  refs.importJiraBaseUrlInput.addEventListener("blur", handlers.handleImportJiraBaseUrlBlur);
  refs.importJiraBaseUrlInput.addEventListener("change", handlers.handleImportJiraBaseUrlBlur);
  refs.jqlInput.addEventListener("input", () => {
    refs.jqlInput.classList.remove("input-invalid");
    handlers.syncImportButtonState();
  });
  if (refs.importJiraEstimationFieldInput) {
    refs.importJiraEstimationFieldInput.addEventListener("input", () => {
      refs.importJiraEstimationFieldInput.classList.remove("input-invalid");
      handlers.syncImportButtonState();
    });
  }
  refs.estimationTypeSelect.addEventListener("change", handlers.handleSettingsEstimationTypeChange);
  refs.createPlanEstimationTypeSelect.addEventListener("change", handlers.handleCreatePlanEstimationTypeChange);
  refs.createPlanTeamEstimationModeSelect.addEventListener("change", handlers.handleCreatePlanEstimationTypeChange);
  refs.createPlanUseSprintsCheckbox.addEventListener("change", handlers.handleCreatePlanUseSprintsChange);
  refs.createPlanSprintSettingsBtn.addEventListener("click", handlers.openSprintSettingsDialog);
  refs.addSprintRowBtn.addEventListener("click", handlers.handleAddSprintRow);
  refs.sprintSettingsForm.addEventListener("submit", handlers.submitSprintSettings);
  if (refs.settingsTeamEstimationModeSelect) {
    refs.settingsTeamEstimationModeSelect.addEventListener("change", handlers.handleSettingsEstimationTypeChange);
  }

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
  refs.backlogTable.addEventListener("change", handlers.handleBacklogSelectionChange);
  if (refs.backlogDeleteSelectedBtn) {
    refs.backlogDeleteSelectedBtn.addEventListener("click", handlers.handleDeleteSelectedBacklogRows);
  }
  if (refs.teamNameInput) {
    refs.teamNameInput.addEventListener("input", handlers.handleTeamNameInput);
  }
}
