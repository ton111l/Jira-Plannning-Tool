/**
 * Reads default % inputs in lockstep with `.settings-role-row` order.
 * Requires every role to have a value and the sum to equal 100% (±0.02).
 */
export function validateAndCollectDefaultRoleSplitPct(refs) {
  if (!refs.settingsRolesList || !refs.settingsDefaultRoleSplitList) {
    return { ok: true, values: {} };
  }
  const roleRows = refs.settingsRolesList.querySelectorAll(".settings-role-row");
  const values = {};
  let sum = 0;
  for (const row of roleRows) {
    const id = String(row.dataset.roleId || "").trim();
    if (!id) {
      return { ok: false, error: "Invalid role row.", values: {} };
    }
    const inp = refs.settingsDefaultRoleSplitList.querySelector(
      `.settings-default-role-split-input[data-role-id="${id}"]`
    );
    if (!inp) {
      return {
        ok: false,
        error: "Each role needs a default % field. Close Settings and reopen if lists are out of sync.",
        values: {}
      };
    }
    const raw = String(inp.value ?? "").trim();
    if (raw === "") {
      return {
        ok: false,
        error: "Enter default % for every role. The values must sum to 100%.",
        values: {}
      };
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Each default % must be a valid non-negative number.", values: {} };
    }
    values[id] = n;
    sum += n;
  }
  if (roleRows.length === 0) {
    return { ok: true, values: {} };
  }
  if (Math.abs(sum - 100) > 0.02) {
    return {
      ok: false,
      error: `Default % by roles must sum to 100% (currently ${sum.toFixed(2)}%).`,
      values: {}
    };
  }
  return { ok: true, values };
}

export function collectSettingsRoleOptions(refs) {
  if (refs.settingsRolesSection?.hidden || !refs.settingsRolesList) {
    return { ok: true, options: null };
  }
  const list = refs.settingsRolesList;
  const rows = list.querySelectorAll(".settings-role-row");
  if (rows.length === 0) {
    return { ok: false, error: "Add at least one role." };
  }
  const seen = [];
  const options = [];
  for (const row of rows) {
    const id = String(row.dataset.roleId || "").trim();
    const label = String(row.querySelector(".settings-role-label")?.value || "").trim();
    if (!label) {
      return { ok: false, error: "Each role must have a name. Remove empty rows or fill them in." };
    }
    if (!id) {
      return { ok: false, error: "Invalid role row." };
    }
    const lower = label.toLowerCase();
    if (seen.includes(lower)) {
      return { ok: false, error: "Role names must be unique." };
    }
    seen.push(lower);
    options.push({ id, label });
  }
  return { ok: true, options };
}

function applyRoleOptionsFromCollect(plan, options) {
  if (!options?.length) {
    return;
  }
  const idSet = new Set(options.map((o) => o.id));
  plan.roleOptions = options.map((o) => ({ id: o.id, label: o.label }));
  for (const row of plan.capacityRows || []) {
    if (row.roleId && !idSet.has(row.roleId)) {
      row.roleId = "";
    }
  }
}

export function applySettingsChanges({
  plan,
  refs,
  regroupCapacityRowsByRole,
  touchPlan
}) {
  if (!plan) {
    return { ok: false };
  }

  const roleCollect = collectSettingsRoleOptions(refs);
  if (!roleCollect.ok) {
    return { ok: false, error: roleCollect.error };
  }

  plan.estimationType = refs.estimationTypeSelect.value || "story_points";
  plan.resourceGroupingType = refs.resourceGroupingTypeSelect.value || "by_roles";
  if (plan.estimationType === "story_points") {
    const selectedMode = refs.settingsTeamEstimationModeSelect.value === "manual" ? "manual" : "average";
    const rawValue = String(refs.settingsTeamEstimationValueInput.value || "").trim();
    if (selectedMode === "manual") {
      const numericValue = Number(rawValue);
      if (rawValue === "" || !Number.isFinite(numericValue) || numericValue < 0) {
        return { ok: false, error: "Enter Team value or switch to Team average." };
      }
    }
    if (!plan.teamPeriodValues || typeof plan.teamPeriodValues !== "object") {
      plan.teamPeriodValues = {};
    }
    plan.periods.forEach((period) => {
      if (!plan.teamPeriodValues[period.id]) {
        plan.teamPeriodValues[period.id] = { teamEstimationMode: "average", teamEstimationPerDay: "" };
      }
      plan.teamPeriodValues[period.id].teamEstimationMode = selectedMode;
      plan.teamPeriodValues[period.id].teamEstimationPerDay = selectedMode === "manual" ? rawValue : "";
    });
  } else if (plan.teamPeriodValues && typeof plan.teamPeriodValues === "object") {
    plan.periods.forEach((period) => {
      if (!plan.teamPeriodValues[period.id]) {
        plan.teamPeriodValues[period.id] = { teamEstimationMode: "average", teamEstimationPerDay: "" };
      }
      plan.teamPeriodValues[period.id].teamEstimationMode = "average";
      plan.teamPeriodValues[period.id].teamEstimationPerDay = "";
    });
  }

  if (roleCollect.options) {
    applyRoleOptionsFromCollect(plan, roleCollect.options);
  }

  if (plan.resourceGroupingType === "by_roles") {
    if (regroupCapacityRowsByRole(plan)) {
      touchPlan(plan);
    }
  }
  const saveDefaultRoleSplit =
    plan.estimationType === "story_points" &&
    (plan.resourceGroupingType === "by_roles" || plan.resourceGroupingType === "by_member");
  if (saveDefaultRoleSplit) {
    const splitResult = validateAndCollectDefaultRoleSplitPct(refs);
    if (!splitResult.ok) {
      return { ok: false, error: splitResult.error };
    }
    plan.defaultRoleSplitPctByRoleId = splitResult.values;
  } else if (!plan.defaultRoleSplitPctByRoleId || typeof plan.defaultRoleSplitPctByRoleId !== "object") {
    plan.defaultRoleSplitPctByRoleId = {};
  }
  touchPlan(plan);
  return { ok: true };
}
