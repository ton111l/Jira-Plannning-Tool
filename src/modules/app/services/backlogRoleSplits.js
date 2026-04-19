import { roleToFieldSuffix } from "../render/shared/backlogHelpers.js";

/**
 * Fills empty `split_*_pct` backlog fields from plan.defaultRoleSplitPctByRoleId (by role id).
 * Does not overwrite non-empty splits.
 */
export function applyDefaultRoleSplitsToBacklogRows(plan) {
  if (!plan?.backlogRows?.length || !plan.roleOptions?.length) {
    return;
  }
  if (plan.resourceGroupingType !== "by_roles" && plan.resourceGroupingType !== "by_member") {
    return;
  }
  const defaults = plan.defaultRoleSplitPctByRoleId;
  if (!defaults || typeof defaults !== "object") {
    return;
  }
  for (const brow of plan.backlogRows) {
    for (const opt of plan.roleOptions) {
      if (!opt?.id) {
        continue;
      }
      const field = `split_${roleToFieldSuffix(opt.label)}_pct`;
      const cur = brow[field];
      const isEmpty = cur === undefined || cur === null || String(cur).trim() === "";
      if (!isEmpty) {
        continue;
      }
      const raw = defaults[opt.id];
      if (raw === undefined || raw === null || String(raw).trim() === "") {
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        continue;
      }
      brow[field] = String(n);
    }
  }
}
