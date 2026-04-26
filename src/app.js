import {
  createBacklogRow,
  createCapacityRow,
  createDefaultRoleOptions,
  createEmptyCapacityPeriodValues,
  createPeriod,
  createPlan,
  generateId,
  buildEqualDefaultRoleSplitPctByRoleId
} from "./modules/models.js";
import { migrateLegacyRolesToCatalog } from "./modules/app/roleCatalog.js";
import { resolveBacklogPeriodSelectValue } from "./modules/app/render/shared/backlogHelpers.js";
import { calculatePlannedCapacity, sanitizeLoadPercent, sanitizeNonNegative } from "./modules/calculations.js";
import { loadState, saveState } from "./modules/storage.js";
import { importIssuesFromJira, openJiraAuthTab } from "./modules/jira.js";
import { ROLE_OPTIONS, ESTIMATION_TYPE_LABELS } from "./modules/app/constants.js";
import { refs } from "./modules/app/runtime.js";
import { cacheRefs as cacheAppRefs } from "./modules/app/refs.js";
import {
  positionFabQuarter as positionFabQuarterView,
  renderBacklogOverlay as renderBacklogOverlayView,
  renderCapacityOverlay as renderCapacityOverlayView,
  renderCapacityChrome as renderCapacityChromeView,
  renderCapacityViewMode as renderCapacityViewModeView,
  renderPlanExportControl as renderPlanExportControlView,
  renderPlanSelect as renderPlanSelectView,
  renderSettings as renderSettingsView,
  syncSettingsDefaultRoleSplitSection,
  distributeDefaultRoleSplitFromFirst,
  refreshDefaultRoleSplitTotal,
  renderTabs as renderTabsView,
  renderTeamName as renderTeamNameView,
  syncBacklogToolbarState,
  syncBacklogSplitSummary
} from "./modules/app/render/ui.js";
import { downloadPlanExport } from "./modules/app/services/planExport.js";
import { getCapacityNumericFieldTitle } from "./modules/app/render/capacity/headerLabels.js";
import { bindEvents as bindAppEvents } from "./modules/app/events/bindEvents.js";
import { openImportDialogAction } from "./modules/app/actions/backlog.js";
import { applySettingsChanges } from "./modules/app/actions/settings.js";
import { applyPlannedFromBacklog } from "./modules/app/services/backlogDemand.js";
import { applyDefaultRoleSplitsToBacklogRows } from "./modules/app/services/backlogRoleSplits.js";
import {
  refreshBacklogRoleSplitRowDom,
  syncBacklogRowRoleEstimationsFromSplits,
  syncSplitPctFromRoleEstimationField
} from "./modules/app/services/backlogRoleSplitValidation.js";
import { renderBacklogTable as renderBacklogTableView } from "./modules/app/render/backlog/index.js";
import { renderCapacityTable as renderCapacityTableView } from "./modules/app/render/capacity/index.js";
import {
  ensureTeamPeriodValues as ensureTeamPeriodValuesState,
  getActivePlan as getActivePlanState,
  getEstimationUnitLabel as getEstimationUnitLabelState,
  regroupCapacityRowsByRole as regroupCapacityRowsByRoleState,
  sanitizeOptionalNonNegative as sanitizeOptionalNonNegativeState,
  touchPlan as touchPlanState
} from "./modules/app/state.js";
import {
  assertPlanInvariants,
  createDefaultVelocity,
  getEffectiveEstimationType,
  normalizePlanForMode
} from "./modules/planning/index.js";
import { PLANNING_TIME_MODE } from "./modules/planning/constants.js";
import { buildQuarterPeriodRecord, buildSprintPeriods } from "./modules/planning/periodFactory.js";

let appState = null;
let pendingDeleteAction = null;
let pendingBulkRowEstimationPeriodId = null;
let pendingAddRoleRowId = null;
/** Saved sprint rows from Sprints Settings dialog: Array<{ sprintIndex: number, workingDays: number }> | null */
let pendingSprintConfig = null;
let pendingBufferTotalPercent = 0;
let pendingBufferItems = [];
function cacheRefs() {
  cacheAppRefs(refs);
}

function getActivePlan() {
  return getActivePlanState(appState);
}

function touchPlan(plan) {
  touchPlanState(plan);
}

function getPlanEstimationType(plan = getActivePlan()) {
  const resolved = plan ?? getActivePlan();
  if (resolved) {
    return getEffectiveEstimationType(resolved);
  }
  return appState?.estimationType || "story_points";
}

function getPlanResourceGroupingType(plan = getActivePlan()) {
  return plan?.resourceGroupingType || appState.resourceGroupingType || "by_roles";
}

function ensureTeamPeriodValues(plan) {
  ensureTeamPeriodValuesState(plan);
}

function getEstimationUnitLabel(plan = getActivePlan()) {
  return getEstimationUnitLabelState(
    getPlanEstimationType(plan),
    appState.estimationColumnTitle,
    ESTIMATION_TYPE_LABELS
  );
}

function sanitizeOptionalNonNegative(value) {
  return sanitizeOptionalNonNegativeState(value);
}

function regroupCapacityRowsByRole(plan) {
  return regroupCapacityRowsByRoleState(plan, getPlanResourceGroupingType(plan));
}

function getBacklogRoleColumnLabels(plan) {
  if (plan?.roleOptions?.length) {
    return plan.roleOptions.map((o) => o.label);
  }
  return ROLE_OPTIONS;
}

function setMessage(message, kind = "info") {
  refs.statusBar.textContent = message || "";
  refs.statusBar.classList.remove("error", "success");
  if (kind === "error") {
    refs.statusBar.classList.add("error");
  }
  if (kind === "success") {
    refs.statusBar.classList.add("success");
  }
}

async function persistAndRender(message, kind) {
  await saveState(appState);
  render();
  if (message) {
    setMessage(message, kind);
  }
}

function renderTabs() {
  renderTabsView({ refs, appState });
}

function renderPlanSelect() {
  renderPlanSelectView({ refs, appState, activePlan: getActivePlan() });
}

function buildCellInput({
  value,
  dataset = {},
  type = "text",
  readOnly = false,
  placeholder = "",
  title = ""
}) {
  const input = document.createElement("input");
  input.className = "cell-input";
  input.type = type;
  input.value = value ?? "";
  input.readOnly = readOnly;
  input.placeholder = placeholder;
  if (title) {
    input.title = title;
  }
  for (const [key, datasetValue] of Object.entries(dataset)) {
    input.dataset[key] = datasetValue;
  }
  return input;
}

function buildCellSelect({ value, dataset = {}, options = [] }) {
  const select = document.createElement("select");
  select.className = "cell-select";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select role";
  select.appendChild(placeholder);

  options.forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    select.appendChild(option);
  });

  select.value = options.includes(value) ? value : "";
  for (const [key, datasetValue] of Object.entries(dataset)) {
    select.dataset[key] = datasetValue;
  }
  return select;
}

function buildRoleSelect({ value, dataset = {}, roleOptions = [] }) {
  const select = document.createElement("select");
  select.className = "cell-select";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select role";
  select.appendChild(placeholder);

  for (const opt of roleOptions) {
    const option = document.createElement("option");
    option.value = opt.id;
    option.textContent = opt.label;
    select.appendChild(option);
  }

  const addOpt = document.createElement("option");
  addOpt.value = "__add_role__";
  addOpt.textContent = "+ Add role…";
  select.appendChild(addOpt);

  const validIds = new Set(roleOptions.map((o) => o.id));
  select.value = validIds.has(value) ? value : "";

  for (const [key, datasetValue] of Object.entries(dataset)) {
    select.dataset[key] = datasetValue;
  }
  return select;
}

function buildBacklogPeriodSelect({ row, plan, dataset = {} }) {
  const select = document.createElement("select");
  select.className = "cell-select";
  const periods = plan?.periods || [];
  if (periods.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No period";
    select.appendChild(opt);
    select.disabled = true;
  } else {
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "Select period";
    select.appendChild(ph);
    for (const p of periods) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label;
      select.appendChild(opt);
    }
    select.value = resolveBacklogPeriodSelectValue(row, plan);
  }
  for (const [key, datasetValue] of Object.entries(dataset)) {
    select.dataset[key] = datasetValue;
  }
  return select;
}

function buildPercentSelect({ value, dataset = {} }) {
  const select = document.createElement("select");
  select.className = "cell-select";

  for (let percent = 10; percent <= 100; percent += 10) {
    const option = document.createElement("option");
    option.value = String(percent);
    option.textContent = `${percent}%`;
    select.appendChild(option);
  }

  const numericValue = Number(value);
  select.value = Number.isFinite(numericValue) && numericValue >= 10 && numericValue <= 100
    ? String(Math.round(numericValue / 10) * 10)
    : "100";

  for (const [key, datasetValue] of Object.entries(dataset)) {
    select.dataset[key] = datasetValue;
  }
  return select;
}

function renderCapacityTable() {
  const activePlan = getActivePlan();
  renderCapacityTableView({
    refs,
    plan: activePlan,
    estimationType: getPlanEstimationType(activePlan),
    resourceGroupingType: getPlanResourceGroupingType(activePlan),
    estimationLabel: getEstimationUnitLabel(activePlan),
    roleOptions: activePlan?.roleOptions?.length ? activePlan.roleOptions : [],
    ensureTeamPeriodValues,
    buildCellInput,
    buildRoleSelect,
    buildPercentSelect,
    createEmptyCapacityPeriodValues
  });
}

function renderBacklogTable() {
  const activePlan = getActivePlan();
  renderBacklogTableView({
    refs,
    plan: activePlan,
    estimationHeader: getEstimationUnitLabel(),
    buildCellInput,
    buildCellSelect,
    buildBacklogPeriodSelect,
    estimationType: getPlanEstimationType(activePlan),
    resourceGroupingType: getPlanResourceGroupingType(activePlan),
    roleOptions: getBacklogRoleColumnLabels(activePlan)
  });
}

function renderTeamName() {
  renderTeamNameView({ refs, plan: getActivePlan() });
}

function renderSettings() {
  renderSettingsView({ refs, plan: getActivePlan(), appState, syncSettingsPlanningRow });
}

function isSettingsDialogOpen() {
  return Boolean(refs.settingsDialog?.open);
}

function syncSettingsPlanningRow() {
  if (!refs.settingsPlanningGrid || refs.settingsPlanningGrid.hidden) {
    return;
  }
  handleSettingsUseSprintsChange();
  handleSettingsUseBuffersChange();
}

function removeSprintsFromPlan(plan) {
  const anchorPeriod = plan.periods.find((p) => p.kind === "quarter" || !p.kind);
  if (!anchorPeriod) return;
  plan.periods = plan.periods.filter(
    (p) => !(p.kind === "sprint" && p.anchorQuarter === anchorPeriod.anchorQuarter && p.anchorYear === anchorPeriod.anchorYear)
  );
  plan.capacityRows.forEach((row) => {
    Object.keys(row.periodValues).forEach((pid) => {
      if (!plan.periods.find((p) => p.id === pid)) {
        delete row.periodValues[pid];
      }
    });
    recomputeCapacityRow(row, plan.periods, getPlanEstimationType(plan));
  });
  ensureTeamPeriodValues(plan);
  plan.planningTimeMode = PLANNING_TIME_MODE.quarter;
  plan.useSprintsPlanning = false;
}

const DEFAULT_STORY_POINTS_JIRA_FIELD = "customfield_10016";

function getImportDialogEstimationKind() {
  if (refs.importJiraEstimationKindPersonDays?.checked) {
    return "person_days";
  }
  return "story_points";
}

/** Resolves which Jira field to request based on the Import dialog field type (not plan Settings). */
function resolveImportEstimationFieldNameForImport(importKind, rawTrimmed) {
  if (importKind === "person_days") {
    return rawTrimmed || "timeoriginalestimate";
  }
  return rawTrimmed || DEFAULT_STORY_POINTS_JIRA_FIELD;
}

function syncImportEstimationFieldUi() {
  const input = refs.importJiraEstimationFieldInput;
  const label = refs.importJiraEstimationFieldLabel;
  const help = refs.importJiraEstimationFieldHelp;
  if (!input || !label || !help) {
    return;
  }
  const type = getImportDialogEstimationKind();
  if (type === "person_days") {
    label.textContent = "Jira estimation field";
    input.placeholder = "timeoriginalestimate";
    help.setAttribute(
      "data-tooltip",
      "Jira field id for Man-days / time (e.g. timeoriginalestimate for Original estimate in seconds, or a custom number field). Leave empty to use timeoriginalestimate."
    );
  } else {
    label.textContent = "Jira Story Points field";
    input.placeholder = "customfield_10016";
    help.setAttribute(
      "data-tooltip",
      "Custom field id used for Story Points in your Jira (often customfield_…). Required when field type is Story Points."
    );
  }
}

