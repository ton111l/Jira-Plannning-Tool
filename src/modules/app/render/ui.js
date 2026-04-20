import { countBacklogRowsWithInvalidRoleSplits } from "../services/backlogRoleSplitValidation.js";
import { PLANNING_TIME_MODE } from "../../planning/constants.js";

export function renderTabs({ refs, appState }) {
  refs.tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === appState.activeTab;
    button.classList.toggle("tab-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  const isCapacityTab = appState.activeTab === "capacity";
  refs.capacityWrapper.style.display = isCapacityTab ? "block" : "none";
  refs.capacityPanel.classList.toggle("panel-active", isCapacityTab);
  refs.backlogPanel.classList.toggle("panel-active", !isCapacityTab);
  refs.capacityPanel.setAttribute("aria-hidden", isCapacityTab ? "false" : "true");
  refs.backlogPanel.setAttribute("aria-hidden", isCapacityTab ? "true" : "false");
  refs.addCapacityRowBtn.style.display = isCapacityTab ? "inline-flex" : "none";
}

export function renderPlanSelect({ refs, appState, activePlan }) {
  refs.planSelect.innerHTML = "";

  if (!appState.plans.length) {
    refs.planSelect.hidden = true;
    return;
  }

  refs.planSelect.hidden = false;

  for (const plan of appState.plans) {
    const option = document.createElement("option");
    option.value = plan.id;
    option.textContent = plan.name;
    if (activePlan && plan.id === activePlan.id) {
      option.selected = true;
    }
    refs.planSelect.appendChild(option);
  }

  if (activePlan) {
    refs.planSelect.value = activePlan.id;
  }
}

export function renderTeamName({ refs, plan }) {
  if (!refs.teamNameInput) {
    return;
  }
  refs.teamNameInput.value = plan?.teamName || "";
  refs.teamNameInput.disabled = !plan;
}

export function renderSettings({ refs, plan, appState, syncSettingsPlanningRow }) {
  const hasSprints = plan?.periods?.some((p) => p.kind === "sprint") ?? false;
  const isSprintPlanningMode =
    String(plan?.planningTimeMode || PLANNING_TIME_MODE.quarter) === PLANNING_TIME_MODE.sprint;
  const sprintsPlanningActive = hasSprints || Boolean(plan?.useSprintsPlanning);
  const estimationType = plan?.estimationType || appState.estimationType || "story_points";
  refs.estimationTypeSelect.value = estimationType;
  const personDaysOption = refs.estimationTypeSelect.querySelector('option[value="person_days"]');
  if (personDaysOption) {
    personDaysOption.disabled = sprintsPlanningActive;
  }
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
  refs.settingsWorkingDaysInput.disabled = sprintsPlanningActive;
  if (refs.settingsPlanningGrid) {
    refs.settingsPlanningGrid.hidden = !plan;
  }
  if (refs.settingsUseSprintsCheckbox) {
    refs.settingsUseSprintsCheckbox.checked = isSprintPlanningMode ? Boolean(plan?.useSprintsPlanning) : false;
    const sprintsLabel = refs.settingsUseSprintsCheckbox.closest("label");
    if (sprintsLabel) {
      sprintsLabel.hidden = !isSprintPlanningMode;
    }
  }
  if (refs.settingsSprintSettingsBtn) {
    refs.settingsSprintSettingsBtn.hidden = !isSprintPlanningMode;
  }
  if (refs.settingsUseBuffersCheckbox) {
    refs.settingsUseBuffersCheckbox.checked = Boolean(plan?.useBuffers);
  }
  if (refs.settingsDefaultLoadPercentSelect) {
    const raw = plan?.defaultLoadPercent ?? 100;
    const n = Number(raw);
    refs.settingsDefaultLoadPercentSelect.value =
      Number.isFinite(n) && n >= 10 && n <= 100 ? String(Math.round(n / 10) * 10) : "100";
  }
  refs.resourceGroupingTypeSelect.value = plan?.resourceGroupingType || appState.resourceGroupingType || "by_roles";

  syncSettingsDefaultRoleSplitSection(refs, plan, appState);

  if (refs.settingsRolesSection) {
    refs.settingsRolesSection.hidden = !plan;
    if (plan) {
      renderSettingsRolesList({ refs, plan });
    }
  }

  if (typeof syncSettingsPlanningRow === "function") {
    syncSettingsPlanningRow();
  }
}

/**
 * Visibility and content for "Default % SP by roles": Story Points + (**By roles** or **By member**) (uses live Settings form values).
 * Call when opening Settings and when Estimation type or Resource grouping changes.
 */
export function syncSettingsDefaultRoleSplitSection(refs, plan, appState) {
  if (!refs.settingsDefaultRoleSplitWrap) {
    return;
  }
  const estimationType =
    refs.estimationTypeSelect?.value ||
    plan?.estimationType ||
    appState?.estimationType ||
    "story_points";
  const resourceGroupingType =
    refs.resourceGroupingTypeSelect?.value ||
    plan?.resourceGroupingType ||
    appState?.resourceGroupingType ||
    "by_team";
  const usesRoleSplitDefaults =
    resourceGroupingType === "by_roles" || resourceGroupingType === "by_member";
  const show = Boolean(plan) && estimationType === "story_points" && usesRoleSplitDefaults;
  refs.settingsDefaultRoleSplitWrap.hidden = !show;
  if (show) {
    renderSettingsDefaultRoleSplitList(refs, plan);
    refreshDefaultRoleSplitTotal(refs);
  }
}

function renderSettingsDefaultRoleSplitList(refs, plan) {
  const list = refs.settingsDefaultRoleSplitList;
  if (!list || !plan) {
    return;
  }
  list.innerHTML = "";
  const map = plan.defaultRoleSplitPctByRoleId && typeof plan.defaultRoleSplitPctByRoleId === "object"
    ? plan.defaultRoleSplitPctByRoleId
    : {};
  for (const opt of plan.roleOptions || []) {
    if (!opt?.id) {
      continue;
    }
    const row = document.createElement("div");
    row.className = "settings-default-role-split-row";
    row.dataset.roleId = opt.id;
    const lab = document.createElement("label");
    lab.className = "settings-default-role-split-label";
    const inputId = `default-split-${opt.id}`;
    lab.htmlFor = inputId;
    lab.textContent = opt.label ? `${opt.label} (%)` : "Role (%)";
    const inp = document.createElement("input");
    inp.id = inputId;
    inp.type = "number";
    inp.min = "0";
    inp.max = "100";
    inp.step = "any";
    inp.className = "input settings-default-role-split-input";
    inp.dataset.roleId = opt.id;
    inp.setAttribute("aria-label", `Default split percent for ${opt.label || "role"}`);
    const v = map[opt.id];
    inp.value = v !== undefined && v !== null && String(v).trim() !== "" ? String(v) : "";
    inp.placeholder = "";
    row.appendChild(lab);
    row.appendChild(inp);
    list.appendChild(row);
  }
}

/** Split `remainder` across `count` slots with equal shares; last slot absorbs rounding (sum matches remainder). */
function splitRemainderEqually(remainder, count) {
  const r = Number(remainder);
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [Number(r.toFixed(2))];
  }
  let allocated = 0;
  const out = [];
  const per = Number((r / count).toFixed(2));
  for (let i = 0; i < count - 1; i += 1) {
    out.push(per);
    allocated += per;
  }
  out.push(Number((r - allocated).toFixed(2)));
  return out;
}

