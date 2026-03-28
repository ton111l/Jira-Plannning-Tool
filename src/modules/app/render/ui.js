export function renderTabs({ refs, appState }) {
  refs.tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === appState.activeTab;
    button.classList.toggle("tab-active", isActive);
  });
  const isCapacityTab = appState.activeTab === "capacity";
  refs.capacityWrapper.style.display = isCapacityTab ? "block" : "none";
  refs.capacityPanel.classList.toggle("panel-active", isCapacityTab);
  refs.backlogPanel.classList.toggle("panel-active", !isCapacityTab);
  refs.addCapacityRowBtn.style.display = isCapacityTab ? "inline-flex" : "none";
}

export function renderPlanSelect({ refs, appState, activePlan }) {
  refs.planSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select Plan";
  refs.planSelect.appendChild(placeholder);

  for (const plan of appState.plans) {
    const option = document.createElement("option");
    option.value = plan.id;
    option.textContent = plan.name;
    if (activePlan && plan.id === activePlan.id) {
      option.selected = true;
    }
    refs.planSelect.appendChild(option);
  }
}

export function renderTeamName({ refs, plan }) {
  if (!refs.teamNameInput) {
    return;
  }
  refs.teamNameInput.value = plan?.teamName || "";
  refs.teamNameInput.disabled = !plan;
}

export function renderSettings({ refs, plan, appState }) {
  const estimationType = plan?.estimationType || appState.estimationType || "story_points";
  refs.estimationTypeSelect.value = estimationType;
  const firstPeriodId = plan?.periods?.[0]?.id || "";
  const periodTeamSettings = firstPeriodId ? plan?.teamPeriodValues?.[firstPeriodId] : null;
  const teamMode = periodTeamSettings?.teamEstimationMode || "average";
  const teamValue = periodTeamSettings?.teamEstimationPerDay ?? "";
  refs.settingsTeamEstimationWrap.style.display = estimationType === "story_points" ? "flex" : "none";
  refs.settingsTeamEstimationModeSelect.value = teamMode;
  refs.settingsTeamEstimationValueWrap.style.display =
    estimationType === "story_points" && teamMode === "manual" ? "flex" : "none";
  refs.settingsTeamEstimationValueInput.value = String(teamValue);
  refs.settingsWorkingDaysInput.value = String(plan?.defaultWorkingDays ?? 0);
  refs.resourceGroupingTypeSelect.value = plan?.resourceGroupingType || appState.resourceGroupingType || "by_roles";
}

export function renderCapacityOverlay({ refs, plan }) {
  const hasPlan = Boolean(plan);
  const hasPeriods = Boolean(plan?.periods?.length);
  const showOverlay = !hasPlan || !hasPeriods;

  refs.capacityOverlay.classList.toggle("active", showOverlay);
  refs.capacityTableWrap.classList.toggle("table-wrap-blur", showOverlay);
  refs.addCapacityRowBtn.disabled = !hasPlan || !hasPeriods;
  refs.addQuarterBtn.disabled = !hasPlan || !hasPeriods;

  if (!hasPlan) {
    refs.createPlanOverlayBtn.textContent = "Create Plan";
    refs.createPlanOverlayBtn.title = "Create Plan";
    refs.createPlanOverlayBtn.dataset.action = "create-plan";
    return;
  }

  if (!hasPeriods) {
    refs.createPlanOverlayBtn.textContent = "Create period";
    refs.createPlanOverlayBtn.title = "Create period";
    refs.createPlanOverlayBtn.dataset.action = "create-period";
    return;
  }

  refs.createPlanOverlayBtn.textContent = "Create Plan";
  refs.createPlanOverlayBtn.title = "Create Plan";
  refs.createPlanOverlayBtn.dataset.action = "create-plan";
}

export function renderBacklogOverlay({ refs, plan }) {
  const hasPlan = Boolean(plan);
  const hasBacklogRows = Boolean(plan?.backlogRows?.length);
  const showOverlay = !hasPlan || !hasBacklogRows;
  refs.backlogOverlay.classList.toggle("active", showOverlay);
  refs.backlogTableWrap.classList.toggle("table-wrap-blur", showOverlay);
  refs.openImportModalBtn.style.display = showOverlay ? "none" : "inline-block";

  if (!showOverlay) {
    return;
  }
  if (!hasPlan) {
    refs.importOverlayBtn.textContent = "Create Plan";
    refs.importOverlayBtn.title = "Create Plan";
    refs.importOverlayBtn.dataset.action = "create-plan";
    return;
  }
  refs.importOverlayBtn.textContent = "Import backlog from Jira";
  refs.importOverlayBtn.title = "Import backlog from Jira";
  refs.importOverlayBtn.dataset.action = "import";
}

export function positionFabQuarter({ refs, capacityContentEl }) {
  if (refs.addQuarterBtn.disabled) {
    refs.addQuarterBtn.style.top = "54px";
    return;
  }
  const tbody = refs.capacityTable.tBodies[0];
  if (!tbody || !tbody.rows.length) {
    refs.addQuarterBtn.style.top = "";
    return;
  }
  const contentRect = capacityContentEl.getBoundingClientRect();
  const tbodyRect = tbody.getBoundingClientRect();
  const topPx = tbodyRect.top - contentRect.top + tbodyRect.height / 2 - 30;
  refs.addQuarterBtn.style.top = `${topPx}px`;
}