function normalizeJiraBaseUrlInput(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return "";
  }
  try {
    const parsed = new URL(value);
    let path = String(parsed.pathname || "");
    const markers = [
      "/rest/",
      "/browse/",
      "/secure/",
      "/issues/",
      "/projects/",
      "/plugins/",
      "/si/",
      "/login.jsp"
    ];
    for (const marker of markers) {
      const markerIndex = path.indexOf(marker);
      if (markerIndex >= 0) {
        path = path.slice(0, markerIndex);
        break;
      }
    }
    path = path.replace(/\/+$/, "");
    return `${parsed.origin}${path}`;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function syncImportButtonState() {
  const plan = getActivePlan();
  const hasJql = Boolean(refs.jqlInput.value.trim());
  const hasBaseUrl = Boolean(normalizeJiraBaseUrlInput(refs.importJiraBaseUrlInput.value));
  const fieldRaw = String(refs.importJiraEstimationFieldInput?.value || "").trim();
  const importKind = getImportDialogEstimationKind();
  const needsStoryPointsFieldId = importKind === "story_points";
  const hasEstimationField = !needsStoryPointsFieldId || Boolean(fieldRaw);
  const canImport = Boolean(plan) && hasJql && hasBaseUrl && hasEstimationField;
  refs.confirmImportBtn.classList.toggle("btn-disabled", !canImport);
  refs.confirmImportBtn.title = canImport
    ? "Import backlog from Jira"
    : "Enter Jira Base URL, JQL, and (when field type is Story Points) the Jira custom field id.";
}

function handleSettingsEstimationTypeChange() {
  const nextType = refs.estimationTypeSelect.value || "story_points";
  refs.settingsTeamEstimationWrap.style.display = nextType === "story_points" ? "flex" : "none";
  if (nextType !== "story_points") {
    refs.settingsTeamEstimationModeSelect.value = "average";
    refs.settingsTeamEstimationValueWrap.style.display = "none";
    refs.settingsTeamEstimationValueInput.value = "";
    syncSettingsDefaultRoleSplitSection(refs, getActivePlan(), appState);
    return;
  }
  const mode = refs.settingsTeamEstimationModeSelect.value || "average";
  refs.settingsTeamEstimationValueWrap.style.display = mode === "manual" ? "flex" : "none";
  syncSettingsDefaultRoleSplitSection(refs, getActivePlan(), appState);
}

function handleSettingsResourceGroupingChange() {
  syncSettingsDefaultRoleSplitSection(refs, getActivePlan(), appState);
}

function handleCreatePlanEstimationTypeChange() {
  const nextType = refs.createPlanEstimationTypeSelect.value || "story_points";
  refs.createPlanTeamEstimationWrap.style.display = nextType === "story_points" ? "flex" : "none";
  if (nextType !== "story_points") {
    refs.createPlanTeamEstimationModeSelect.value = "average";
    refs.createPlanTeamEstimationValueWrap.style.display = "none";
    refs.createPlanTeamEstimationValueInput.value = "";
    return;
  }
  const mode = refs.createPlanTeamEstimationModeSelect.value || "average";
  refs.createPlanTeamEstimationValueWrap.style.display = mode === "manual" ? "flex" : "none";
}

function handleCreatePlanUseSprintsChange() {
  const enabled = refs.createPlanUseSprintsCheckbox.checked;
  refs.createPlanSprintSettingsBtn.disabled = !enabled;
  refs.createPlanWorkingDaysInput.disabled = enabled;

  const personDaysOption = refs.createPlanEstimationTypeSelect.querySelector('option[value="person_days"]');
  if (personDaysOption) {
    personDaysOption.disabled = enabled;
  }
  if (enabled) {
    refs.createPlanEstimationTypeSelect.value = "story_points";
    handleCreatePlanEstimationTypeChange();
  }
}

function handleCreatePlanUseBuffersChange() {
  const enabled = refs.createPlanUseBuffersCheckbox.checked;
  refs.createPlanBufferSettingsBtn.disabled = !enabled;
}

function handleSettingsUseSprintsChange() {
  if (!refs.settingsUseSprintsCheckbox) {
    return;
  }
  const enabled = refs.settingsUseSprintsCheckbox.checked;
  if (refs.settingsSprintSettingsBtn) {
    refs.settingsSprintSettingsBtn.disabled = !enabled;
  }
  const plan = getActivePlan();
  const hasSprints = plan?.periods?.some((p) => p.kind === "sprint") ?? false;
  if (refs.settingsWorkingDaysInput) {
    refs.settingsWorkingDaysInput.disabled = enabled || hasSprints;
  }
  const personDaysOption = refs.estimationTypeSelect?.querySelector('option[value="person_days"]');
  if (personDaysOption) {
    personDaysOption.disabled = enabled || hasSprints;
  }
  if (enabled && !hasSprints) {
    refs.estimationTypeSelect.value = "story_points";
    handleSettingsEstimationTypeChange();
  }
}

function handleSettingsUseBuffersChange() {
  if (!refs.settingsUseBuffersCheckbox) {
    return;
  }
  const enabled = refs.settingsUseBuffersCheckbox.checked;
  if (refs.settingsBufferSettingsBtn) {
    refs.settingsBufferSettingsBtn.disabled = !enabled;
  }
}

function buildSprintSettingsRow(sprintNumber, workingDays = "") {
  const tr = document.createElement("tr");

  const sprintTd = document.createElement("td");
  sprintTd.className = "sprint-settings-cell";
  sprintTd.textContent = String(sprintNumber);
  tr.appendChild(sprintTd);

  const daysTd = document.createElement("td");
  daysTd.className = "sprint-settings-cell";
  const daysInput = document.createElement("input");
  daysInput.type = "text";
  daysInput.inputMode = "numeric";
  daysInput.pattern = "[0-9]*";
  daysInput.className = "input sprint-settings-days-input";
  daysInput.setAttribute("aria-label", `Working days for sprint ${sprintNumber}`);
  daysInput.value = String(workingDays ?? "").trim();
  daysTd.appendChild(daysInput);
  tr.appendChild(daysTd);

  const actionTd = document.createElement("td");
  actionTd.className = "sprint-settings-cell sprint-settings-action-cell";
  tr.appendChild(actionTd);

  return tr;
}

function renumberSprintRows() {
  const rows = refs.sprintSettingsTbody.querySelectorAll("tr");
  rows.forEach((row, index) => {
    const sprintCell = row.querySelector(".sprint-settings-cell");
    if (sprintCell) {
      sprintCell.textContent = String(index + 1);
    }
  });
}

function updateSprintDeleteButton() {
  const rows = Array.from(refs.sprintSettingsTbody.querySelectorAll("tr"));
  rows.forEach((row, index) => {
    const actionTd = row.querySelector(".sprint-settings-action-cell");
    if (!actionTd) return;
    actionTd.innerHTML = "";
    if (index === rows.length - 1 && rows.length > 0) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "row-delete-btn";
      deleteBtn.textContent = "×";
      deleteBtn.title = "Remove last sprint";
      deleteBtn.setAttribute("aria-label", "Remove last sprint");
      deleteBtn.addEventListener("click", () => {
        row.remove();
        updateSprintDeleteButton();
        renumberSprintRows();
      });
      actionTd.appendChild(deleteBtn);
    }
  });
}

function openSprintSettingsDialog() {
  refs.sprintSettingsTbody.innerHTML = "";
  const activePlan = getActivePlan();
  const sprintDur = activePlan?.sprintDurationDays ?? 14;
  const defaultSprintWd = Math.max(1, Math.round((sprintDur * 5) / 7));

  if (isSettingsDialogOpen()) {
    const plan = activePlan;
    const anchor = plan?.periods?.find((p) => p.kind === "quarter" || !p.kind);
    const sprints = anchor
      ? plan.periods.filter(
          (p) =>
            p.kind === "sprint" &&
            p.anchorQuarter === anchor.anchorQuarter &&
            p.anchorYear === anchor.anchorYear
        )
      : [];
    sprints.sort((a, b) => (a.sprintIndex ?? 0) - (b.sprintIndex ?? 0));
    const refRow = plan?.capacityRows?.[0];
    sprints.forEach((sp, idx) => {
      const wd = sanitizeNonNegative(refRow?.periodValues?.[sp.id]?.workingDays ?? 0);
      refs.sprintSettingsTbody.appendChild(buildSprintSettingsRow(idx + 1, wd > 0 ? wd : ""));
    });
    if (refs.sprintSettingsTbody.rows.length === 0) {
      refs.sprintSettingsTbody.appendChild(buildSprintSettingsRow(1, defaultSprintWd));
    }
  } else if (Array.isArray(pendingSprintConfig) && pendingSprintConfig.length > 0) {
    pendingSprintConfig.forEach((cfg, idx) => {
      refs.sprintSettingsTbody.appendChild(buildSprintSettingsRow(idx + 1, cfg?.workingDays ?? ""));
    });
  } else {
    refs.sprintSettingsTbody.appendChild(buildSprintSettingsRow(1, defaultSprintWd));
  }
  updateSprintDeleteButton();
  refs.sprintSettingsDialog.showModal();
}

function buildBufferSettingsRow(bufferNumber, { name = "", percent = "" } = {}) {
  const tr = document.createElement("tr");

  const nameTd = document.createElement("td");
  nameTd.className = "sprint-settings-cell";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "input";
  nameInput.setAttribute("aria-label", `Buffer name ${bufferNumber}`);
  nameInput.value = String(name || "");
  nameTd.appendChild(nameInput);
  tr.appendChild(nameTd);

  const percentTd = document.createElement("td");
  percentTd.className = "sprint-settings-cell";
  const percentInput = document.createElement("input");
  percentInput.type = "number";
  percentInput.min = "0";
  percentInput.step = "0.1";
  percentInput.className = "input sprint-settings-days-input";
  percentInput.setAttribute("aria-label", `Buffer percent ${bufferNumber}`);
  percentInput.value = String(percent ?? "");
  percentTd.appendChild(percentInput);
  tr.appendChild(percentTd);

  const actionTd = document.createElement("td");
  actionTd.className = "sprint-settings-cell sprint-settings-action-cell";
  tr.appendChild(actionTd);

  return tr;
}

function updateAllBuffersTotal() {
  const rows = Array.from(refs.bufferSettingsTbody.querySelectorAll("tr"));
  const total = rows.reduce((sum, row) => {
    const percentInput = row.querySelector(".sprint-settings-days-input");
    return sum + sanitizeNonNegative(percentInput?.value ?? 0);
  }, 0);
  const rounded = Number(total.toFixed(2));
  if (refs.buffersTotalDisplay) {
    refs.buffersTotalDisplay.textContent = `${rounded}%`;
  }
  return rounded;
}

function updateBufferDeleteButton() {
  const rows = Array.from(refs.bufferSettingsTbody.querySelectorAll("tr"));
  rows.forEach((row, index) => {
    const actionTd = row.querySelector(".sprint-settings-action-cell");
    if (!actionTd) return;
    actionTd.innerHTML = "";
    if (index === rows.length - 1 && rows.length > 0) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "row-delete-btn";
      deleteBtn.textContent = "×";
      deleteBtn.title = "Remove last buffer";
      deleteBtn.setAttribute("aria-label", "Remove last buffer");
      deleteBtn.addEventListener("click", () => {
        row.remove();
        updateBufferDeleteButton();
        updateAllBuffersTotal();
      });
      actionTd.appendChild(deleteBtn);
    }
  });
}

function openBufferSettingsDialog() {
  refs.bufferSettingsTbody.innerHTML = "";

  const isAllBuffersLegacyRow = (item) =>
    String(item?.name || "").trim().toLowerCase() === "all buffers" &&
    sanitizeNonNegative(item?.percent ?? 0) === 0;

  if (isSettingsDialogOpen()) {
    const plan = getActivePlan();
    const savedItems = (Array.isArray(plan?.bufferItems) ? plan.bufferItems : [])
      .filter((item) => !isAllBuffersLegacyRow(item));
    if (savedItems.length > 0) {
      savedItems.forEach((item, idx) => {
        refs.bufferSettingsTbody.appendChild(
          buildBufferSettingsRow(idx + 1, { name: item?.name || "", percent: item?.percent || "" })
        );
      });
    } else if (plan && sanitizeNonNegative(plan.allBuffersPercent ?? 0) > 0) {
      refs.bufferSettingsTbody.appendChild(
        buildBufferSettingsRow(1, { percent: sanitizeNonNegative(plan.allBuffersPercent) })
      );
    } else {
      refs.bufferSettingsTbody.appendChild(buildBufferSettingsRow(1));
    }
  } else if (pendingBufferItems.length > 0) {
    const filteredPending = pendingBufferItems.filter((item) => !isAllBuffersLegacyRow(item));
    if (filteredPending.length > 0) {
      filteredPending.forEach((item, idx) => {
        refs.bufferSettingsTbody.appendChild(
          buildBufferSettingsRow(idx + 1, { name: item?.name || "", percent: item?.percent || "" })
        );
      });
    } else {
      refs.bufferSettingsTbody.appendChild(buildBufferSettingsRow(1));
    }
  } else {
    refs.bufferSettingsTbody.appendChild(buildBufferSettingsRow(1));
  }
  updateBufferDeleteButton();
  updateAllBuffersTotal();
  refs.bufferSettingsDialog.showModal();
}