/**
 * When the first default-% field has a value, fills the rest so the sum is 100%.
 * (Editing rows 2+ does not trigger this — only call this when the first row changes or role count changes.)
 */
export function distributeDefaultRoleSplitFromFirst(refs) {
  const list = refs.settingsDefaultRoleSplitList;
  if (!list || refs.settingsDefaultRoleSplitWrap?.hidden) {
    return;
  }
  const inputs = Array.from(list.querySelectorAll(".settings-default-role-split-input"));
  if (inputs.length < 2) {
    return;
  }
  const first = inputs[0];
  const raw = String(first.value ?? "").trim();
  if (raw === "") {
    return;
  }
  let firstNum = Number(raw);
  if (!Number.isFinite(firstNum)) {
    return;
  }
  firstNum = Math.min(100, Math.max(0, firstNum));
  if (String(first.value) !== String(firstNum)) {
    first.value = String(firstNum);
  }
  const remainder = 100 - firstNum;
  const parts = splitRemainderEqually(remainder, inputs.length - 1);
  for (let i = 1; i < inputs.length; i += 1) {
    inputs[i].value = String(parts[i - 1]);
  }
}

/**
 * Updates the live total under Default % SP by roles; marks invalid unless sum is 100% (and no empty fields).
 */
export function refreshDefaultRoleSplitTotal(refs) {
  const totalEl = refs.settingsDefaultRoleSplitTotal;
  const list = refs.settingsDefaultRoleSplitList;
  if (!totalEl || !list || refs.settingsDefaultRoleSplitWrap?.hidden) {
    return;
  }
  const inputs = list.querySelectorAll(".settings-default-role-split-input");
  let sum = 0;
  let anyEmpty = false;
  for (const inp of inputs) {
    const raw = String(inp.value ?? "").trim();
    if (raw === "") {
      anyEmpty = true;
      continue;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) {
      sum += n;
    }
  }
  const label = anyEmpty ? "Total (incomplete)" : "Total";
  totalEl.textContent = `${label}: ${sum.toFixed(2)}% (must be 100%)`;
  const valid = !anyEmpty && inputs.length > 0 && Math.abs(sum - 100) <= 0.02;
  totalEl.classList.toggle("settings-default-role-split-total-invalid", !valid);
}

