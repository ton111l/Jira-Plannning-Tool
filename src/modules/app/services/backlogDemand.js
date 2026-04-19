import { createEmptyCapacityPeriodValues } from "../../models.js";
import { getCapacityRoleKey } from "../roleCatalog.js";
import { roleToFieldSuffix } from "../render/shared/backlogHelpers.js";

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function getBacklogRowPeriodId(row, plan) {
  const periods = plan?.periods || [];
  if (!periods.length) {
    return "";
  }
  const t = row?.targetPeriodId;
  return t && periods.some((p) => p.id === t) ? t : "";
}

/** Effective demand for one backlog row in By team mode (estimation × team allocation %). */
export function getTeamModeEffectiveDemand(row) {
  const est = asNumber(row?.estimation);
  const alloc =
    row?.teamAllocationPercent === "" || row?.teamAllocationPercent === undefined
      ? 100
      : asNumber(row.teamAllocationPercent);
  return Number(((est * alloc) / 100).toFixed(4));
}

/**
 * Writes `plannedEstimation` on each capacity row per period from backlog demand.
 * By team: total effective demand split evenly across members.
 * By roles: per-role demand split across capacity rows with that role.
 * By member: each backlog row’s full estimation is added to the selected capacity row (`targetCapacityRowId`) for that period.
 */
export function applyPlannedFromBacklog(plan, resourceGroupingType) {
  if (!plan?.periods?.length || !plan.capacityRows?.length) {
    return;
  }

  const isByRoles = resourceGroupingType === "by_roles";
  const isByMember = resourceGroupingType === "by_member";
  const roleLabels = (plan.roleOptions || []).map((o) => o.label).filter(Boolean);

  for (const row of plan.capacityRows) {
    for (const period of plan.periods) {
      if (!row.periodValues[period.id]) {
        row.periodValues[period.id] = createEmptyCapacityPeriodValues();
      }
      row.periodValues[period.id].plannedEstimation = "";
    }
  }

  for (const period of plan.periods) {
    if (isByRoles) {
      const demandByRole = new Map();
      for (const label of roleLabels) {
        demandByRole.set(label, 0);
      }
      for (const brow of plan.backlogRows || []) {
        if (getBacklogRowPeriodId(brow, plan) !== period.id) {
          continue;
        }
        const base = asNumber(brow.estimation);
        for (const label of roleLabels) {
          const suffix = roleToFieldSuffix(label);
          const splitField = `split_${suffix}_pct`;
          const pct = asNumber(brow[splitField]);
          const part = (base * pct) / 100;
          demandByRole.set(label, (demandByRole.get(label) || 0) + part);
        }
      }
      for (const [roleKey, amount] of demandByRole) {
        const indices = [];
        plan.capacityRows.forEach((crow, i) => {
          if (getCapacityRoleKey(plan, crow) === roleKey) {
            indices.push(i);
          }
        });
        if (!indices.length || amount <= 0) {
          continue;
        }
        const share = Number((amount / indices.length).toFixed(2));
        for (const i of indices) {
          const crow = plan.capacityRows[i];
          crow.periodValues[period.id].plannedEstimation = String(share);
        }
      }
    } else if (isByMember) {
      const totalsByCapacityRowId = new Map();
      for (const brow of plan.backlogRows || []) {
        if (getBacklogRowPeriodId(brow, plan) !== period.id) {
          continue;
        }
        const tid = String(brow.targetCapacityRowId ?? "").trim();
        if (!tid || !plan.capacityRows.some((r) => r.id === tid)) {
          continue;
        }
        const add = asNumber(brow.estimation);
        totalsByCapacityRowId.set(tid, (totalsByCapacityRowId.get(tid) || 0) + add);
      }
      for (const crow of plan.capacityRows) {
        const t = totalsByCapacityRowId.get(crow.id);
        if (t === undefined || t <= 0) {
          crow.periodValues[period.id].plannedEstimation = "";
        } else {
          crow.periodValues[period.id].plannedEstimation = String(Number(t.toFixed(2)));
        }
      }
    } else {
      let total = 0;
      for (const brow of plan.backlogRows || []) {
        if (getBacklogRowPeriodId(brow, plan) !== period.id) {
          continue;
        }
        total += getTeamModeEffectiveDemand(brow);
      }
      const totalRounded = Number(total.toFixed(2));
      const n = plan.capacityRows.length;
      if (n <= 0) {
        continue;
      }
      const each = Number((totalRounded / n).toFixed(2));
      for (const crow of plan.capacityRows) {
        crow.periodValues[period.id].plannedEstimation = String(each);
      }
    }
  }
}

export function sumPlannedForPeriod(plan, periodId) {
  if (!plan?.capacityRows?.length) {
    return 0;
  }
  const sum = plan.capacityRows.reduce((acc, row) => {
    return acc + asNumber(row.periodValues?.[periodId]?.plannedEstimation);
  }, 0);
  return Number(sum.toFixed(2));
}

/** Sum planned backlog demand for a contiguous block of capacity rows (one role group). */
export function sumPlannedForRoleGroup(plan, periodId, startRowIndex, rowCount) {
  let s = 0;
  for (let i = 0; i < rowCount; i += 1) {
    const row = plan.capacityRows[startRowIndex + i];
    s += asNumber(row?.periodValues?.[periodId]?.plannedEstimation);
  }
  return Number(s.toFixed(2));
}