function handleAddSprintRow() {
  const nextNumber = refs.sprintSettingsTbody.rows.length + 1;
  refs.sprintSettingsTbody.appendChild(buildSprintSettingsRow(nextNumber));
  updateSprintDeleteButton();
}

function handleAddBufferRow() {
  const nextNumber = refs.bufferSettingsTbody.rows.length + 1;
  refs.bufferSettingsTbody.appendChild(buildBufferSettingsRow(nextNumber));
  updateBufferDeleteButton();
  updateAllBuffersTotal();
}

function handleBufferSettingsInput() {
  updateAllBuffersTotal();
}

async function submitSprintSettings(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    refs.sprintSettingsDialog.close();
    return;
  }

  const rows = Array.from(refs.sprintSettingsTbody.querySelectorAll("tr"));
  const nextConfig = [];
  for (let idx = 0; idx < rows.length; idx += 1) {
    const tr = rows[idx];
    const input = tr.querySelector(".sprint-settings-days-input");
    const raw = String(input?.value ?? "").trim();
    if (!/^\d+$/.test(raw) || Number(raw) < 1) {
      if (input) {
        input.focus();
        input.select?.();
      }
      setMessage(`Working days for Sprint ${idx + 1} must be a positive whole number.`, "error");
      return;
    }
    nextConfig.push({
      sprintIndex: idx + 1,
      workingDays: Number(raw)
    });
  }
  const sprintConfig = nextConfig;

  if (isSettingsDialogOpen()) {
    const plan = getActivePlan();
    if (plan && sprintConfig.length) {
      applySprintConfigToPlan(plan, sprintConfig);
      touchPlan(plan);
      refs.sprintSettingsDialog.close();
      renderSettings();
      await persistAndRender("Sprint settings updated.", "success");
    } else {
      refs.sprintSettingsDialog.close();
    }
    return;
  }

  pendingSprintConfig = sprintConfig;
  refs.sprintSettingsDialog.close();
}

async function submitBufferSettings(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    refs.bufferSettingsDialog.close();
    return;
  }
  const rows = Array.from(refs.bufferSettingsTbody.querySelectorAll("tr"));
  const items = [];
  for (const row of rows) {
    const nameInput = row.querySelector('input[type="text"]');
    const percentInput = row.querySelector(".sprint-settings-days-input");
    const name = String(nameInput?.value || "").trim();
    const percent = sanitizeNonNegative(percentInput?.value || 0);
    if (!name && percent <= 0) {
      continue;
    }
    // Skip legacy "All Buffers" placeholder rows with zero percent
    if (name.toLowerCase() === "all buffers" && percent <= 0) {
      continue;
    }
    items.push({ name: name || "Buffer", percent: Number(percent.toFixed(2)) });
  }
  pendingBufferItems = items;
  pendingBufferTotalPercent = Number(
    items.reduce((sum, item) => sum + sanitizeNonNegative(item.percent), 0).toFixed(2)
  );
  if (isSettingsDialogOpen()) {
    const plan = getActivePlan();
    if (plan) {
      plan.useBuffers = Boolean(refs.settingsUseBuffersCheckbox?.checked);
      plan.allBuffersPercent = plan.useBuffers ? pendingBufferTotalPercent : 0;
      plan.bufferItems = plan.useBuffers ? pendingBufferItems : [];
      touchPlan(plan);
      refs.bufferSettingsDialog.close();
      renderSettings();
      await persistAndRender("Buffer settings updated.", "success");
    } else {
      refs.bufferSettingsDialog.close();
    }
    return;
  }
  refs.bufferSettingsDialog.close();
}

function applySprintConfigToPlan(plan, sprintConfig) {
  const anchorPeriod = plan.periods.find((p) => p.kind === "quarter" || !p.kind);
  if (!anchorPeriod || !sprintConfig?.length) return;

  plan.periods = plan.periods.filter(
    (p) => !(p.kind === "sprint" && p.anchorQuarter === anchorPeriod.anchorQuarter && p.anchorYear === anchorPeriod.anchorYear)
  );
  plan.capacityRows.forEach((row) => {
    Object.keys(row.periodValues).forEach((pid) => {
      if (!plan.periods.find((p) => p.id === pid)) {
        delete row.periodValues[pid];
      }
    });
  });

  const sprintPeriods = buildSprintPeriods({
    anchorQuarter: anchorPeriod.anchorQuarter,
    anchorYear: anchorPeriod.anchorYear,
    sprintCount: sprintConfig.length
  });

  const estimationType = getPlanEstimationType(plan);
  const workingDaysByIndex = Object.fromEntries(sprintConfig.map((s) => [s.sprintIndex, s.workingDays]));

  // Store working days on each sprint period so new rows can use the correct default
  sprintPeriods.forEach((sp) => {
    sp.defaultWorkingDays = workingDaysByIndex[sp.sprintIndex] ?? 0;
  });

  const anchorIdx = plan.periods.findIndex((p) => p.id === anchorPeriod.id);
  if (anchorIdx >= 0) {
    // Sprints come before the anchor quarter; the quarter acts as a read-only summary column
    plan.periods.splice(anchorIdx, 1, ...sprintPeriods, anchorPeriod);
  }

  ensureTeamPeriodValues(plan);
  // Keep the anchor quarter's team period values (it's now a summary column, not deleted)
  sprintPeriods.forEach((sp) => {
    plan.teamPeriodValues[sp.id] = { teamEstimationMode: "average", teamEstimationPerDay: "" };
  });

  plan.capacityRows.forEach((row) => {
    // Ensure the quarter summary period values exist; recomputeCapacityRow will sum from sprints
    if (!row.periodValues[anchorPeriod.id]) {
      row.periodValues[anchorPeriod.id] = createEmptyCapacityPeriodValues();
    }
    sprintPeriods.forEach((sp) => {
      const values = createEmptyCapacityPeriodValues();
      values.workingDays = workingDaysByIndex[sp.sprintIndex] ?? 0;
      values.availableCapacity = Math.max(0, values.workingDays - values.daysOff);
      if (estimationType === "person_days") {
        values.availableBalance = calculatePlannedCapacity(values.workingDays, values.daysOff, row.loadPercent);
      }
      row.periodValues[sp.id] = values;
    });
    recomputeCapacityRow(row, plan.periods, estimationType);
  });
  plan.useSprintsPlanning = true;
  plan.planningTimeMode = PLANNING_TIME_MODE.sprint;
}

function handleImportJiraBaseUrlBlur() {
  refs.importJiraBaseUrlInput.value = normalizeJiraBaseUrlInput(refs.importJiraBaseUrlInput.value);
  syncImportButtonState();
}

function renderCapacityOverlay() {
  renderCapacityOverlayView({ refs, plan: getActivePlan() });
}

function renderBacklogOverlay() {
  renderBacklogOverlayView({ refs, plan: getActivePlan() });
}

function positionFabQuarter() {
  positionFabQuarterView({ refs, capacityContentEl: document.getElementById("capacityContent") });
}

