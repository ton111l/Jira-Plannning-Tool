import { distributeDefaultRoleSplitFromFirst, refreshDefaultRoleSplitTotal } from "../render/ui.js";

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
  if (refs.planExportBtn) {
    refs.planExportBtn.addEventListener("click", handlers.togglePlanExportMenu);
  }
  if (refs.planExportJsonBtn) {
    refs.planExportJsonBtn.addEventListener("click", handlers.handlePlanExportJson);
  }
  if (refs.planExportXlsxBtn) {
    refs.planExportXlsxBtn.addEventListener("click", handlers.handlePlanExportXlsx);
  }
  document.addEventListener("click", handlers.handlePlanExportMenuClick);
  refs.settingsBtn.addEventListener("click", handlers.openSettingsDialog);
  refs.settingsForm.addEventListener("submit", handlers.saveSettings);
  if (refs.settingsAddRoleBtn) {
    refs.settingsAddRoleBtn.addEventListener("click", handlers.handleSettingsAddRoleRow);
  }
  if (refs.settingsRolesList) {
    refs.settingsRolesList.addEventListener("click", handlers.handleSettingsRolesListClick);
  }
  if (refs.settingsDefaultRoleSplitList) {
    refs.settingsDefaultRoleSplitList.addEventListener("input", (event) => {
      const inputs = refs.settingsDefaultRoleSplitList.querySelectorAll(".settings-default-role-split-input");
      if (inputs.length && event.target === inputs[0]) {
        distributeDefaultRoleSplitFromFirst(refs);
      }
      refreshDefaultRoleSplitTotal(refs);
    });
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
  if (refs.capacityQuickFilter) {
    refs.capacityQuickFilter.addEventListener("input", handlers.applyCapacityQuickFilter);
  }
  refs.addQuarterBtn.addEventListener("click", handlers.handleAddQuarter);
  refs.openImportModalBtn.addEventListener("click", handlers.openImportDialog);
  if (refs.backlogDensitySelect) {
    refs.backlogDensitySelect.addEventListener("change", handlers.handleBacklogDensityChange);
  }
  if (refs.backlogBulkPeriodSelect) {
    refs.backlogBulkPeriodSelect.addEventListener("change", handlers.handleBacklogApplyPeriodToSelected);
  }
  if (refs.backlogQuickFilter) {
    refs.backlogQuickFilter.addEventListener("input", handlers.applyBacklogQuickFilter);
  }
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
  if (refs.importJiraEstimationKindStoryPoints && refs.importJiraEstimationKindPersonDays) {
    const onImportEstimationKindChange = () => {
      handlers.syncImportEstimationFieldUi?.();
      handlers.syncImportButtonState?.();
    };
    refs.importJiraEstimationKindStoryPoints.addEventListener("change", onImportEstimationKindChange);
    refs.importJiraEstimationKindPersonDays.addEventListener("change", onImportEstimationKindChange);
  }
  refs.estimationTypeSelect.addEventListener("change", handlers.handleSettingsEstimationTypeChange);
  if (refs.settingsUseSprintsCheckbox) {
    refs.settingsUseSprintsCheckbox.addEventListener("change", handlers.handleSettingsUseSprintsChange);
  }
  if (refs.settingsUseBuffersCheckbox) {
    refs.settingsUseBuffersCheckbox.addEventListener("change", handlers.handleSettingsUseBuffersChange);
  }
  if (refs.settingsSprintSettingsBtn) {
    refs.settingsSprintSettingsBtn.addEventListener("click", handlers.openSprintSettingsDialog);
  }
  if (refs.settingsBufferSettingsBtn) {
    refs.settingsBufferSettingsBtn.addEventListener("click", handlers.openBufferSettingsDialog);
  }
  if (refs.renamePlanBtn) {
    refs.renamePlanBtn.addEventListener("click", handlers.openRenamePlanDialog);
  }
  if (refs.renamePlanForm) {
    refs.renamePlanForm.addEventListener("submit", handlers.submitRenamePlan);
  }
  if (refs.deletePlanBtn) {
    refs.deletePlanBtn.addEventListener("click", handlers.handleDeletePlan);
  }
  if (refs.deletePlanForm) {
    refs.deletePlanForm.addEventListener("submit", handlers.submitDeletePlan);
  }
  if (refs.resourceGroupingTypeSelect) {
    refs.resourceGroupingTypeSelect.addEventListener("change", handlers.handleSettingsResourceGroupingChange);
  }
  refs.createPlanEstimationTypeSelect.addEventListener("change", handlers.handleCreatePlanEstimationTypeChange);
  refs.createPlanTeamEstimationModeSelect.addEventListener("change", handlers.handleCreatePlanEstimationTypeChange);
  refs.createPlanUseSprintsCheckbox.addEventListener("change", handlers.handleCreatePlanUseSprintsChange);
  refs.createPlanUseBuffersCheckbox.addEventListener("change", handlers.handleCreatePlanUseBuffersChange);
  refs.createPlanSprintSettingsBtn.addEventListener("click", handlers.openSprintSettingsDialog);
  refs.createPlanBufferSettingsBtn.addEventListener("click", handlers.openBufferSettingsDialog);
  refs.addSprintRowBtn.addEventListener("click", handlers.handleAddSprintRow);
  refs.sprintSettingsForm.addEventListener("submit", handlers.submitSprintSettings);
  refs.addBufferRowBtn.addEventListener("click", handlers.handleAddBufferRow);
  refs.bufferSettingsForm.addEventListener("submit", handlers.submitBufferSettings);
  refs.bufferSettingsTbody.addEventListener("input", handlers.handleBufferSettingsInput);
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
  refs.capacityTable.addEventListener("change", handlers.handleCapacitySelectionChange);
  refs.capacityTable.addEventListener("focusin", handlers.handleCapacityFieldFocusin);
  refs.capacityTable.addEventListener("keydown", handlers.handleDeferredNumericInputKeydown);
  refs.capacityTable.addEventListener("click", handlers.handleCapacityTableClick);
  refs.backlogTable.addEventListener("input", handlers.handleTableInput);
  refs.backlogTable.addEventListener("change", handlers.handleTableInput);
  refs.backlogTable.addEventListener("keydown", handlers.handleDeferredNumericInputKeydown);
  refs.backlogTable.addEventListener("change", handlers.handleBacklogSelectionChange);
  if (refs.capacityDeleteSelectedBtn) {
    refs.capacityDeleteSelectedBtn.addEventListener("click", handlers.handleDeleteSelectedCapacityRows);
  }
  if (refs.backlogDeleteSelectedBtn) {
    refs.backlogDeleteSelectedBtn.addEventListener("click", handlers.handleDeleteSelectedBacklogRows);
  }
  if (refs.teamNameInput) {
    refs.teamNameInput.addEventListener("input", handlers.handleTeamNameInput);
  }
}
