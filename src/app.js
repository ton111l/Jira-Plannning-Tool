import {
  createBacklogRow,
  createCapacityRow,
  createEmptyCapacityPeriodValues,
  createPeriod,
  createPlan
} from "./modules/models.js";
import { calculatePlannedCapacity, sanitizeLoadPercent, sanitizeNonNegative } from "./modules/calculations.js";
import { loadState, saveState } from "./modules/storage.js";
import { importIssuesFromJira } from "./modules/jira.js";
import { ROLE_OPTIONS, ESTIMATION_TYPE_LABELS } from "./modules/app/constants.js";
import { refs } from "./modules/app/runtime.js";
import { cacheRefs as cacheAppRefs } from "./modules/app/refs.js";
import {
  positionFabQuarter as positionFabQuarterView,
  renderBacklogOverlay as renderBacklogOverlayView,
  renderCapacityOverlay as renderCapacityOverlayView,
  renderPlanSelect as renderPlanSelectView,
  renderSettings as renderSettingsView,
  renderTabs as renderTabsView,
  renderTeamName as renderTeamNameView
} from "./modules/app/render/ui.js";
import { bindEvents as bindAppEvents } from "./modules/app/events/bindEvents.js";
import { openImportDialogAction } from "./modules/app/actions/backlog.js";
import { applySettingsChanges } from "./modules/app/actions/settings.js";
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

let appState = null;
let pendingDeleteAction = null;
let pendingBulkRowEstimationPeriodId = null;
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
  return regroupCapacityRowsByRoleState(plan, getPlanResourceGroupingType(plan), ROLE_OPTIONS);
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

function buildCellInput({ value, dataset = {}, type = "text", readOnly = false, placeholder = "" }) {
  const input = document.createElement("input");
  input.className = "cell-input";
  input.type = type;
  input.value = value ?? "";
  input.readOnly = readOnly;
  input.placeholder = placeholder;
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
    roleOptions: ROLE_OPTIONS,
    ensureTeamPeriodValues,
    buildCellInput,
    buildCellSelect,
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
    estimationType: getPlanEstimationType(activePlan),
    resourceGroupingType: getPlanResourceGroupingType(activePlan),
    roleOptions: ROLE_OPTIONS
  });
}

function renderTeamName() {
  renderTeamNameView({ refs, plan: getActivePlan() });
}

function renderSettings() {
  renderSettingsView({ refs, plan: getActivePlan(), appState });
}

const DEFAULT_STORY_POINTS_JIRA_FIELD = "customfield_10016";

function resolveImportEstimationFieldName(plan, rawTrimmed) {
  const type = getPlanEstimationType(plan);
  if (type === "person_days") {
    return rawTrimmed || "timeoriginalestimate";
  }
  return rawTrimmed || DEFAULT_STORY_POINTS_JIRA_FIELD;
}