function normalizeBacklogIssueKey(raw) {
  const source = String(raw || "");
  const normalizedSource = source.replace(/\\+/g, "");
  const match = normalizedSource.match(/([A-Z][A-Z0-9_]+-\d+)/i);
  if (match) {
    return match[1].toUpperCase();
  }
  return normalizedSource
    .replace(/[`"'“”„‟‘’‚‛]+/g, "")
    .trim();
}

/** Keeps the first backlog row per normalized issue key; drops later duplicates. Rows without a key are kept. */
function dedupeBacklogRowsByKey(plan) {
  if (!plan?.backlogRows?.length) {
    return;
  }
  const seen = new Set();
  plan.backlogRows = plan.backlogRows.filter((row) => {
    const k = normalizeBacklogIssueKey(row.key);
    if (!k) {
      return true;
    }
    if (seen.has(k)) {
      return false;
    }
    seen.add(k);
    return true;
  });
}

function render() {
  renderTabs();
  renderPlanSelect();
  renderPlanExportControlView({ refs, plan: getActivePlan() });
  renderTeamName();
  const activePlanForDemand = getActivePlan();
  if (activePlanForDemand?.periods?.length && activePlanForDemand.capacityRows?.length) {
    applyPlannedFromBacklog(activePlanForDemand, getPlanResourceGroupingType(activePlanForDemand));
  }
  renderCapacityTable();
  renderCapacityViewModeView({ refs, plan: getActivePlan() });
  renderCapacityChromeView({
    refs,
    plan: getActivePlan(),
    estimationType: getPlanEstimationType(),
    resourceGroupingType: getPlanResourceGroupingType(),
    estimationLabel: getEstimationUnitLabel()
  });
  renderCapacityOverlay();
  applyCapacityQuickFilter();
  updateCapacityBulkActionsState();
  renderBacklogTable();
  renderBacklogOverlay();
  updateBacklogBulkActionsState();
  syncBacklogToolbarState({ refs, plan: getActivePlan() });
  applyBacklogQuickFilter();
  positionFabQuarter();
}

function buildSprintsByAnchor(periods) {
  const map = {};
  for (const p of periods) {
    if (p.kind === "sprint") {
      const key = `${p.anchorQuarter}_${p.anchorYear}`;
      if (!map[key]) map[key] = [];
      map[key].push(p);
    }
  }
  return map;
}

function recomputeCapacityRow(row, periods, estimationType = getPlanEstimationType()) {
  row.loadPercent = sanitizeLoadPercent(row.loadPercent);
  const sprintsByAnchor = buildSprintsByAnchor(periods);

  periods.forEach((period) => {
    if (!row.periodValues[period.id]) {
      row.periodValues[period.id] = createEmptyCapacityPeriodValues();
    }
    const values = row.periodValues[period.id];
    const isQuarter = period.kind === "quarter" || !period.kind;
    const anchorKey = `${period.anchorQuarter ?? period.quarter}_${period.anchorYear ?? period.year}`;
    const linkedSprints = isQuarter ? (sprintsByAnchor[anchorKey] ?? []) : [];

    if (isQuarter && linkedSprints.length > 0) {
      values.daysOff = linkedSprints.reduce((sum, sp) => {
        return sum + sanitizeNonNegative(row.periodValues[sp.id]?.daysOff ?? 0);
      }, 0);
      values.workingDays = linkedSprints.reduce((sum, sp) => {
        return sum + sanitizeNonNegative(row.periodValues[sp.id]?.workingDays ?? 0);
      }, 0);
    } else {
      values.daysOff = sanitizeNonNegative(values.daysOff);
      values.workingDays = sanitizeNonNegative(values.workingDays);
    }

    values.availableCapacity = Math.max(values.workingDays - values.daysOff, 0);
    values.rowEstimationPerDay = sanitizeOptionalNonNegative(values.rowEstimationPerDay ?? values.estimationPerDay);
    if (estimationType === "story_points") {
      values.availableBalance =
        values.rowEstimationPerDay === ""
          ? ""
          : Number((values.availableCapacity * sanitizeNonNegative(values.rowEstimationPerDay)).toFixed(2));
    } else {
      values.availableBalance = calculatePlannedCapacity(values.workingDays, values.daysOff, row.loadPercent);
    }
    if (values.plannedEstimation === undefined || values.plannedEstimation === null) {
      values.plannedEstimation = "";
    }
  });
}

function getNextQuarter(periods) {
  if (!periods.length) {
    return createPeriod("Q1", new Date().getFullYear());
  }

  const last = periods[periods.length - 1];
  const quarterOrder = ["Q1", "Q2", "Q3", "Q4"];
  const index = quarterOrder.indexOf(last.quarter);
  if (index === -1 || index === 3) {
    return createPeriod("Q1", Number(last.year) + 1);
  }
  return createPeriod(quarterOrder[index + 1], Number(last.year));
}

async function handleCreatePlan() {
  const activePlan = getActivePlan();
  refs.planNameInput.value = "";
  refs.quarterInput.value = "Q1";
  refs.yearInput.value = String(new Date().getFullYear());
  const estimationType = getPlanEstimationType(activePlan);
  refs.createPlanEstimationTypeSelect.value = estimationType;
  refs.createPlanResourceGroupingTypeSelect.value = getPlanResourceGroupingType(activePlan);
  refs.createPlanWorkingDaysInput.value = String(activePlan?.defaultWorkingDays ?? 0);
  const firstPeriodId = activePlan?.periods?.[0]?.id || "";
  const periodTeamSettings = firstPeriodId ? activePlan?.teamPeriodValues?.[firstPeriodId] : null;
  refs.createPlanTeamEstimationModeSelect.value = periodTeamSettings?.teamEstimationMode || "average";
  refs.createPlanTeamEstimationValueInput.value = String(periodTeamSettings?.teamEstimationPerDay ?? "");
  handleCreatePlanEstimationTypeChange();
  // Always start a new plan with sprints and buffers off, regardless of the active plan
  refs.createPlanUseBuffersCheckbox.checked = false;
  pendingBufferTotalPercent = 0;
  pendingBufferItems = [];
  refs.createPlanUseSprintsCheckbox.checked = false;
  pendingSprintConfig = null;
  handleCreatePlanUseSprintsChange();
  handleCreatePlanUseBuffersChange();
  refs.createPlanDialog.showModal();
}

async function submitCreatePlan(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    refs.createPlanDialog.close();
    return;
  }
  const name = refs.planNameInput.value.trim();
  const quarter = refs.quarterInput.value;
  const year = Number(refs.yearInput.value);
  const estimationType = refs.createPlanEstimationTypeSelect.value || "story_points";
  const resourceGroupingType = refs.createPlanResourceGroupingTypeSelect.value || "by_roles";
  const useBuffers = refs.createPlanUseBuffersCheckbox.checked;
  const allBuffersPercent = useBuffers ? sanitizeNonNegative(pendingBufferTotalPercent) : 0;
  const defaultWorkingDays = sanitizeNonNegative(refs.createPlanWorkingDaysInput.value || 0);
  const teamEstimationMode = refs.createPlanTeamEstimationModeSelect.value === "manual" ? "manual" : "average";
  const teamEstimationPerDay = String(refs.createPlanTeamEstimationValueInput.value || "").trim();

  if (!name) {
    setMessage("Plan name is required.", "error");
    return;
  }
  if (!year || year < 2000 || year > 2100) {
    setMessage("Year should be between 2000 and 2100.", "error");
    return;
  }
  if (estimationType === "story_points" && teamEstimationMode === "manual") {
    const numericTeamValue = Number(teamEstimationPerDay);
    if (!teamEstimationPerDay || !Number.isFinite(numericTeamValue) || numericTeamValue < 0) {
      setMessage("Enter Team value or switch to Team average.", "error");
      return;
    }
  }

  const useSprintsPlanning = refs.createPlanUseSprintsCheckbox.checked;
  const plan = createPlan({
    name,
    quarter,
    year,
    estimationType,
    resourceGroupingType,
    useBuffers,
    allBuffersPercent,
    bufferItems: useBuffers ? pendingBufferItems : [],
    useSprintsPlanning,
    planningTimeMode: useSprintsPlanning ? PLANNING_TIME_MODE.sprint : PLANNING_TIME_MODE.quarter,
    estimationFieldName: "",
    defaultWorkingDays
  });
  const firstPeriodId = plan.periods[0]?.id;
  if (firstPeriodId) {
    plan.capacityRows.forEach((row) => {
      if (!row.periodValues[firstPeriodId]) {
        row.periodValues[firstPeriodId] = createEmptyCapacityPeriodValues();
      }
      row.periodValues[firstPeriodId].workingDays = defaultWorkingDays;
      recomputeCapacityRow(row, plan.periods, estimationType);
    });
    plan.teamPeriodValues[firstPeriodId].teamEstimationMode =
      estimationType === "story_points" ? teamEstimationMode : "average";
    plan.teamPeriodValues[firstPeriodId].teamEstimationPerDay =
      estimationType === "story_points" && teamEstimationMode === "manual" ? teamEstimationPerDay : "";
  }
  if (refs.createPlanUseSprintsCheckbox.checked && pendingSprintConfig?.length) {
    applySprintConfigToPlan(plan, pendingSprintConfig);
  }
  plan.useSprintsPlanning = useSprintsPlanning;
  pendingSprintConfig = null;
  pendingBufferTotalPercent = 0;
  pendingBufferItems = [];

  appState.plans.push(plan);
  appState.lastSelectedPlanId = plan.id;
  appState.activeTab = "capacity";
  refs.createPlanDialog.close();
  await persistAndRender("Plan created.", "success");
}

async function handleCapacityTableViewModeChange(event) {
  const plan = getActivePlan();
  if (!plan?.periods?.length) {
    return;
  }
  const value = event.target.value === "compact" ? "compact" : "full";
  plan.capacityTableViewMode = value;
  touchPlan(plan);
  await persistAndRender();
}

async function handlePlanSelect(event) {
  const selectedPlanId = event.target.value;
  if (!selectedPlanId) {
    return;
  }
  appState.lastSelectedPlanId = selectedPlanId;
  await persistAndRender("Plan selected.", "success");
}

async function handleAddCapacityRow() {
  const plan = getActivePlan();
  if (!plan) {
    setMessage("Create plan first.", "error");
    return;
  }
  const estimationType = getPlanEstimationType(plan);
  const newRow = createCapacityRow(plan.periods);
  newRow.loadPercent = sanitizeLoadPercent(plan.defaultLoadPercent ?? 100);
  const defaultWorkingDays = sanitizeNonNegative(plan.defaultWorkingDays ?? 0);
  const referenceRow = plan.capacityRows[0] ?? null;
  for (const period of plan.periods) {
    const to = newRow.periodValues[period.id];
    if (!to) continue;
    if (period.kind === "sprint") {
      if (referenceRow) {
        to.workingDays = sanitizeNonNegative(referenceRow.periodValues[period.id]?.workingDays ?? 0);
      } else {
        to.workingDays = sanitizeNonNegative(period.defaultWorkingDays ?? defaultWorkingDays);
      }
    } else {
      to.workingDays = defaultWorkingDays;
    }
  }
  recomputeCapacityRow(newRow, plan.periods, estimationType);
  plan.capacityRows.push(newRow);
  const regrouped = regroupCapacityRowsByRole(plan);
  if (regrouped) {
    touchPlan(plan);
  }
  touchPlan(plan);
  await persistAndRender("Capacity row added.", "success");
}

async function handleAddQuarter() {
  const plan = getActivePlan();
  if (!plan) {
    setMessage("Create plan first.", "error");
    return;
  }

  const period = getNextQuarter(plan.periods);
  plan.periods.push(period);
  ensureTeamPeriodValues(plan);
  plan.teamPeriodValues[period.id] = { teamEstimationMode: "average", teamEstimationPerDay: "" };
  plan.capacityRows.forEach((row) => {
    row.periodValues[period.id] = createEmptyCapacityPeriodValues();
    recomputeCapacityRow(row, plan.periods, getPlanEstimationType(plan));
  });
  touchPlan(plan);
  await persistAndRender(`Quarter ${period.label} added.`, "success");
}

function openCreatePeriodDialog() {
  const now = new Date();
  const month = now.getMonth();
  const quarter = month < 3 ? "Q1" : month < 6 ? "Q2" : month < 9 ? "Q3" : "Q4";
  refs.periodQuarterInput.value = quarter;
  refs.periodYearInput.value = String(now.getFullYear());
  refs.createPeriodDialog.showModal();
}

async function submitCreatePeriod(event) {
  event.preventDefault();
  const action = event.submitter?.value || "cancel";
  if (action !== "create") {
    refs.createPeriodDialog.close();
    return;
  }

  const plan = getActivePlan();
  if (!plan) {
    refs.createPeriodDialog.close();
    setMessage("Create plan first.", "error");
    return;
  }
  if (plan.periods.length > 0) {
    refs.createPeriodDialog.close();
    setMessage("Periods already exist.", "error");
    return;
  }

  const quarter = refs.periodQuarterInput.value;
  const year = Number(refs.periodYearInput.value);
  if (!["Q1", "Q2", "Q3", "Q4"].includes(quarter)) {
    setMessage("Select a valid quarter.", "error");
    return;
  }
  if (!year || year < 2000 || year > 2100) {
    setMessage("Year should be between 2000 and 2100.", "error");
    return;
  }

  const period = createPeriod(quarter, year);
  plan.periods.push(period);
  ensureTeamPeriodValues(plan);
  plan.teamPeriodValues[period.id] = { teamEstimationMode: "average", teamEstimationPerDay: "" };
  plan.capacityRows.forEach((row) => {
    row.periodValues[period.id] = createEmptyCapacityPeriodValues();
    recomputeCapacityRow(row, plan.periods, getPlanEstimationType(plan));
  });
  touchPlan(plan);
  refs.createPeriodDialog.close();
  await persistAndRender(`Quarter ${period.label} added.`, "success");
}

async function handleCapacityOverlayAction() {
  const action = refs.createPlanOverlayBtn.dataset.action;
  if (action === "create-period") {
    openCreatePeriodDialog();
    return;
  }
  await handleCreatePlan();
}

async function handleBacklogOverlayAction() {
  const action = refs.importOverlayBtn.dataset.action;
  if (action === "create-plan") {
    await handleCreatePlan();
    return;
  }
  openImportDialog();
}

function syncBacklogSelectAllState() {
  const table = refs.backlogTable;
  const selectAll = table.querySelector('[data-backlog-select="all"]');
  if (!selectAll) {
    return;
  }
  const boxes = [...table.querySelectorAll('tbody input[data-backlog-select="row"]')];
  const n = boxes.length;
  const checked = boxes.filter((b) => b.checked).length;
  selectAll.checked = n > 0 && checked === n;
  selectAll.indeterminate = checked > 0 && checked < n;
}

function syncCapacitySelectAllState() {
  const table = refs.capacityTable;
  const selectAll = table.querySelector('[data-capacity-select="all"]');
  if (!selectAll) {
    return;
  }
  const boxes = [...table.querySelectorAll('tbody input[data-capacity-select="row"]')];
  const n = boxes.length;
  const checked = boxes.filter((b) => b.checked).length;
  selectAll.checked = n > 0 && checked === n;
  selectAll.indeterminate = checked > 0 && checked < n;
}

function applyCapacityQuickFilter() {
  const input = refs.capacityQuickFilter;
  if (!input) {
    syncCapacityStatsBar();
    return;
  }
  const q = String(input.value || "")
    .trim()
    .toLowerCase();
  const bodyRows = refs.capacityTable?.querySelectorAll("tbody tr");
  if (!bodyRows?.length) {
    syncCapacityStatsBar();
    return;
  }
  bodyRows.forEach((tr) => {
    const onlyCell = tr.querySelector("td[colspan]");
    if (onlyCell) {
      tr.style.display = "";
      return;
    }
    if (!q) {
      tr.style.display = "";
      return;
    }
    const memberInput = tr.querySelector('input.cell-input[data-field="memberName"]');
    const roleSelect = tr.querySelector('select.cell-select[data-field="roleId"]');
    const member = String(memberInput?.value || "").toLowerCase();
    const roleLabel = String(roleSelect?.selectedOptions?.[0]?.textContent || "").toLowerCase();
    const roleValue = String(roleSelect?.value || "").toLowerCase();
    tr.style.display = member.includes(q) || roleLabel.includes(q) || roleValue.includes(q) ? "" : "none";
  });
  syncCapacityStatsBar();
}

function syncCapacityStatsBar() {
  const bodyRows = [...(refs.capacityTable?.querySelectorAll("tbody tr") || [])];
  const dataRows = bodyRows.filter((tr) => !tr.querySelector("td[colspan]"));
  const totalRows = dataRows.length;
  const filteredRows = dataRows.filter((tr) => tr.style.display !== "none").length;
  const selectedRows = dataRows.filter((tr) => {
    const rowCb = tr.querySelector('input[data-capacity-select="row"]');
    return Boolean(rowCb?.checked);
  }).length;
  if (refs.capacityTotalCount) {
    refs.capacityTotalCount.textContent = `Total rows: ${totalRows}`;
  }
  if (refs.capacityFilteredCount) {
    refs.capacityFilteredCount.textContent = `Filtered rows: ${filteredRows}`;
  }
  if (refs.capacitySelectedCount) {
    refs.capacitySelectedCount.textContent = `Selected rows: ${selectedRows}`;
  }
}

function updateCapacityBulkActionsState() {
  if (!refs.capacityDeleteSelectedBtn) {
    return;
  }
  const n = refs.capacityTable.querySelectorAll('input[data-capacity-select="row"]:checked').length;
  refs.capacityDeleteSelectedBtn.disabled = n === 0;
  syncCapacityStatsBar();
}

function handleCapacitySelectionChange(event) {
  const t = event.target;
  if (!(t instanceof HTMLInputElement) || t.type !== "checkbox") {
    return;
  }
  if (t.dataset.capacitySelect === "all") {
    const checked = t.checked;
    refs.capacityTable.querySelectorAll('input[data-capacity-select="row"]').forEach((cb) => {
      cb.checked = checked;
    });
    t.indeterminate = false;
    updateCapacityBulkActionsState();
    return;
  }
  if (t.dataset.capacitySelect === "row") {
    syncCapacitySelectAllState();
    updateCapacityBulkActionsState();
  }
}

async function handleDeleteSelectedCapacityRows() {
  const plan = getActivePlan();
  if (!plan?.capacityRows?.length) {
    return;
  }
  const selectedIds = new Set(
    [...refs.capacityTable.querySelectorAll('input[data-capacity-select="row"]:checked')].map(
      (cb) => cb.dataset.rowId
    )
  );
  if (!selectedIds.size) {
    return;
  }
  openDeleteConfirmDialog(`Delete ${selectedIds.size} selected capacity row(s)?`, async () => {
    const activePlan = getActivePlan();
    if (!activePlan?.capacityRows?.length) {
      return;
    }
    const before = activePlan.capacityRows.length;
    activePlan.capacityRows = activePlan.capacityRows.filter((row) => !selectedIds.has(row.id));
    const removed = before - activePlan.capacityRows.length;
    if (!removed) {
      return;
    }
    touchPlan(activePlan);
    await persistAndRender(`${removed} capacity row(s) deleted.`, "success");
  });
}

function applyBacklogQuickFilter() {
  const input = refs.backlogQuickFilter;
  if (!input) {
    syncBacklogStatsBar();
    return;
  }
  const q = String(input.value || "")
    .trim()
    .toLowerCase();
  const bodyRows = refs.backlogTable?.querySelectorAll("tbody tr");
  if (!bodyRows?.length) {
    syncBacklogStatsBar();
    return;
  }
  bodyRows.forEach((tr) => {
    const onlyCell = tr.querySelector("td[colspan]");
    if (onlyCell) {
      tr.style.display = "";
      return;
    }
    if (!q) {
      tr.style.display = "";
      return;
    }
    const keyInp = tr.querySelector('input.cell-input[data-field="key"]');
    const sumInp = tr.querySelector('input.cell-input[data-field="summary"]');
    const k = String(keyInp?.value || "").toLowerCase();
    const s = String(sumInp?.value || "").toLowerCase();
    tr.style.display = k.includes(q) || s.includes(q) ? "" : "none";
  });
  syncBacklogStatsBar();
}

function updateBacklogBulkActionsState() {
  if (!refs.backlogDeleteSelectedBtn) {
    return;
  }
  const n = refs.backlogTable.querySelectorAll('input[data-backlog-select="row"]:checked').length;
  refs.backlogDeleteSelectedBtn.disabled = n === 0;
  syncBacklogStatsBar();
}

function syncBacklogStatsBar() {
  const boxes = [...(refs.backlogTable?.querySelectorAll('tbody input[data-backlog-select="row"]') || [])];
  const totalItems = boxes.length;
  const selectedItems = boxes.filter((cb) => cb.checked).length;
  const filteredItems = boxes.filter((cb) => cb.closest("tr")?.style.display !== "none").length;
  if (refs.backlogTotalCount) {
    refs.backlogTotalCount.textContent = `Total items: ${totalItems}`;
  }
  if (refs.backlogFilteredCount) {
    refs.backlogFilteredCount.textContent = `Filtered items: ${filteredItems}`;
  }
  if (refs.backlogSelectedCount) {
    refs.backlogSelectedCount.textContent = `Selected items: ${selectedItems}`;
  }
}

function handleBacklogSelectionChange(event) {
  const t = event.target;
  if (!(t instanceof HTMLInputElement) || t.type !== "checkbox") {
    return;
  }
  if (t.dataset.backlogSelect === "all") {
    const checked = t.checked;
    refs.backlogTable.querySelectorAll('input[data-backlog-select="row"]').forEach((cb) => {
      cb.checked = checked;
    });
    t.indeterminate = false;
    updateBacklogBulkActionsState();
    applyBacklogQuickFilter();
    return;
  }
  if (t.dataset.backlogSelect === "row") {
    syncBacklogSelectAllState();
    updateBacklogBulkActionsState();
    applyBacklogQuickFilter();
  }
}

function closePlanExportMenu() {
  if (refs.planExportMenu) {
    refs.planExportMenu.hidden = true;
  }
  if (refs.planExportBtn) {
    refs.planExportBtn.setAttribute("aria-expanded", "false");
  }
}

function togglePlanExportMenu() {
  if (!refs.planExportBtn || !refs.planExportMenu || refs.planExportBtn.disabled) {
    return;
  }
  const nextHidden = !refs.planExportMenu.hidden;
  refs.planExportMenu.hidden = nextHidden;
  refs.planExportBtn.setAttribute("aria-expanded", nextHidden ? "false" : "true");
}

function handlePlanExportMenuClick(event) {
  const trigger = event.target;
  if (!(trigger instanceof HTMLElement)) {
    return;
  }
  if (refs.planExportBtn?.contains(trigger)) {
    return;
  }
  if (refs.planExportMenu?.contains(trigger)) {
    return;
  }
  closePlanExportMenu();
}

function handlePlanExportJson() {
  closePlanExportMenu();
  const plan = getActivePlan();
  const r = downloadPlanExport(plan, "json");
  setMessage(r.message, r.ok ? "success" : "info");
}

function handlePlanExportXlsx() {
  closePlanExportMenu();
  const plan = getActivePlan();
  const r = downloadPlanExport(plan, "xlsx");
  setMessage(r.message, r.ok ? "success" : "info");
}

function handleCapacityFieldFocusin(event) {
  const t = event.target;
  if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLSelectElement)) {
    return;
  }
  if (t.dataset.section !== "capacity") {
    return;
  }
  const field = t.dataset.field;
  if (!field) {
    return;
  }
  const msg = getCapacityNumericFieldTitle(field, { estimationLabel: getEstimationUnitLabel() });
  if (msg) {
    t.title = msg;
  }
}

async function handleBacklogDensityChange(event) {
  const plan = getActivePlan();
  if (!plan) {
    return;
  }
  const v = event.target?.value === "compact" ? "compact" : "full";
  plan.backlogTableViewMode = v;
  touchPlan(plan);
  await persistAndRender();
}

async function handleBacklogApplyPeriodToSelected() {
  const plan = getActivePlan();
  if (!plan?.backlogRows?.length) {
    return;
  }
  const periodId = String(refs.backlogBulkPeriodSelect?.value || "").trim();
  if (!periodId) {
    return;
  }
  const selectedIds = new Set(
    [...refs.backlogTable.querySelectorAll('input[data-backlog-select="row"]:checked')].map(
      (cb) => cb.dataset.rowId
    )
  );
  if (!selectedIds.size) {
    return;
  }
  let applied = 0;
  for (const row of plan.backlogRows) {
    if (selectedIds.has(row.id)) {
      row.targetPeriodId = periodId;
      applied += 1;
    }
  }
  touchPlan(plan);
  await persistAndRender(`Period applied to ${applied} issue(s).`, "success");
}

function handleDeleteSelectedBacklogRows() {
  const plan = getActivePlan();
  if (!plan?.backlogRows?.length) {
    return;
  }
  const selectedIds = new Set(
    [...refs.backlogTable.querySelectorAll('input[data-backlog-select="row"]:checked')].map(
      (cb) => cb.dataset.rowId
    )
  );
  if (!selectedIds.size) {
    return;
  }
  const n = selectedIds.size;
  const firstId = [...selectedIds][0];
  const firstRow = plan.backlogRows.find((r) => r.id === firstId);
  const keyHint = firstRow?.key ? ` (${normalizeBacklogIssueKey(firstRow.key)})` : "";
  openDeleteConfirmDialog(
    n === 1 ? `Remove this issue from the backlog?${keyHint}` : `Remove ${n} issues from the backlog?`,
    async () => {
      plan.backlogRows = plan.backlogRows.filter((r) => !selectedIds.has(r.id));
      touchPlan(plan);
      await persistAndRender("Removed from backlog.", "success");
    }
  );
}

function openDeleteConfirmDialog(message, onConfirm) {
  refs.deleteConfirmText.textContent = message;
  pendingDeleteAction = onConfirm;
  refs.deleteConfirmDialog.showModal();
}

function openAddRoleDialog(rowId) {
  pendingAddRoleRowId = rowId;
  refs.addRoleNameInput.value = "";
  refs.addRoleNameInput.classList.remove("input-invalid");
  refs.addRoleDialog.showModal();
  requestAnimationFrame(() => {
    refs.addRoleNameInput.focus();
  });
}

function handleAddRoleDialogClose() {
  pendingAddRoleRowId = null;
  refs.addRoleNameInput.value = "";
  refs.addRoleNameInput.classList.remove("input-invalid");
}

async function submitAddRole(event) {
  event.preventDefault();

  const rowId = pendingAddRoleRowId;
  const trimmed = String(refs.addRoleNameInput.value || "").trim();
  if (!trimmed) {
    refs.addRoleNameInput.classList.add("input-invalid");
    return;
  }
  refs.addRoleNameInput.classList.remove("input-invalid");

  const plan = getActivePlan();
  if (!plan || !rowId) {
    refs.addRoleDialog.close();
    return;
  }
  const row = plan.capacityRows.find((entry) => entry.id === rowId);
  if (!row) {
    refs.addRoleDialog.close();
    return;
  }

  if (!Array.isArray(plan.roleOptions)) {
    plan.roleOptions = [];
  }
  let opt = plan.roleOptions.find((o) => o.label === trimmed);
  if (!opt) {
    opt = { id: generateId("role_opt"), label: trimmed };
    plan.roleOptions.push(opt);
  }
  row.roleId = opt.id;
  touchPlan(plan);
  recomputeCapacityRow(row, plan.periods, getPlanEstimationType(plan));
  if (regroupCapacityRowsByRole(plan)) {
    touchPlan(plan);
  }
  refs.addRoleDialog.close();
  await persistAndRender("Role added.", "success");
}

async function submitDeleteConfirm(event) {
  event.preventDefault();
  const decision = event.submitter?.value || "no";
  refs.deleteConfirmDialog.close();

  if (decision !== "yes") {
    pendingDeleteAction = null;
    return;
  }

  const action = pendingDeleteAction;
  pendingDeleteAction = null;
  if (typeof action === "function") {
    await action();
  }
}

function openBulkRowEstimationDialog(periodId, periodLabel) {
  const estimationTitle = getEstimationUnitLabel();
  pendingBulkRowEstimationPeriodId = periodId;
  const plan = getActivePlan();
  ensureTeamPeriodValues(plan);
  const periodSettings = plan?.teamPeriodValues?.[periodId] || {};
  const currentTeamValue = periodSettings.teamEstimationPerDay ?? "";
  const currentMode = periodSettings.teamEstimationMode || "average";
  const isStoryPoints = getPlanEstimationType(plan) === "story_points";

  refs.bulkRowEstimationText.textContent = isStoryPoints
    ? `Choose how Per team ${estimationTitle} per day is calculated in ${periodLabel}.`
    : `For Man-days, Per team is calculated as the sum of members in ${periodLabel}.`;
  refs.bulkRowEstimationModeWrap.style.display = isStoryPoints ? "flex" : "none";
  refs.bulkRowEstimationInputLabel.textContent = "Story point per day value";
  refs.bulkRowEstimationModeInputs.forEach((input) => {
    input.checked = input.value === currentMode;
  });
  refs.bulkRowEstimationInput.value = currentTeamValue;
  const isManualMode = currentMode === "manual";
  refs.bulkRowEstimationManualWrap.style.display = isStoryPoints && isManualMode ? "flex" : "none";
  refs.bulkRowEstimationInput.disabled = !isStoryPoints || !isManualMode;
  refs.bulkRowEstimationInput.required = isStoryPoints && isManualMode;
  refs.bulkRowEstimationDialog.showModal();
}

async function submitBulkRowEstimation(event) {
  event.preventDefault();
  const action = event.submitter?.value || "cancel";
  if (action !== "apply") {
    refs.bulkRowEstimationDialog.close();
    pendingBulkRowEstimationPeriodId = null;
    return;
  }

  const periodId = pendingBulkRowEstimationPeriodId;
  pendingBulkRowEstimationPeriodId = null;
  if (!periodId) {
    return;
  }

  const plan = getActivePlan();
  if (!plan) {
    return;
  }
  const period = plan.periods.find((entry) => entry.id === periodId);
  if (!period) {
    return;
  }

  if (getPlanEstimationType(plan) !== "story_points") {
    refs.bulkRowEstimationDialog.close();
    return;
  }

  const selectedMode =
    refs.bulkRowEstimationModeInputs.find((input) => input.checked)?.value || "average";
  ensureTeamPeriodValues(plan);
  plan.teamPeriodValues[periodId].teamEstimationMode = selectedMode;
  if (selectedMode === "manual") {
    const value = sanitizeOptionalNonNegative(refs.bulkRowEstimationInput.value);
    if (value === "") {
      setMessage("Set Per team value or switch to team average.", "error");
      return;
    }
    plan.teamPeriodValues[periodId].teamEstimationPerDay = value;
  } else {
    plan.teamPeriodValues[periodId].teamEstimationPerDay = "";
  }
  refs.bulkRowEstimationDialog.close();
  touchPlan(plan);
  await persistAndRender(`${getEstimationUnitLabel()} per day updated for Per team in ${period.label}.`, "success");
}

async function handleCapacityTableClick(event) {
  const actionButton = event.target.closest("button[data-action]");
  if (!actionButton) {
    return;
  }

  const plan = getActivePlan();
  if (!plan) {
    return;
  }

  const action = actionButton.dataset.action;
  if (action === "bulk-row-estimation-per-day") {
    openSettingsDialog();
    setMessage("Team Story Points per day is configured in Settings.", "info");
    return;
  }

  if (action === "delete-capacity-row") {
    const rowId = actionButton.dataset.rowId;
    const rowIndexAtPrompt = plan.capacityRows.findIndex((row) => row.id === rowId);
    const rowNumber = rowIndexAtPrompt >= 0 ? rowIndexAtPrompt + 1 : "?";
    openDeleteConfirmDialog(`Delete this member row #${rowNumber}?`, async () => {
      const activePlan = getActivePlan();
      if (!activePlan) {
        return;
      }
      const rowIndex = activePlan.capacityRows.findIndex((row) => row.id === rowId);
      if (rowIndex === -1) {
        return;
      }
      activePlan.capacityRows.splice(rowIndex, 1);
      touchPlan(activePlan);
      await persistAndRender("Member removed.", "success");
    });
    return;
  }

  if (action === "delete-quarter") {
    const periodId = actionButton.dataset.periodId;
    const periodIndex = plan.periods.findIndex((period) => period.id === periodId);
    if (periodIndex === -1) {
      return;
    }

    const removedPeriodLabel = plan.periods[periodIndex].label;
    openDeleteConfirmDialog(`Delete period "${removedPeriodLabel}"?`, async () => {
      const activePlan = getActivePlan();
      if (!activePlan) {
        return;
      }
      const activePeriodIndex = activePlan.periods.findIndex((period) => period.id === periodId);
      if (activePeriodIndex === -1) {
        return;
      }
      const [removedPeriod] = activePlan.periods.splice(activePeriodIndex, 1);
      if (activePlan.teamPeriodValues && activePlan.teamPeriodValues[periodId]) {
        delete activePlan.teamPeriodValues[periodId];
      }
      activePlan.capacityRows.forEach((row) => {
        delete row.periodValues[periodId];
        recomputeCapacityRow(row, activePlan.periods, getPlanEstimationType(activePlan));
      });
      (activePlan.backlogRows || []).forEach((brow) => {
        if (brow.targetPeriodId === periodId) {
          brow.targetPeriodId = "";
        }
      });
      touchPlan(activePlan);
      await persistAndRender(`Period ${removedPeriod.label} removed.`, "success");
    });
  }
}

