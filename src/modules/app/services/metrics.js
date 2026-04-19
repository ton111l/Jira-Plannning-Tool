import { sanitizeLoadPercent, sanitizeNonNegative, toNumber } from "../../calculations.js";
import { getCapacityRoleKey } from "../roleCatalog.js";

function safePeriodValues(row, periodId) {
  return row?.periodValues?.[periodId] || {};
}

export function buildRoleGroupMeta(capacityRows = [], isByRolesGrouping = false, plan = null) {
  if (!isByRolesGrouping) {
    return { roleGroups: [], rowGroupMetaByRowId: {} };
  }

  const roleGroups = [];
  const rowGroupMetaByRowId = {};
  let groupStart = 0;

  while (groupStart < capacityRows.length) {
    const startRole = getCapacityRoleKey(plan, capacityRows[groupStart]);
    let groupEnd = groupStart;
    while (
      groupEnd + 1 < capacityRows.length &&
      getCapacityRoleKey(plan, capacityRows[groupEnd + 1]) === startRole
    ) {
      groupEnd += 1;
    }
    const group = {
      roleKey: startRole,
      startIndex: groupStart,
      endIndex: groupEnd,
      span: groupEnd - groupStart + 1
    };
    roleGroups.push(group);
    for (let idx = groupStart; idx <= groupEnd; idx += 1) {
      rowGroupMetaByRowId[capacityRows[idx].id] = {
        roleKey: group.roleKey,
        isGroupStart: idx === group.startIndex,
        span: group.span
      };
    }
    groupStart = groupEnd + 1;
  }

  return { roleGroups, rowGroupMetaByRowId };
}

export function buildPeriodMetrics({
  plan,
  estimationType,
  teamPeriodValues,
  isByRolesGrouping
}) {
  const periodTeamMetrics = {};
  const periodRoleMetrics = {};

  plan.periods.forEach((period) => {
    let availableCapacityTotal = 0;
    let availableBalanceTotal = 0;
    let estimationSum = 0;
    let estimationCount = 0;
    let teamPersonDaysPerDay = 0;
    const roleMetrics = {};

    plan.capacityRows.forEach((row) => {
      const values = safePeriodValues(row, period.id);
      const estimationValue = values.rowEstimationPerDay;

      availableCapacityTotal += sanitizeNonNegative(values.availableCapacity);
      availableBalanceTotal += sanitizeNonNegative(values.availableBalance ?? values.plannedCapacity);
      if (sanitizeNonNegative(values.workingDays) > 0) {
        teamPersonDaysPerDay += sanitizeLoadPercent(row.loadPercent) / 100;
      }
      if (estimationValue !== "" && estimationValue !== null && estimationValue !== undefined) {
        estimationSum += sanitizeNonNegative(estimationValue);
        estimationCount += 1;
      }

      const roleKey = getCapacityRoleKey(plan, row);
      if (!roleMetrics[roleKey]) {
        roleMetrics[roleKey] = {
          availableCapacityTotal: 0,
          availableBalanceTotal: 0,
          estimationSum: 0,
          estimationCount: 0,
          teamPersonDaysPerDay: 0
        };
      }

      roleMetrics[roleKey].availableCapacityTotal += sanitizeNonNegative(values.availableCapacity);
      roleMetrics[roleKey].availableBalanceTotal += sanitizeNonNegative(values.availableBalance ?? values.plannedCapacity);
      if (sanitizeNonNegative(values.workingDays) > 0) {
        roleMetrics[roleKey].teamPersonDaysPerDay += sanitizeLoadPercent(row.loadPercent) / 100;
      }
      if (estimationValue !== "" && estimationValue !== null && estimationValue !== undefined) {
        roleMetrics[roleKey].estimationSum += sanitizeNonNegative(estimationValue);
        roleMetrics[roleKey].estimationCount += 1;
      }
    });

    const teamPeriodValue = teamPeriodValues?.[period.id] || {};
    const teamValueOverride = teamPeriodValue.teamEstimationPerDay;
    const teamMode = teamPeriodValue.teamEstimationMode || "average";
    let estimationTeamValue = "";
    if (estimationType === "person_days") {
      estimationTeamValue = Number(teamPersonDaysPerDay.toFixed(2));
    } else if (teamMode === "manual" && teamValueOverride !== "" && teamValueOverride !== null && teamValueOverride !== undefined) {
      estimationTeamValue = sanitizeNonNegative(teamValueOverride);
    } else if (estimationCount) {
      estimationTeamValue = Number((estimationSum / estimationCount).toFixed(2));
    }

    periodTeamMetrics[period.id] = {
      availableCapacityTotal,
      availableBalanceTotal:
        estimationType === "story_points"
          ? estimationTeamValue === ""
            ? ""
            : Number((availableCapacityTotal * sanitizeNonNegative(estimationTeamValue)).toFixed(2))
          : availableBalanceTotal,
      estimationTeamValue
    };

    periodRoleMetrics[period.id] = {};
    Object.keys(roleMetrics).forEach((roleKey) => {
      const metrics = roleMetrics[roleKey];
      let roleEstimationTeamValue = "";
      if (estimationType === "person_days") {
        roleEstimationTeamValue = Number(metrics.teamPersonDaysPerDay.toFixed(2));
      } else {
        roleEstimationTeamValue = metrics.estimationCount
          ? Number((metrics.estimationSum / metrics.estimationCount).toFixed(2))
          : "";
      }
      periodRoleMetrics[period.id][roleKey] = {
        availableCapacityTotal: metrics.availableCapacityTotal,
        availableBalanceTotal:
          estimationType === "story_points"
            ? roleEstimationTeamValue === ""
              ? ""
              : Number((metrics.availableCapacityTotal * sanitizeNonNegative(roleEstimationTeamValue)).toFixed(2))
            : metrics.availableBalanceTotal,
        estimationTeamValue: roleEstimationTeamValue
      };
    });
  });

  return isByRolesGrouping ? { periodTeamMetrics, periodRoleMetrics } : { periodTeamMetrics, periodRoleMetrics: {} };
}

/**
 * Team-level Available balance for Story Points: (available capacity × SP/day) − planned, then buffer factor.
 */
export function computeStoryPointsTeamAvailableBalance({
  availableCapacityTotal,
  estimationTeamValue,
  plannedTotal,
  buffersFactor = 1
}) {
  const cap = sanitizeNonNegative(availableCapacityTotal);
  const planned = sanitizeNonNegative(plannedTotal);
  let supplySp = 0;
  if (estimationTeamValue !== "" && estimationTeamValue !== null && estimationTeamValue !== undefined) {
    supplySp = Number((cap * sanitizeNonNegative(estimationTeamValue)).toFixed(2));
  }
  const rawBalance = supplySp - planned;
  return Number((toNumber(rawBalance, 0) * sanitizeNonNegative(buffersFactor)).toFixed(2));
}
