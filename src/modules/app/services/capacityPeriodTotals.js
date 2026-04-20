import { sanitizeNonNegative, toNumber } from "../../calculations.js";
import { sumPlannedForPeriod, sumPlannedForRoleGroup } from "./backlogDemand.js";
import {
  buildPeriodMetrics,
  buildRoleGroupMeta,
  computeStoryPointsTeamAvailableBalance
} from "./metrics.js";
import { asNumber } from "../render/shared/backlogHelpers.js";

function buffersFactorFromPlan(plan) {
  if (!plan?.useBuffers) {
    return 1;
  }
  return Math.max(0, 1 - sanitizeNonNegative(plan.allBuffersPercent ?? 0) / 100);
}

function calculateRemainingMember(estimationType, periodValues, rowEstimationPerDayValue) {
  const supplyMember =
    estimationType === "story_points"
      ? rowEstimationPerDayValue === "" || rowEstimationPerDayValue == null
        ? 0
        : Number(
            (sanitizeNonNegative(periodValues.availableCapacity) *
              sanitizeNonNegative(rowEstimationPerDayValue)).toFixed(2)
          )
      : periodValues.availableBalance ?? periodValues.plannedCapacity ?? 0;
  const plannedMember = asNumber(periodValues.plannedEstimation);
  return supplyMember === "" || supplyMember === undefined
    ? ""
    : Number((sanitizeNonNegative(supplyMember) - plannedMember).toFixed(2));
}

/**
 * Plan-level planned sum and comparable balance total per period (summary strip).
 * Sprint slices: balance is null because the capacity grid omits planned/balance columns.
 *
 * @param {object} plan
 * @param {string} estimationType
 * @param {string} resourceGroupingType
 * @returns {Array<{ periodId: string, label: string, planned: number, balance: number | null }>}
 */
export function getCapacityPlanPeriodTotals(plan, estimationType, resourceGroupingType) {
  if (!plan?.periods?.length || !plan.capacityRows?.length) {
    return [];
  }
  const buffersFactor = buffersFactorFromPlan(plan);
  const isByRoles = resourceGroupingType === "by_roles";
  const { periodTeamMetrics, periodRoleMetrics } = buildPeriodMetrics({
    plan,
    estimationType,
    teamPeriodValues: plan.teamPeriodValues,
    isByRolesGrouping: isByRoles
  });
  const { roleGroups } = isByRoles
    ? buildRoleGroupMeta(plan.capacityRows, true, plan)
    : { roleGroups: [] };

  return plan.periods.map((period) => {
    const label = period.label || period.id;
    const isSprint = period.kind === "sprint";
    const planned = sumPlannedForPeriod(plan, period.id);

    if (isSprint) {
      return { periodId: period.id, label, planned, balance: null };
    }

    if (isByRoles) {
      let totalBalance = 0;
      for (const group of roleGroups) {
        const idx = group.startIndex;
        const span = group.span;
        const roleKey = group.roleKey;
        const plannedG = sumPlannedForRoleGroup(plan, period.id, idx, span);
        const roleGroupedMetrics = periodRoleMetrics[period.id]?.[roleKey];
        let b;
        if (estimationType === "story_points") {
          b = computeStoryPointsTeamAvailableBalance({
            availableCapacityTotal: roleGroupedMetrics?.availableCapacityTotal ?? 0,
            estimationTeamValue: roleGroupedMetrics?.estimationTeamValue,
            plannedTotal: plannedG,
            buffersFactor
          });
        } else {
          b = Number(
            plan.capacityRows.slice(idx, idx + span).reduce((sum, memberRow) => {
              const memberValues = memberRow.periodValues?.[period.id];
              if (!memberValues) {
                return sum;
              }
              const memberEstimationPerDay =
                memberValues.rowEstimationPerDay ?? memberValues.estimationPerDay ?? "";
              const memberRemaining = calculateRemainingMember(
                estimationType,
                memberValues,
                memberEstimationPerDay
              );
              if (memberRemaining === "" || memberRemaining === undefined) {
                return sum;
              }
              return sum + Number((toNumber(memberRemaining, 0) * buffersFactor).toFixed(2));
            }, 0).toFixed(2)
          );
        }
        totalBalance += toNumber(b, 0);
      }
      return { periodId: period.id, label, planned, balance: Number(totalBalance.toFixed(2)) };
    }

    if (estimationType === "story_points" && resourceGroupingType === "by_member") {
      let totalBalance = 0;
      for (const memberRow of plan.capacityRows) {
        const memberValues = memberRow.periodValues?.[period.id];
        if (!memberValues) {
          continue;
        }
        const memberEstimationPerDay =
          memberValues.rowEstimationPerDay ?? memberValues.estimationPerDay ?? "";
        const raw = calculateRemainingMember(estimationType, memberValues, memberEstimationPerDay);
        if (raw === "" || raw === undefined) {
          continue;
        }
        totalBalance += Number((toNumber(raw, 0) * buffersFactor).toFixed(2));
      }
      return { periodId: period.id, label, planned, balance: Number(totalBalance.toFixed(2)) };
    }

    if (estimationType === "story_points") {
      const groupedMetrics = periodTeamMetrics[period.id];
      const balance = computeStoryPointsTeamAvailableBalance({
        availableCapacityTotal: groupedMetrics?.availableCapacityTotal ?? 0,
        estimationTeamValue: groupedMetrics?.estimationTeamValue,
        plannedTotal: planned,
        buffersFactor
      });
      return { periodId: period.id, label, planned, balance };
    }

    const balance = Number(
      plan.capacityRows
        .reduce((sum, memberRow) => {
          const memberValues = memberRow.periodValues?.[period.id];
          if (!memberValues) {
            return sum;
          }
          const memberEstimationPerDay =
            memberValues.rowEstimationPerDay ?? memberValues.estimationPerDay ?? "";
          const memberRemaining = calculateRemainingMember(
            estimationType,
            memberValues,
            memberEstimationPerDay
          );
          if (memberRemaining === "" || memberRemaining === undefined) {
            return sum;
          }
          return sum + Number((toNumber(memberRemaining, 0) * buffersFactor).toFixed(2));
        }, 0)
        .toFixed(2)
    );
    return { periodId: period.id, label, planned, balance };
  });
}