/** Split (%) and per-role story points use type=number; defer full render until change (blur). */
function isBacklogDeferredNumericField(field) {
  const f = String(field || "");
  if (f.startsWith("split_") && f.endsWith("_pct")) {
    return true;
  }
  return f.startsWith("role_estimation_");
}

/** Capacity number cells: defer full render until change (blur) so multi-digit entry works. */
function isCapacityDeferredNumericField(field) {
  return (
    field === "daysOff" ||
    field === "workingDays" ||
    field === "rowEstimationPerDay" ||
    field === "rowEstimationPerDayTeam"
  );
}

async function handleTableInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
    return;
  }

  const section = target.dataset.section;
  const rowId = target.dataset.rowId;
  const field = target.dataset.field;
  const periodId = target.dataset.periodId;
  const plan = getActivePlan();
  if (!plan || !section || !rowId || !field) {
    return;
  }

  if (section === "capacity") {
    if (field === "rowEstimationPerDayTeam" && periodId) {
      ensureTeamPeriodValues(plan);
      if (!plan.teamPeriodValues[periodId]) {
        plan.teamPeriodValues[periodId] = { teamEstimationMode: "average", teamEstimationPerDay: "" };
      }
      plan.teamPeriodValues[periodId].teamEstimationMode = "manual";
      plan.teamPeriodValues[periodId].teamEstimationPerDay = sanitizeOptionalNonNegative(target.value);
      plan.capacityRows.forEach((capacityRow) => {
        recomputeCapacityRow(capacityRow, plan.periods, getPlanEstimationType(plan));
      });
      touchPlan(plan);
      if (event.type === "input") {
        await saveState(appState);
        return;
      }
      await persistAndRender();
      return;
    }

    const row = plan.capacityRows.find((entry) => entry.id === rowId);
    if (!row) {
      return;
    }

    if (field === "memberName") {
      row.memberName = target.value;
    } else if (field === "roleId") {
      if (target.value === "__add_role__") {
        const previousValue = plan.roleOptions?.some((o) => o.id === row.roleId) ? row.roleId : "";
        target.value = previousValue;
        openAddRoleDialog(rowId);
        return;
      }
      row.roleId = target.value;
    } else if (field === "loadPercent") {
      row.loadPercent = sanitizeLoadPercent(target.value);
    } else if (periodId && (field === "daysOff" || field === "workingDays" || field === "rowEstimationPerDay")) {
      row.periodValues[periodId][field] =
        field === "rowEstimationPerDay" ? sanitizeOptionalNonNegative(target.value) : sanitizeNonNegative(target.value);
    }

    recomputeCapacityRow(row, plan.periods, getPlanEstimationType(plan));
    if (field === "roleId" && regroupCapacityRowsByRole(plan)) {
      touchPlan(plan);
    }

    if (
      event.type === "input" &&
      target instanceof HTMLInputElement &&
      target.type === "number" &&
      periodId &&
      (field === "daysOff" || field === "workingDays" || field === "rowEstimationPerDay")
    ) {
      touchPlan(plan);
      await saveState(appState);
      return;
    }
  }

  if (section === "backlog") {
    const row = plan.backlogRows.find((entry) => entry.id === rowId);
    if (!row || field === "source") {
      return;
    }
    if (field === "targetCapacityRowIdByRole") {
      const rid = target.dataset.roleId;
      if (!rid) {
        return;
      }
      if (!row.targetCapacityRowIdByRoleId || typeof row.targetCapacityRowIdByRoleId !== "object") {
        row.targetCapacityRowIdByRoleId = {};
      }
      row.targetCapacityRowIdByRoleId[rid] = target.value;
    } else if (field === "estimation") {
      row.estimation = target.value;
      const trimmed = String(target.value ?? "").trim();
      row.estimationKind = trimmed ? getPlanEstimationType(plan) : "";
    } else {
      row[field] = target.value;
    }
  }

  if (
    section === "backlog" &&
    (getPlanResourceGroupingType(plan) === "by_roles" || getPlanResourceGroupingType(plan) === "by_member") &&
    field === "estimation" &&
    target instanceof HTMLInputElement &&
    (event.type === "input" || event.type === "change")
  ) {
    const brow = plan.backlogRows.find((entry) => entry.id === rowId);
    if (brow) {
      syncBacklogRowRoleEstimationsFromSplits(brow, plan);
      const tr = target.closest("tr");
      if (tr) {
        refreshBacklogRoleSplitRowDom(tr, brow, plan);
      }
    }
    touchPlan(plan);
    await saveState(appState);
    syncBacklogSplitSummary({ refs, plan });
    return;
  }

  touchPlan(plan);
  if (
    section === "backlog" &&
    (field === "targetPeriodId" || field === "targetCapacityRowId" || field === "targetCapacityRowIdByRole")
  ) {
    await persistAndRender();
    return;
  }
  if (
    section === "backlog" &&
    event.type === "input" &&
    target instanceof HTMLInputElement &&
    target.type === "number" &&
    isBacklogDeferredNumericField(field)
  ) {
    const splitRow = plan.backlogRows.find((entry) => entry.id === rowId);
    const rgSplit = getPlanResourceGroupingType(plan);
    if (splitRow && (rgSplit === "by_roles" || rgSplit === "by_member")) {
      const tr = target.closest("tr");
      if (field.startsWith("split_") && field.endsWith("_pct")) {
        syncBacklogRowRoleEstimationsFromSplits(splitRow, plan);
        if (tr) {
          refreshBacklogRoleSplitRowDom(tr, splitRow, plan, { skipSplitField: field });
        }
      } else if (field.startsWith("role_estimation_")) {
        syncSplitPctFromRoleEstimationField(splitRow, plan, field);
        syncBacklogRowRoleEstimationsFromSplits(splitRow, plan);
        if (tr) {
          refreshBacklogRoleSplitRowDom(tr, splitRow, plan, { skipEstimationField: field });
        }
      }
    }
    await saveState(appState);
    if (section === "backlog") {
      syncBacklogSplitSummary({ refs, plan });
    }
    return;
  }
  const isTextInput = target instanceof HTMLInputElement && target.type === "text";
  const isSelectInput = target instanceof HTMLSelectElement;
  const shouldRenderForRoleGrouping =
    field === "roleId" && getPlanResourceGroupingType(plan) === "by_roles";

  if (isTextInput || (isSelectInput && field !== "loadPercent" && !shouldRenderForRoleGrouping)) {
    await saveState(appState);
    if (section === "backlog") {
      syncBacklogSplitSummary({ refs, plan });
    }
    return;
  }

  await persistAndRender();
}

