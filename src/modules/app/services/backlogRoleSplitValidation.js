import {
  asNumber,
  getBacklogEstimationNumericForPlan,
  roleToFieldSuffix
} from "../render/shared/backlogHelpers.js";

/** @param {{ roleOptions?: { label?: string }[] }} [plan] */
export function roleLabelsFromPlan(plan) {
  return (plan?.roleOptions || []).map((o) => o?.label).filter((l) => String(l || "").trim() !== "");
}

/**
 * Writes `role_estimation_*` from epic estimate × split% (two decimals), same as backlog table UI.
 * @param {object} row
 * @param {object} plan
 */
export function syncBacklogRowRoleEstimationsFromSplits(row, plan) {
  const epic = getBacklogEstimationNumericForPlan(row, plan);
  for (const label of roleLabelsFromPlan(plan)) {
    const splitField = `split_${roleToFieldSuffix(label)}_pct`;
    const estimationField = `role_estimation_${roleToFieldSuffix(label)}`;
    const pct = asNumber(row[splitField]);
    const v = (epic * pct) / 100;
    row[estimationField] = v ? String(Number(v.toFixed(2))) : "";
  }
}

/**
 * Sets one `split_*_pct` from edited `role_estimation_*` and epic total (by_roles).
 * @param {object} row
 * @param {object} plan
 * @param {string} estimationField e.g. `role_estimation_developer`
 */
export function syncSplitPctFromRoleEstimationField(row, plan, estimationField) {
  const f = String(estimationField || "");
  if (!f.startsWith("role_estimation_")) {
    return;
  }
  const epic = getBacklogEstimationNumericForPlan(row, plan);
  const suffix = f.slice("role_estimation_".length);
  const splitField = `split_${suffix}_pct`;
  const sp = asNumber(row[f]);
  if (epic <= 0) {
    row[splitField] = sp > 0 ? "0" : "";
    return;
  }
  row[splitField] = String(Number(((sp / epic) * 100).toFixed(2)));
}

/**
 * @returns {{ splitOver100: boolean, pointsOverEpic: boolean, splitSum: number, ptsSum: number, epic: number }}
 */
/** Count backlog rows with split total over 100% or role points over epic (by_roles / by_member). */
export function countBacklogRowsWithInvalidRoleSplits(plan) {
  if (!plan?.backlogRows?.length) {
    return 0;
  }
  const rg = plan.resourceGroupingType;
  if (rg !== "by_roles" && rg !== "by_member") {
    return 0;
  }
  let n = 0;
  for (const row of plan.backlogRows) {
    const v = getBacklogRowRoleSplitValidity(row, plan);
    if (v.splitOver100 || v.pointsOverEpic) {
      n += 1;
    }
  }
  return n;
}

export function getBacklogRowRoleSplitValidity(row, plan) {
  const epic = getBacklogEstimationNumericForPlan(row, plan);
  let splitSum = 0;
  let ptsSum = 0;
  for (const label of roleLabelsFromPlan(plan)) {
    const splitField = `split_${roleToFieldSuffix(label)}_pct`;
    const estimationField = `role_estimation_${roleToFieldSuffix(label)}`;
    splitSum += asNumber(row[splitField]);
    ptsSum += asNumber(row[estimationField]);
  }
  const splitOver100 = splitSum > 100 + 1e-6;
  const pointsOverEpic = epic > 0 ? ptsSum > epic + 0.01 : ptsSum > 0.01;
  return { splitOver100, pointsOverEpic, splitSum, ptsSum, epic };
}

function formatTooltipNumber(n) {
  if (n === undefined || n === null || !Number.isFinite(Number(n))) {
    return "0";
  }
  const x = Number(n);
  if (Number.isInteger(x)) {
    return String(x);
  }
  const s = x.toFixed(2);
  return s.replace(/\.?0+$/, "");
}

/**
 * English native tooltip text for invalid by_roles split / role SP cells.
 * @param {{ splitOver100: boolean, pointsOverEpic: boolean, splitSum: number, ptsSum: number, epic: number }} v
 */
export function getBacklogRoleSplitInvalidTooltip(v) {
  if (!v.splitOver100 && !v.pointsOverEpic) {
    return "";
  }
  const parts = [];
  if (v.splitOver100) {
    parts.push(
      `Split % total is ${formatTooltipNumber(v.splitSum)}% (must not exceed 100%).`
    );
  }
  if (v.pointsOverEpic) {
    parts.push(
      `Sum of role story points (${formatTooltipNumber(v.ptsSum)}) exceeds the epic estimate (${formatTooltipNumber(v.epic)}).`
    );
  }
  return parts.join(" ");
}

/**
 * Updates per-role split / story point inputs, invalid-row class, and tooltips (by_roles).
 * @param {{ skipSplitField?: string, skipEstimationField?: string }} [opts] Skip syncing the focused input while typing (deferred `input`).
 */
export function refreshBacklogRoleSplitRowDom(tr, row, plan, opts = {}) {
  const skipSplit = opts.skipSplitField || "";
  const skipEst = opts.skipEstimationField || "";

  for (const label of roleLabelsFromPlan(plan)) {
    const splitField = `split_${roleToFieldSuffix(label)}_pct`;
    const estimationField = `role_estimation_${roleToFieldSuffix(label)}`;
    const splitInput = tr.querySelector(`input.cell-input[data-field="${splitField}"]`);
    const estInput = tr.querySelector(`input.cell-input[data-field="${estimationField}"]`);
    if (splitInput instanceof HTMLInputElement && splitField !== skipSplit) {
      splitInput.value = row[splitField] ?? "";
    }
    if (estInput instanceof HTMLInputElement && estimationField !== skipEst) {
      estInput.value = row[estimationField] ?? "";
    }
  }

  const v = getBacklogRowRoleSplitValidity(row, plan);
  const invalid = v.splitOver100 || v.pointsOverEpic;
  tr.classList.toggle("backlog-row-role-invalid", invalid);
  const tip = invalid ? getBacklogRoleSplitInvalidTooltip(v) : "";
  for (const label of roleLabelsFromPlan(plan)) {
    const splitField = `split_${roleToFieldSuffix(label)}_pct`;
    const estimationField = `role_estimation_${roleToFieldSuffix(label)}`;
    const splitInput = tr.querySelector(`input.cell-input[data-field="${splitField}"]`);
    const estInput = tr.querySelector(`input.cell-input[data-field="${estimationField}"]`);
    if (splitInput instanceof HTMLInputElement) {
      splitInput.title = tip;
    }
    if (estInput instanceof HTMLInputElement) {
      estInput.title = tip;
    }
  }
}