export function renderSettingsRolesList({ refs, plan }) {
  const list = refs.settingsRolesList;
  if (!list || !plan) {
    return;
  }
  list.innerHTML = "";
  const raw = Array.isArray(plan.roleOptions) ? plan.roleOptions : [];
  for (const opt of raw) {
    if (!opt?.id) {
      continue;
    }
    const row = document.createElement("div");
    row.className = "settings-role-row";
    row.dataset.roleId = opt.id;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "input settings-role-label";
    input.value = opt.label || "";
    input.maxLength = 120;
    input.setAttribute("aria-label", "Role name");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "row-delete-btn settings-role-delete";
    del.textContent = "\u00d7";
    del.setAttribute("aria-label", "Remove role");
    row.appendChild(input);
    row.appendChild(del);
    list.appendChild(row);
  }
}

export function renderCapacityViewMode({ refs, plan }) {
  if (!refs.capacityTableViewModeSelect) {
    return;
  }
  const hasPeriods = Boolean(plan?.periods?.length);
  refs.capacityTableViewModeSelect.disabled = !hasPeriods;
  refs.capacityTableViewModeSelect.value = plan?.capacityTableViewMode === "compact" ? "compact" : "full";
}

/**
 * Hint text, export controls, and per-period totals strip for the Capacity tab.
 */
export function renderCapacityChrome({
  refs,
  plan
}) {
  const toolbar = refs.capacityToolbar;
  if (!toolbar) {
    return;
  }

  const hasPlan = Boolean(plan);
  const hasPeriods = Boolean(plan?.periods?.length);
  const buffersBar = refs.capacityBuffersBar;

  toolbar.hidden = !hasPlan;
  if (buffersBar) {
    buffersBar.hidden = true;
    buffersBar.textContent = "";
  }

  if (!hasPlan || !hasPeriods) {
    return;
  }
  const sourceItems = Array.isArray(plan.bufferItems) ? plan.bufferItems : [];
  const items = sourceItems.length
    ? sourceItems
    : plan.allBuffersPercent > 0
      ? [{ name: "All Buffers", percent: plan.allBuffersPercent }]
      : [];
  const visibleItems = items.filter((item) => Number(item?.percent) > 0);
  if (!plan.useBuffers || !visibleItems.length || !buffersBar) {
    return;
  }
  buffersBar.hidden = false;
  const text = visibleItems
    .map((item, index) => {
      const name = String(item?.name || `Buffer ${index + 1}`).trim() || `Buffer ${index + 1}`;
      const pct = Number(item?.percent || 0);
      return `${name}: ${pct}%`;
    })
    .join(" | ");
  buffersBar.textContent = text;
}