function handleDeferredNumericInputKeydown(event) {
  if (event.key !== "Enter") {
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== "number") {
    return;
  }
  const { section, field, periodId } = target.dataset;
  if (
    section === "backlog" &&
    isBacklogDeferredNumericField(field)
  ) {
    event.preventDefault();
    target.blur();
    return;
  }
  if (
    section === "capacity" &&
    periodId &&
    isCapacityDeferredNumericField(field)
  ) {
    event.preventDefault();
    target.blur();
  }
}

async function handleTeamNameInput(event) {
  const plan = getActivePlan();
  if (!plan) {
    return;
  }
  plan.teamName = event.target.value.trimStart();
  touchPlan(plan);
  await persistAndRender();
}

function openImportDialog() {
  openImportDialogAction({
    refs,
    appState,
    getActivePlan,
    setMessage,
    syncImportButtonState,
    syncImportEstimationFieldUi
  });
  handleImportJiraBaseUrlBlur();
  syncImportButtonState();
}

async function handleImportDialogClose() {
  const plan = getActivePlan();
  if (!plan) {
    return;
  }
  const draftJql = refs.jqlInput.value.trim();
  const draftBaseUrl = normalizeJiraBaseUrlInput(refs.importJiraBaseUrlInput.value);
  const draftField = String(refs.importJiraEstimationFieldInput?.value || "").trim();
  const draftKind = getImportDialogEstimationKind();
  const baseUrlChanged = String(plan.jiraBaseUrl || "") !== draftBaseUrl;
  const fieldChanged = String(plan.estimationFieldName || "") !== draftField;
  const kindChanged = String(plan.importEstimationFieldKind || "") !== draftKind;
  if (String(plan.lastImportJql || "") === draftJql && !baseUrlChanged && !fieldChanged && !kindChanged) {
    return;
  }
  plan.lastImportJql = draftJql;
  plan.jiraBaseUrl = draftBaseUrl;
  plan.estimationFieldName = draftField;
  plan.importEstimationFieldKind = draftKind;
  touchPlan(plan);
  await saveState(appState);
}