function syncImportEstimationFieldUi() {
  const plan = getActivePlan();
  const input = refs.importJiraEstimationFieldInput;
  const label = refs.importJiraEstimationFieldLabel;
  const help = refs.importJiraEstimationFieldHelp;
  if (!input || !label || !help) {
    return;
  }
  const type = plan ? getPlanEstimationType(plan) : "story_points";
  if (type === "person_days") {
    label.textContent = "Jira estimation field";
    input.placeholder = "timeoriginalestimate";
    help.setAttribute(
      "data-tooltip",
      "Jira field id for backlog estimate in Man-days mode (e.g. timeoriginalestimate for Original estimate in seconds, or a custom number field). Leave empty to use timeoriginalestimate."
    );
  } else {
    label.textContent = "Jira Story Points field";
    input.placeholder = "customfield_10016";
    help.setAttribute(
      "data-tooltip",
      "Custom field id used for Story Points in your Jira (often customfield_…). Required when Estimation type is Story Points."
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
  const needsStoryPointsField = plan && getPlanEstimationType(plan) === "story_points";
  const hasEstimationField = !needsStoryPointsField || Boolean(fieldRaw);
  const canImport = Boolean(plan) && hasJql && hasBaseUrl && hasEstimationField;
  refs.confirmImportBtn.classList.toggle("btn-disabled", !canImport);
  refs.confirmImportBtn.title = canImport
    ? "Import backlog from Jira"
    : "Enter Jira Base URL, JQL, and (for Story Points) Jira Story Points field id.";
}

function handleSettingsEstimationTypeChange() {
  const nextType = refs.estimationTypeSelect.value || "story_points";
  refs.settingsTeamEstimationWrap.style.display = nextType === "story_points" ? "flex" : "none";
  if (nextType !== "story_points") {
    refs.settingsTeamEstimationModeSelect.value = "average";
    refs.settingsTeamEstimationValueWrap.style.display = "none";
    refs.settingsTeamEstimationValueInput.value = "";
    return;
  }
  const mode = refs.settingsTeamEstimationModeSelect.value || "average";
  refs.settingsTeamEstimationValueWrap.style.display = mode === "manual" ? "flex" : "none";
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

function render() {
  renderTabs();
  renderPlanSelect();
  renderTeamName();
  renderCapacityTable();
  renderCapacityOverlay();
  renderBacklogTable();
  renderBacklogOverlay();
  positionFabQuarter();
}

function recomputeCapacityRow(row, periods, estimationType = getPlanEstimationType()) {
  row.loadPercent = sanitizeLoadPercent(row.loadPercent);
  periods.forEach((period) => {
    if (!row.periodValues[period.id]) {
      row.periodValues[period.id] = createEmptyCapacityPeriodValues();
    }
    const values = row.periodValues[period.id];
    values.daysOff = sanitizeNonNegative(values.daysOff);
    values.workingDays = sanitizeNonNegative(values.workingDays);
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

  const plan = createPlan({
    name,
    quarter,
    year,
    estimationType,
    resourceGroupingType,
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
  appState.plans.push(plan);
  appState.lastSelectedPlanId = plan.id;
  appState.activeTab = "capacity";
  refs.createPlanDialog.close();
  await persistAndRender("Plan created.", "success");
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
  const prevRow =
    plan.capacityRows.length > 0 ? plan.capacityRows[plan.capacityRows.length - 1] : null;
  const newRow = createCapacityRow(plan.periods);
  if (prevRow) {
    for (const period of plan.periods) {
      const from = prevRow.periodValues[period.id];
      const to = newRow.periodValues[period.id];
      if (from && to) {
        to.workingDays = from.workingDays;
      }
    }
    recomputeCapacityRow(newRow, plan.periods, estimationType);
  }
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

function openDeleteConfirmDialog(message, onConfirm) {
  refs.deleteConfirmText.textContent = message;
  pendingDeleteAction = onConfirm;
  refs.deleteConfirmDialog.showModal();
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

function openBulkLoadDialog() {
  refs.bulkLoadPercentInput.value = "100";
  refs.bulkLoadDialog.showModal();
}

async function submitBulkLoad(event) {
  event.preventDefault();
  const action = event.submitter?.value || "cancel";
  refs.bulkLoadDialog.close();
  if (action !== "apply") {
    return;
  }

  const plan = getActivePlan();
  if (!plan) {
    return;
  }

  const loadPercent = sanitizeLoadPercent(refs.bulkLoadPercentInput.value);
  plan.capacityRows.forEach((row) => {
    row.loadPercent = loadPercent;
    recomputeCapacityRow(row, plan.periods, getPlanEstimationType(plan));
  });
  touchPlan(plan);
  await persistAndRender("Load (%) updated for all rows.", "success");
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

  if (action === "bulk-load-percent") {
    openBulkLoadDialog();
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
    openDeleteConfirmDialog(`Delete quarter ${removedPeriodLabel}?`, async () => {
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
      touchPlan(activePlan);
      await persistAndRender(`Quarter ${removedPeriod.label} removed.`, "success");
    });
  }
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
    const row = plan.capacityRows.find((entry) => entry.id === rowId);
    if (!row) {
      return;
    }

    if (field === "memberName" || field === "role" || field === "specialization") {
      row[field] = target.value;
    } else if (field === "loadPercent") {
      row.loadPercent = sanitizeLoadPercent(target.value);
    } else if (periodId && (field === "daysOff" || field === "workingDays" || field === "rowEstimationPerDay")) {
      row.periodValues[periodId][field] =
        field === "rowEstimationPerDay" ? sanitizeOptionalNonNegative(target.value) : sanitizeNonNegative(target.value);
    }

    recomputeCapacityRow(row, plan.periods, getPlanEstimationType(plan));
    if (field === "role" && regroupCapacityRowsByRole(plan)) {
      touchPlan(plan);
    }
  }

  if (section === "backlog") {
    const row = plan.backlogRows.find((entry) => entry.id === rowId);
    if (!row || field === "source") {
      return;
    }
    row[field] = target.value;
  }

  touchPlan(plan);
  const isTextInput = target instanceof HTMLInputElement && target.type === "text";
  const isSelectInput = target instanceof HTMLSelectElement;
  const shouldRenderForRoleGrouping = field === "role" && getPlanResourceGroupingType(plan) === "by_roles";

  if (isTextInput || (isSelectInput && field !== "loadPercent" && !shouldRenderForRoleGrouping)) {
    await saveState(appState);
    return;
  }

  await persistAndRender();
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
  const baseUrlChanged = String(plan.jiraBaseUrl || "") !== draftBaseUrl;
  const fieldChanged = String(plan.estimationFieldName || "") !== draftField;
  if (String(plan.lastImportJql || "") === draftJql && !baseUrlChanged && !fieldChanged) {
    return;
  }
  plan.lastImportJql = draftJql;
  plan.jiraBaseUrl = draftBaseUrl;
  plan.estimationFieldName = draftField;
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
  if (getPlanEstimationType(plan) === "story_points" && !rawField) {
    refs.importJiraEstimationFieldInput?.classList.add("input-invalid");
    refs.importJiraEstimationFieldInput?.focus();
    syncImportButtonState();
    setMessage("Enter Jira Story Points field id for import.", "error");
    return;
  }
  refs.importJiraEstimationFieldInput?.classList.remove("input-invalid");

  const estimationFieldName = resolveImportEstimationFieldName(plan, rawField);
  plan.jiraBaseUrl = jiraBaseUrl;
  plan.lastImportJql = jql;
  plan.estimationFieldName = rawField;
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
      searchMethod: imported?.meta?.searchMethod || "unknown",
      stats: importStats,
      sample: importedRows.slice(0, 5)
    });

    setImportProgress(80);
    refs.issuesCount.textContent = String(importedRows.length);

    const byKey = new Map();
    plan.backlogRows.forEach((row) => {
      const normalizedExistingKey = normalizeBacklogIssueKey(row.key);
      if (normalizedExistingKey) {
        if (row.key !== normalizedExistingKey) {
          row.key = normalizedExistingKey;
        }
        byKey.set(normalizedExistingKey, row);
      }
    });

    importedRows.forEach((jiraRow, index) => {
      const normalizedImportedKey = normalizeBacklogIssueKey(jiraRow.key);
      const existing = normalizedImportedKey ? byKey.get(normalizedImportedKey) : null;
      if (existing) {
        existing.key = normalizedImportedKey;
        existing.summary = jiraRow.summary;
        existing.status = jiraRow.status;
        existing.issueType = jiraRow.issueType;
        existing.priority = jiraRow.priority;
        existing.estimation = jiraRow.estimation;
        existing.source = "jira";
      } else {
        plan.backlogRows.push(createBacklogRow({
          ...jiraRow,
          key: normalizedImportedKey
        }));
      }
      if (importedRows.length > 0) {
        const mergeProgress = 80 + Math.round(((index + 1) / importedRows.length) * 16);
        setImportProgress(mergeProgress);
      }
    });

    plan.backlogEntryMode = "import";
    touchPlan(plan);
    setImportProgress(100);
    refs.importDialog.close();
    await persistAndRender(`Imported ${importedRows.length} issues.`, "success");
  } catch (error) {
    refs.importProgress.value = 0;
    const message = String(error?.message || "");
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
      setMessage("401/403 from Jira. Re-login in Jira and retry.", "error");
      return;
    }
    if (error?.code === "PARSE") {
      setMessage("Jira responded, but issue table format could not be parsed.", "error");
      return;
    }
    if (message.includes("Authorization error")) {
      setMessage("401/403 from Jira. Re-login in Jira and retry.", "error");
      return;
    }
    setMessage(`Import failed: ${message || "network error"}.`, "error");
  }
}

function openSettingsDialog() {
  renderSettings();
  refs.settingsDialog.showModal();
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
  const result = applySettingsChanges({ plan: activePlan, refs, regroupCapacityRowsByRole, touchPlan });
  if (!result?.ok) {
    if (result?.error) {
      setMessage(result.error, "error");
    }
    return;
  }
  activePlan.defaultWorkingDays = defaultWorkingDays;
  activePlan.capacityRows.forEach((row) => {
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
      submitDeleteConfirm,
      submitBulkRowEstimation,
      submitBulkLoad,
      handleAddCapacityRow,
      handleAddQuarter,
      openImportDialog,
      handleBacklogOverlayAction,
      submitImport,
      handleImportDialogClose,
      handleImportJiraBaseUrlBlur,
      handleSettingsEstimationTypeChange,
      handleCreatePlanEstimationTypeChange,
      syncImportButtonState,
      handleTableInput,
      handleCapacityTableClick,
      handleTeamNameInput,
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
    if (!plan.planningTimeMode) {
      plan.planningTimeMode = PLANNING_TIME_MODE.quarter;
    }
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
    (plan.backlogRows || []).forEach((row) => {
      if (row.targetPeriodId === undefined || row.targetPeriodId === null) {
        row.targetPeriodId = "";
      }
    });
    if (!plan.estimationType) {
      plan.estimationType = appState.estimationType || "story_points";
    }
    if (!plan.resourceGroupingType) {
      plan.resourceGroupingType = appState.resourceGroupingType || "by_team";
    }
    if (typeof plan.jiraBaseUrl !== "string") {
      plan.jiraBaseUrl = String(appState.jiraBaseUrl || "");
    }
    if (typeof plan.estimationFieldName !== "string") {
      plan.estimationFieldName = String(appState.estimationFieldName || "");
    }
    if (typeof plan.lastImportJql !== "string") {
      plan.lastImportJql = "";
    }
    if (typeof plan.defaultWorkingDays !== "number" || Number.isNaN(plan.defaultWorkingDays)) {
      const firstPeriodId = plan.periods?.[0]?.id;
      const inferredWorkingDays = firstPeriodId && plan.capacityRows?.[0]?.periodValues?.[firstPeriodId]
        ? sanitizeNonNegative(plan.capacityRows[0].periodValues[firstPeriodId].workingDays)
        : 0;
      plan.defaultWorkingDays = inferredWorkingDays;
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