export function renderPlanExportControl({ refs, plan }) {
  if (!refs.planExportBtn) {
    return;
  }
  void plan;
  refs.planExportBtn.disabled = false;
  refs.planExportBtn.setAttribute("aria-expanded", "false");
  if (refs.planExportMenu) {
    refs.planExportMenu.hidden = true;
  }
}

export function renderCapacityOverlay({ refs, plan }) {
  const selectedPlanId = String(refs.planSelect?.value || plan?.id || "").trim();
  const hasPlan = Boolean(plan) && Boolean(selectedPlanId) && !(refs.planSelect?.hidden);
  const hasPeriods = Boolean(plan?.periods?.length);
  const showOverlay = !hasPlan || !hasPeriods;

  refs.capacityOverlay.classList.toggle("active", showOverlay);
  refs.capacityTableWrap.classList.toggle("table-wrap-blur", showOverlay);
  if (refs.capacityToolbar) {
    refs.capacityToolbar.classList.toggle("table-wrap-blur", showOverlay);
  }
  if (refs.capacityStatsBar) {
    refs.capacityStatsBar.style.display = showOverlay ? "none" : "";
  }
  if (refs.capacityBuffersBar) {
    refs.capacityBuffersBar.style.display = showOverlay ? "none" : "";
  }
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
  const selectedPlanId = String(refs.planSelect?.value || plan?.id || "").trim();
  const hasPlan = Boolean(plan) && Boolean(selectedPlanId) && !(refs.planSelect?.hidden);
  const hasBacklogRows = Boolean(plan?.backlogRows?.length);
  const showOverlay = !hasPlan || !hasBacklogRows;
  refs.backlogOverlay.classList.toggle("active", showOverlay);
  refs.backlogTableWrap.classList.toggle("table-wrap-blur", showOverlay);
  if (refs.backlogToolbar) {
    refs.backlogToolbar.style.display = showOverlay ? "none" : "";
  }
  if (refs.backlogStatsBar) {
    refs.backlogStatsBar.style.display = showOverlay ? "none" : "";
  }
  if (refs.openImportModalBtn) {
    refs.openImportModalBtn.style.display = "";
  }

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

export function syncBacklogSplitSummary({ refs, plan }) {
  const el = refs.backlogSplitSummary;
  if (!el) {
    return;
  }
  if (!plan?.backlogRows?.length) {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("backlog-split-summary--warn");
    return;
  }
  const n = countBacklogRowsWithInvalidRoleSplits(plan);
  if (n === 0) {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("backlog-split-summary--warn");
    return;
  }
  el.hidden = false;
  el.classList.add("backlog-split-summary--warn");
  el.textContent =
    n === 1
      ? "1 row has invalid role splits (split total over 100% or role points over the row estimate)."
      : `${n} rows have invalid role splits (split total over 100% or role points over the row estimate).`;
}

export function syncBacklogBulkPeriodSelectOptions({ refs, plan }) {
  const sel = refs.backlogBulkPeriodSelect;
  if (!sel) {
    return;
  }
  if (!plan?.periods?.length) {
    sel.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "No periods in plan";
    sel.appendChild(ph);
    return;
  }
  const prev = sel.value;
  sel.innerHTML = "";
  const ph0 = document.createElement("option");
  ph0.value = "";
  ph0.textContent = "Choose period…";
  sel.appendChild(ph0);
  for (const p of plan.periods) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.label || p.id;
    sel.appendChild(o);
  }
  if (prev && [...sel.options].some((o) => o.value === prev)) {
    sel.value = prev;
  } else {
    sel.value = "";
  }
}

export function syncBacklogToolbarState({ refs, plan }) {
  syncBacklogSplitSummary({ refs, plan });
  syncBacklogBulkPeriodSelectOptions({ refs, plan });
  if (refs.backlogDensitySelect && plan) {
    refs.backlogDensitySelect.value = plan.backlogTableViewMode === "compact" ? "compact" : "full";
  }
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