async function submitImport(event) {
  event.preventDefault();
  const action = event.submitter?.value || "default";
  const plan = getActivePlan();
  if (action === "cancel") {
    if (plan) {
      plan.lastImportJql = refs.jqlInput.value.trim();
      plan.jiraBaseUrl = normalizeJiraBaseUrlInput(refs.importJiraBaseUrlInput.value);
      plan.estimationFieldName = String(refs.importJiraEstimationFieldInput?.value || "").trim();
      plan.importEstimationFieldKind = getImportDialogEstimationKind();
      touchPlan(plan);
    }
    await saveState(appState);
    refs.importDialog.close();
    return;
  }

  if (!plan) {
    setMessage("Create plan first.", "error");
    return;
  }

  const jql = refs.jqlInput.value.trim();
  if (!jql) {
    refs.jqlInput.classList.add("input-invalid");
    refs.jqlInput.focus();
    syncImportButtonState();
    setMessage("JQL is required for import.", "error");
    return;
  }

  const jiraBaseUrl = normalizeJiraBaseUrlInput(refs.importJiraBaseUrlInput.value);
  refs.importJiraBaseUrlInput.value = jiraBaseUrl;
  if (!jiraBaseUrl) {
    setMessage("Jira Base URL is required for import.", "error");
    return;
  }

  const rawField = String(refs.importJiraEstimationFieldInput?.value || "").trim();
  const importKind = getImportDialogEstimationKind();
  if (importKind === "story_points" && !rawField) {
    refs.importJiraEstimationFieldInput?.classList.add("input-invalid");
    refs.importJiraEstimationFieldInput?.focus();
    syncImportButtonState();
    setMessage("Enter Jira Story Points field id when field type is Story Points.", "error");
    return;
  }
  refs.importJiraEstimationFieldInput?.classList.remove("input-invalid");

  const estimationFieldName = resolveImportEstimationFieldNameForImport(importKind, rawField);
  plan.jiraBaseUrl = jiraBaseUrl;
  plan.lastImportJql = jql;
  plan.estimationFieldName = rawField;
  plan.importEstimationFieldKind = importKind;
  touchPlan(plan);
  await saveState(appState);

  const setImportProgress = (next) => {
    const current = Number(refs.importProgress.value) || 0;
    const numericNext = Math.max(0, Math.min(100, Number(next) || 0));
    refs.importProgress.value = Math.max(current, numericNext);
  };

  try {
    setImportProgress(8);
    setMessage("Import started...", "info");

    const imported = await importIssuesFromJira({
      baseUrl: jiraBaseUrl,
      jql,
      maxResults: 200,
      estimationFieldName,
      onProgress: (payload) => {
        if (payload?.value !== undefined) {
          setImportProgress(payload.value);
        }
      }
    });

    const importedRows = imported?.mappedRows || [];
    const importStats = {
      total: importedRows.length,
      emptySummary: importedRows.filter((row) => !row.summary).length,
      emptyIssueType: importedRows.filter((row) => !row.issueType).length,
      emptyPriority: importedRows.filter((row) => !row.priority).length,
      emptyEstimation: importedRows.filter((row) => row.estimation === "").length
    };
    console.info("[Jira Import Debug][app]", {
      jql,
      jiraBaseUrl,
      estimationFieldName,
      importEstimationFieldKind: importKind,
      searchMethod: imported?.meta?.searchMethod || "unknown",
      stats: importStats,
      sample: importedRows.slice(0, 5)
    });

    setImportProgress(80);
    refs.issuesCount.textContent = String(importedRows.length);

    dedupeBacklogRowsByKey(plan);

    const byKey = new Map();
    plan.backlogRows.forEach((row) => {
      const normalizedExistingKey = normalizeBacklogIssueKey(row.key);
      if (normalizedExistingKey) {
        if (row.key !== normalizedExistingKey) {
          row.key = normalizedExistingKey;
        }
        if (!byKey.has(normalizedExistingKey)) {
          byKey.set(normalizedExistingKey, row);
        }
      }
    });

    let updatedCount = 0;
    let addedCount = 0;
    importedRows.forEach((jiraRow, index) => {
      const normalizedImportedKey = normalizeBacklogIssueKey(jiraRow.key);
      const existing = normalizedImportedKey ? byKey.get(normalizedImportedKey) : null;
      if (existing) {
        updatedCount += 1;
        existing.key = normalizedImportedKey;
        existing.summary = jiraRow.summary;
        existing.status = jiraRow.status;
        existing.issueType = jiraRow.issueType;
        existing.priority = jiraRow.priority;
        existing.estimation = jiraRow.estimation;
        existing.estimationKind = importKind;
        existing.source = "jira";
      } else {
        addedCount += 1;
        const newRow = createBacklogRow({
          ...jiraRow,
          estimationKind: importKind,
          key: normalizedImportedKey,
          targetPeriodId: ""
        });
        plan.backlogRows.push(newRow);
        if (normalizedImportedKey) {
          byKey.set(normalizedImportedKey, newRow);
        }
      }
      if (importedRows.length > 0) {
        const mergeProgress = 80 + Math.round(((index + 1) / importedRows.length) * 16);
        setImportProgress(mergeProgress);
      }
    });

    applyDefaultRoleSplitsToBacklogRows(plan);

    plan.backlogEntryMode = "import";
    touchPlan(plan);
    setImportProgress(100);
    refs.importDialog.close();
    const summaryParts = [];
    if (addedCount) {
      summaryParts.push(`${addedCount} new`);
    }
    if (updatedCount) {
      summaryParts.push(`${updatedCount} updated`);
    }
    const diagParts = [];
    if (importStats.emptyEstimation > 0) {
      diagParts.push(`${importStats.emptyEstimation} without estimate in Jira`);
    }
    if (importStats.emptySummary > 0) {
      diagParts.push(`${importStats.emptySummary} without summary`);
    }
    if (importStats.emptyIssueType > 0) {
      diagParts.push(`${importStats.emptyIssueType} without issue type`);
    }
    if (importStats.emptyPriority > 0) {
      diagParts.push(`${importStats.emptyPriority} without priority`);
    }
    const diag = diagParts.length ? ` Data notes: ${diagParts.join("; ")}.` : "";
    const summary =
      summaryParts.length > 0
        ? `Import complete: ${summaryParts.join(", ")} (${importedRows.length} in result).${diag}`
        : `Import complete (${importedRows.length} in result).${diag}`;
    await persistAndRender(summary, "success");
  } catch (error) {
    refs.importProgress.value = 0;
    const message = String(error?.message || "");
    const authLike =
      error?.code === "AUTH" ||
      message.includes("Authorization error") ||
      message.includes("401") ||
      message.includes("403") ||
      message.toLowerCase().includes("error page") ||
      message.toLowerCase().includes("login");
    console.error("[Jira Import Error]", error);
    if (error?.code === "NO_JIRA_TAB") {
      setMessage("Open any Jira tab for selected Jira Base URL and retry import.", "error");
      return;
    }
    if (error?.code === "TIMEOUT") {
      setMessage("Import timed out. Retry or narrow JQL scope.", "error");
      return;
    }
    if (error?.code === "AUTH") {
      await openJiraAuthTab(jiraBaseUrl);
      setMessage("401/403 from Jira. Opened Jira tab for re-login; then retry import.", "error");
      return;
    }
    if (error?.code === "PARSE") {
      setMessage("Jira responded, but issue table format could not be parsed.", "error");
      return;
    }
    if (authLike) {
      await openJiraAuthTab(jiraBaseUrl);
      setMessage("Jira session/auth issue detected. Opened Jira tab for login; then retry import.", "error");
      return;
    }
    setMessage(`Import failed: ${message || "network error"}.`, "error");
  }
}

function openSettingsDialog() {
  const plan = getActivePlan();
  if (plan && (!Array.isArray(plan.roleOptions) || plan.roleOptions.length === 0)) {
    plan.roleOptions = createDefaultRoleOptions();
    touchPlan(plan);
  }
  renderSettings();
  refs.settingsDialog.showModal();
}

function handleSettingsAddRoleRow() {
  if (!refs.settingsRolesList) {
    return;
  }
  const row = document.createElement("div");
  row.className = "settings-role-row";
  row.dataset.roleId = generateId("role_opt");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "input settings-role-label";
  input.maxLength = 120;
  input.setAttribute("aria-label", "Role name");
  input.placeholder = "Role name";
  const del = document.createElement("button");
  del.type = "button";
  del.className = "row-delete-btn settings-role-delete";
  del.textContent = "\u00d7";
  del.setAttribute("aria-label", "Remove role");
  row.appendChild(input);
  row.appendChild(del);
  refs.settingsRolesList.appendChild(row);
  if (
    refs.settingsDefaultRoleSplitList &&
    refs.settingsDefaultRoleSplitWrap &&
    !refs.settingsDefaultRoleSplitWrap.hidden
  ) {
    const roleId = row.dataset.roleId;
    const splitRow = document.createElement("div");
    splitRow.className = "settings-default-role-split-row";
    splitRow.dataset.roleId = roleId;
    const lab = document.createElement("label");
    lab.className = "settings-default-role-split-label";
    const inputId = `default-split-${roleId}`;
    lab.htmlFor = inputId;
    lab.textContent = "New role (%)";
    const inp = document.createElement("input");
    inp.id = inputId;
    inp.type = "number";
    inp.min = "0";
    inp.max = "100";
    inp.step = "any";
    inp.className = "input settings-default-role-split-input";
    inp.dataset.roleId = roleId;
    inp.setAttribute("aria-label", "Default split percent for new role");
    splitRow.appendChild(lab);
    splitRow.appendChild(inp);
    refs.settingsDefaultRoleSplitList.appendChild(splitRow);
    distributeDefaultRoleSplitFromFirst(refs);
    refreshDefaultRoleSplitTotal(refs);
  }
  input.focus();
}

function handleSettingsRolesListClick(event) {
  const btn = event.target.closest(".settings-role-delete");
  if (!btn) {
    return;
  }
  const row = btn.closest(".settings-role-row");
  if (!row || !refs.settingsRolesList?.contains(row)) {
    return;
  }
  const rows = refs.settingsRolesList.querySelectorAll(".settings-role-row");
  if (rows.length <= 1) {
    setMessage("At least one role is required.", "error");
    return;
  }
  const removedRoleId = row.dataset.roleId;
  row.remove();
  if (removedRoleId && refs.settingsDefaultRoleSplitList) {
    const splitRow = refs.settingsDefaultRoleSplitList.querySelector(
      `.settings-default-role-split-row[data-role-id="${removedRoleId}"]`
    );
    splitRow?.remove();
  }
  distributeDefaultRoleSplitFromFirst(refs);
  refreshDefaultRoleSplitTotal(refs);
}

async function saveSettings(event) {
  event.preventDefault();
  const action = event.submitter?.value || "default";
  if (action === "cancel") {
    refs.settingsDialog.close();
    return;
  }
  const activePlan = getActivePlan();
  if (!activePlan) {
    refs.settingsDialog.close();
    return;
  }
  const defaultWorkingDays = sanitizeNonNegative(refs.settingsWorkingDaysInput.value || 0);
  const defaultLoadPercent = sanitizeLoadPercent(refs.settingsDefaultLoadPercentSelect?.value ?? 100);
  const result = applySettingsChanges({ plan: activePlan, refs, regroupCapacityRowsByRole, touchPlan });
  if (!result?.ok) {
    if (result?.error) {
      setMessage(result.error, "error");
    }
    return;
  }
  applyDefaultRoleSplitsToBacklogRows(activePlan);
  if (refs.settingsUseSprintsCheckbox) {
    const sprintPlanning =
      String(activePlan.planningTimeMode || PLANNING_TIME_MODE.quarter) === PLANNING_TIME_MODE.sprint;
    if (sprintPlanning) {
      activePlan.useSprintsPlanning = Boolean(refs.settingsUseSprintsCheckbox.checked);
      if (!activePlan.useSprintsPlanning) {
        removeSprintsFromPlan(activePlan);
      }
    }
  }
  if (refs.settingsUseBuffersCheckbox) {
    activePlan.useBuffers = Boolean(refs.settingsUseBuffersCheckbox.checked);
    if (!activePlan.useBuffers) {
      activePlan.allBuffersPercent = 0;
      activePlan.bufferItems = [];
    }
  }
  activePlan.defaultWorkingDays = defaultWorkingDays;
  activePlan.defaultLoadPercent = defaultLoadPercent;
  activePlan.capacityRows.forEach((row) => {
    row.loadPercent = defaultLoadPercent;
    activePlan.periods.forEach((period) => {
      if (!row.periodValues[period.id]) {
        row.periodValues[period.id] = createEmptyCapacityPeriodValues();
      }
      row.periodValues[period.id].workingDays = defaultWorkingDays;
    });
    recomputeCapacityRow(row, activePlan.periods, getPlanEstimationType(activePlan));
  });
  refs.settingsDialog.close();
  await persistAndRender("Settings saved.", "success");
}

