import { createDefaultRoleOptions, generateId } from "../models.js";

function mergeLegacyRoleLabel(rolePart, specPart) {
  const r = String(rolePart || "").trim();
  const s = String(specPart || "").trim();
  if (r && s) {
    return `${r} — ${s}`;
  }
  if (s) {
    return s;
  }
  if (r) {
    return r;
  }
  return "";
}

/**
 * Resolve grouping / metrics key: stable label for roleId, or empty string.
 */
export function getCapacityRoleKey(plan, row) {
  if (!row?.roleId) {
    return "";
  }
  const opt = plan?.roleOptions?.find((o) => o.id === row.roleId);
  return opt ? opt.label : "";
}

export function getRoleOrderIndex(plan, row) {
  const ids = (plan?.roleOptions || []).map((o) => o.id);
  const idx = ids.indexOf(row?.roleId || "");
  return idx === -1 ? ids.length : idx;
}

/**
 * Migration from legacy `role` + `specialization` to plan.roleOptions + row.roleId.
 */
export function migrateLegacyRolesToCatalog(plan) {
  if (!plan || !Array.isArray(plan.capacityRows)) {
    return;
  }
  if (!Array.isArray(plan.roleOptions)) {
    plan.roleOptions = [];
  }

  const rows = plan.capacityRows;

  if (plan.roleOptions.length === 0) {
    plan.roleOptions = createDefaultRoleOptions();
  }

  const labelToId = new Map();
  for (const opt of plan.roleOptions) {
    if (opt?.id && opt?.label) {
      labelToId.set(opt.label, opt.id);
    }
  }

  for (const row of rows) {
    if (row.roleId && plan.roleOptions.some((o) => o.id === row.roleId)) {
      delete row.role;
      delete row.specialization;
      continue;
    }

    const merged = mergeLegacyRoleLabel(row.role, row.specialization);
    if (!merged) {
      row.roleId = "";
      delete row.role;
      delete row.specialization;
      continue;
    }

    let id = labelToId.get(merged);
    if (!id) {
      const existing = plan.roleOptions.find((o) => o.label === merged);
      if (existing) {
        id = existing.id;
      } else {
        id = generateId("role_opt");
        plan.roleOptions.push({ id, label: merged });
      }
      labelToId.set(merged, id);
    }
    row.roleId = id;
    delete row.role;
    delete row.specialization;
  }
}