function bindEvents() {
  bindAppEvents({
    refs,
    appState,
    handlers: {
      handleCreatePlan,
      handleCapacityOverlayAction,
      submitCreatePlan,
      submitCreatePeriod,
      handlePlanSelect,
      openSettingsDialog,
      saveSettings,
      handleSettingsAddRoleRow,
      handleSettingsRolesListClick,
      submitDeleteConfirm,
      submitAddRole,
      handleAddRoleDialogClose,
      submitBulkRowEstimation,
      handleAddCapacityRow,
      handleAddQuarter,
      openImportDialog,
      handleBacklogOverlayAction,
      submitImport,
      handleImportDialogClose,
      handleImportJiraBaseUrlBlur,
      handleSettingsEstimationTypeChange,
      handleSettingsResourceGroupingChange,
      handleSettingsUseSprintsChange,
      handleSettingsUseBuffersChange,
      handleCreatePlanEstimationTypeChange,
      handleCreatePlanUseSprintsChange,
      handleCreatePlanUseBuffersChange,
      openSprintSettingsDialog,
      openBufferSettingsDialog,
      handleAddSprintRow,
      handleAddBufferRow,
      handleBufferSettingsInput,
      submitSprintSettings,
      submitBufferSettings,
      syncImportButtonState,
      syncImportEstimationFieldUi,
      handleTableInput,
      handleDeferredNumericInputKeydown,
      handleCapacityTableClick,
      handleTeamNameInput,
      handleCapacityTableViewModeChange,
      togglePlanExportMenu,
      handlePlanExportMenuClick,
      handlePlanExportJson,
      handlePlanExportXlsx,
      handleBacklogSelectionChange,
      handleCapacitySelectionChange,
      handleDeleteSelectedBacklogRows,
      handleDeleteSelectedCapacityRows,
      handleCapacityFieldFocusin,
      handleBacklogDensityChange,
      handleBacklogApplyPeriodToSelected,
      applyCapacityQuickFilter,
      applyBacklogQuickFilter,
      updateBacklogBulkActionsState,
      persistAndRender
    }
  });
}

async function init() {
  cacheRefs();
  appState = await loadState();
  if (!appState.estimationType) {
    const legacy = String(appState.estimationColumnTitle || "").toLowerCase();
    appState.estimationType = legacy.includes("day") ? "person_days" : "story_points";
  }
  if (!appState.resourceGroupingType) {
    appState.resourceGroupingType = "by_team";
  }
  appState.plans.forEach((plan) => {
    plan.backlogEntryMode = "import";
    const firstPeriodMeta = plan.periods?.[0];
    if (typeof plan.anchorQuarter !== "string" || !plan.anchorQuarter) {
      plan.anchorQuarter = firstPeriodMeta?.anchorQuarter || firstPeriodMeta?.quarter || "Q1";
    }
    if (typeof plan.anchorYear !== "number" || Number.isNaN(plan.anchorYear)) {
      plan.anchorYear = Number(firstPeriodMeta?.anchorYear ?? firstPeriodMeta?.year) || new Date().getFullYear();
    }
    if (typeof plan.sprintDurationDays !== "number" || Number.isNaN(plan.sprintDurationDays)) {
      plan.sprintDurationDays = 14;
    } else {
      plan.sprintDurationDays = Math.max(1, plan.sprintDurationDays);
    }
    if (typeof plan.sprintCount !== "number" || Number.isNaN(plan.sprintCount)) {
      plan.sprintCount = 1;
    } else {
      plan.sprintCount = Math.max(1, Math.min(plan.sprintCount, 52));
    }
    if (!plan.velocity || typeof plan.velocity !== "object") {
      plan.velocity = createDefaultVelocity();
    }
    if (typeof plan.velocity.mode !== "string") {
      plan.velocity.mode = "none";
    }
    if (!plan.velocity.perPeriod || typeof plan.velocity.perPeriod !== "object") {
      plan.velocity.perPeriod = {};
    }
    (plan.periods || []).forEach((period) => {
      if (!period.kind) {
        period.kind = "quarter";
      }
      if (!period.anchorQuarter) {
        period.anchorQuarter = period.quarter;
      }
      if (period.anchorYear === undefined || period.anchorYear === null) {
        period.anchorYear = Number(period.year);
      }
    });
    const hasSprintPeriods = plan.periods?.some((p) => p.kind === "sprint") ?? false;
    const declared = String(plan.planningTimeMode || "");
    const declaredOk =
      declared === PLANNING_TIME_MODE.quarter || declared === PLANNING_TIME_MODE.sprint;
    if (!declaredOk) {
      plan.planningTimeMode = hasSprintPeriods ? PLANNING_TIME_MODE.sprint : PLANNING_TIME_MODE.quarter;
    } else if (hasSprintPeriods && plan.planningTimeMode === PLANNING_TIME_MODE.quarter) {
      plan.planningTimeMode = PLANNING_TIME_MODE.sprint;
    } else if (!hasSprintPeriods && plan.planningTimeMode === PLANNING_TIME_MODE.sprint) {
      plan.planningTimeMode = PLANNING_TIME_MODE.quarter;
    }

    // Migration: restore quarter summary period for sprint plans that previously had the
    // quarter removed, and backfill defaultWorkingDays on sprint periods.
    if (hasSprintPeriods) {
      const sprintGroups = {};
      (plan.periods || []).forEach((p) => {
        if (p.kind === "sprint") {
          const key = `${p.anchorQuarter}_${p.anchorYear}`;
          if (!sprintGroups[key]) sprintGroups[key] = [];
          sprintGroups[key].push(p);
        }
      });
      const refRow = plan.capacityRows?.[0];
      Object.entries(sprintGroups).forEach(([key, sprints]) => {
        const underscoreIdx = key.indexOf("_");
        const anchorQ = key.slice(0, underscoreIdx);
        const anchorY = Number(key.slice(underscoreIdx + 1));
        const hasQuarter = (plan.periods || []).some(
          (p) => (p.kind === "quarter" || !p.kind) && p.anchorQuarter === anchorQ && p.anchorYear === anchorY
        );
        if (!hasQuarter) {
          const quarterPeriod = buildQuarterPeriodRecord({ quarter: anchorQ, year: anchorY });
          const lastSprintIdx = (plan.periods || []).reduce((max, p, i) => {
            return p.kind === "sprint" && p.anchorQuarter === anchorQ && p.anchorYear === anchorY ? i : max;
          }, -1);
          plan.periods.splice(lastSprintIdx + 1, 0, quarterPeriod);
          if (!plan.teamPeriodValues) plan.teamPeriodValues = {};
          if (!plan.teamPeriodValues[quarterPeriod.id]) {
            plan.teamPeriodValues[quarterPeriod.id] = { teamEstimationMode: "average", teamEstimationPerDay: "" };
          }
          (plan.capacityRows || []).forEach((row) => {
            if (!row.periodValues[quarterPeriod.id]) {
              row.periodValues[quarterPeriod.id] = createEmptyCapacityPeriodValues();
            }
          });
        }
        sprints.forEach((sp) => {
          if (sp.defaultWorkingDays === undefined || sp.defaultWorkingDays === null) {
            sp.defaultWorkingDays = sanitizeNonNegative(refRow?.periodValues?.[sp.id]?.workingDays ?? 0);
          }
        });
      });
      // Recompute all rows so quarter values are derived from their linked sprints
      const estimationTypeMigration = plan.estimationType || "story_points";
      (plan.capacityRows || []).forEach((row) => {
        recomputeCapacityRow(row, plan.periods, estimationTypeMigration);
      });
    }
    (plan.backlogRows || []).forEach((row) => {
      if (row.targetPeriodId === undefined || row.targetPeriodId === null) {
        row.targetPeriodId = "";
      }
      if (row.targetCapacityRowId === undefined || row.targetCapacityRowId === null) {
        row.targetCapacityRowId = "";
      }
      if (!row.targetCapacityRowIdByRoleId || typeof row.targetCapacityRowIdByRoleId !== "object") {
        row.targetCapacityRowIdByRoleId = {};
      }
      if (
        row.estimationKind &&
        row.estimationKind !== "story_points" &&
        row.estimationKind !== "person_days"
      ) {
        delete row.estimationKind;
      }
    });
    if (!plan.estimationType) {
      plan.estimationType = appState.estimationType || "story_points";
    }
    if (!plan.resourceGroupingType) {
      plan.resourceGroupingType = appState.resourceGroupingType || "by_team";
    }
    if (typeof plan.useBuffers !== "boolean") {
      plan.useBuffers = false;
    }
    if (typeof plan.useSprintsPlanning !== "boolean") {
      plan.useSprintsPlanning = Boolean(plan.periods?.some((p) => p.kind === "sprint"));
    }
    if (typeof plan.allBuffersPercent !== "number" || Number.isNaN(plan.allBuffersPercent)) {
      plan.allBuffersPercent = 0;
    } else {
      plan.allBuffersPercent = sanitizeNonNegative(plan.allBuffersPercent);
    }
    if (!Array.isArray(plan.bufferItems)) {
      plan.bufferItems = plan.allBuffersPercent > 0 ? [{ name: "All Buffers", percent: plan.allBuffersPercent }] : [];
    } else {
      plan.bufferItems = plan.bufferItems
        .map((item) => ({
          name: String(item?.name || "").trim(),
          percent: Number(sanitizeNonNegative(item?.percent || 0).toFixed(2))
        }))
        .filter((item) => item.name || item.percent > 0);
    }
    if (typeof plan.jiraBaseUrl !== "string") {
      plan.jiraBaseUrl = String(appState.jiraBaseUrl || "");
    }
    if (typeof plan.estimationFieldName !== "string") {
      plan.estimationFieldName = String(appState.estimationFieldName || "");
    }
    if (plan.importEstimationFieldKind !== "story_points" && plan.importEstimationFieldKind !== "person_days") {
      plan.importEstimationFieldKind = plan.estimationType === "person_days" ? "person_days" : "story_points";
    }
    if (typeof plan.lastImportJql !== "string") {
      plan.lastImportJql = "";
    }
    migrateLegacyRolesToCatalog(plan);
    if (typeof plan.defaultWorkingDays !== "number" || Number.isNaN(plan.defaultWorkingDays)) {
      const firstPeriodId = plan.periods?.[0]?.id;
      const inferredWorkingDays = firstPeriodId && plan.capacityRows?.[0]?.periodValues?.[firstPeriodId]
        ? sanitizeNonNegative(plan.capacityRows[0].periodValues[firstPeriodId].workingDays)
        : 0;
      plan.defaultWorkingDays = inferredWorkingDays;
    }
    if (plan.capacityTableViewMode !== "compact" && plan.capacityTableViewMode !== "full") {
      plan.capacityTableViewMode = "full";
    }
    if (plan.backlogTableViewMode === "comfortable") {
      plan.backlogTableViewMode = "full";
    }
    if (plan.backlogTableViewMode !== "compact" && plan.backlogTableViewMode !== "full") {
      plan.backlogTableViewMode = "full";
    }
    if (typeof plan.defaultLoadPercent !== "number" || Number.isNaN(plan.defaultLoadPercent)) {
      const inferred = plan.capacityRows?.[0]?.loadPercent;
      plan.defaultLoadPercent =
        typeof inferred === "number" && !Number.isNaN(inferred)
          ? sanitizeLoadPercent(inferred)
          : 100;
    } else {
      plan.defaultLoadPercent = sanitizeLoadPercent(plan.defaultLoadPercent);
    }
    if (!plan.defaultRoleSplitPctByRoleId || typeof plan.defaultRoleSplitPctByRoleId !== "object") {
      plan.defaultRoleSplitPctByRoleId = {};
    }
    if (
      plan.estimationType === "story_points" &&
      (plan.resourceGroupingType === "by_roles" || plan.resourceGroupingType === "by_member") &&
      Array.isArray(plan.roleOptions) &&
      plan.roleOptions.length > 0
    ) {
      const m = plan.defaultRoleSplitPctByRoleId;
      const missing = plan.roleOptions.some((o) => {
        if (!o?.id) {
          return false;
        }
        const v = m[o.id];
        return v === undefined || v === null || String(v).trim() === "";
      });
      if (missing || Object.keys(m).length === 0) {
        plan.defaultRoleSplitPctByRoleId = buildEqualDefaultRoleSplitPctByRoleId(plan.roleOptions);
      }
    }
    normalizePlanForMode(plan);
    const invariantCheck = assertPlanInvariants(plan);
    if (!invariantCheck.ok && invariantCheck.errors.length) {
      console.warn("[Plan invariants]", plan.id, invariantCheck.errors);
    }
    ensureTeamPeriodValues(plan);
    if (plan.resourceGroupingType === "by_roles" && regroupCapacityRowsByRole(plan)) {
      touchPlan(plan);
    }
  });

  if (!appState.activeTab) {
    appState.activeTab = "capacity";
  }
  if (!appState.lastSelectedPlanId && appState.plans.length) {
    appState.lastSelectedPlanId = appState.plans[0].id;
  }

  bindEvents();
  render();
  if (!appState.plans.length) {
    setMessage("Create your first plan to start.", "info");
  }
}

init();
