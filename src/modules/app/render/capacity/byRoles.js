import { resolveLoadPercentStep, sanitizeNonNegative, toNumber } from "../../../calculations.js";
import { sumPlannedForRoleGroup } from "../../services/backlogDemand.js";
import { buildPeriodMetrics, buildRoleGroupMeta, computeStoryPointsTeamAvailableBalance } from "../../services/metrics.js";
import { asNumber } from "../shared/backlogHelpers.js";
import { setCompactPeriodHeader } from "./headerLabels.js";

export function renderCapacityByRoles({
  refs,
  plan,
  estimationType,
  estimationLabel,
  roleOptions,
  ensureTeamPeriodValues,
  buildCellInput,
  buildRoleSelect,
  buildPercentSelect,
  createEmptyCapacityPeriodValues
}) {
  ensureTeamPeriodValues(plan);
  const isCompact = plan.capacityTableViewMode === "compact";
  const isPersonDays = estimationType === "person_days";
  const getPeriodColumnsCount = (period) => {
    const isSprint = period.kind === "sprint";
    if (isCompact) {
      return isSprint ? 2 : 5;
    }
    if (isSprint) return 4;
    // Full: Planned and Available balance are Role total only (no Per member); SP/day and Available capacity keep Per member + Role total.
    if (isPersonDays) return 7;
    return 8;
  };
  const teamSubLabel = "Role total";
  const stickyHeadClasses = ["capacity-col-idx", "capacity-col-member", "capacity-col-role"];

  // Build sprint-by-anchor map once; used in header rendering
  const sprintsByAnchor = {};
  for (const p of plan.periods) {
    if (p.kind === "sprint") {
      const key = `${p.anchorQuarter}_${p.anchorYear}`;
      if (!sprintsByAnchor[key]) sprintsByAnchor[key] = [];
      sprintsByAnchor[key].push(p);
    }
  }

  const isQuarterSummary = (period) => {
    const isQ = period.kind === "quarter" || !period.kind;
    if (!isQ) return false;
    const key = `${period.anchorQuarter ?? period.quarter}_${period.anchorYear ?? period.year}`;
    return (sprintsByAnchor[key]?.length ?? 0) > 0;
  };

  const thead = document.createElement("thead");
  const estimationTitleForPlanned = estimationLabel ? estimationLabel.toLowerCase() : "estimation";
  const availableBalanceTitle = plan.useBuffers
    ? `Available balance - buffers (${sanitizeNonNegative(plan.allBuffersPercent ?? 0)}%)`
    : "Available balance";
  const buffersFactor = plan.useBuffers
    ? Math.max(0, 1 - sanitizeNonNegative(plan.allBuffersPercent ?? 0) / 100)
    : 1;

  const calculateRemainingMember = (periodValues, rowEstimationPerDayValue) => {
    const supplyMember =
      estimationType === "story_points"
        ? rowEstimationPerDayValue === "" || rowEstimationPerDayValue == null
          ? 0
          : Number((sanitizeNonNegative(periodValues.availableCapacity) * sanitizeNonNegative(rowEstimationPerDayValue)).toFixed(2))
        : periodValues.availableBalance ?? periodValues.plannedCapacity ?? 0;
    const plannedMember = asNumber(periodValues.plannedEstimation);
    return supplyMember === "" || supplyMember === undefined
      ? ""
      : Number((sanitizeNonNegative(supplyMember) - plannedMember).toFixed(2));
  };

  if (isCompact) {
    const topHeadRow = document.createElement("tr");
    const selectAllTh = document.createElement("th");
    selectAllTh.rowSpan = 2;
    selectAllTh.classList.add(stickyHeadClasses[0]);
    const selectAllInput = document.createElement("input");
    selectAllInput.type = "checkbox";
    selectAllInput.setAttribute("aria-label", "Select all capacity rows");
    selectAllInput.dataset.capacitySelect = "all";
    selectAllTh.appendChild(selectAllInput);
    topHeadRow.appendChild(selectAllTh);
    ["Member", "Role"].forEach((title, i) => {
      const th = document.createElement("th");
      th.textContent = title;
      th.rowSpan = 2;
      th.classList.add(stickyHeadClasses[i + 1]);
      topHeadRow.appendChild(th);
    });
    const loadHeadCompact = document.createElement("th");
    loadHeadCompact.rowSpan = 2;
    loadHeadCompact.textContent = "Load (%)";
    loadHeadCompact.classList.add("capacity-col-load");
    topHeadRow.appendChild(loadHeadCompact);

    for (const period of plan.periods) {
      const periodHead = document.createElement("th");
      periodHead.colSpan = 5;
      const isQSummary = isQuarterSummary(period);
      if (isQSummary) periodHead.classList.add("period-head-th--quarter-total");
      const periodHeadWrap = document.createElement("div");
      periodHeadWrap.className = "period-head";
      const periodLabel = document.createElement("span");
      periodLabel.textContent = isQSummary ? `${period.label} (Total)` : period.label;
      periodHeadWrap.appendChild(periodLabel);
      if (!isQSummary) {
        const deletePeriodButton = document.createElement("button");
        deletePeriodButton.type = "button";
        deletePeriodButton.className = "quarter-delete-btn";
        deletePeriodButton.textContent = "×";
        deletePeriodButton.title = `Delete ${period.label}`;
        deletePeriodButton.setAttribute("aria-label", `Delete ${period.label}`);
        deletePeriodButton.dataset.action = "delete-quarter";
        deletePeriodButton.dataset.periodId = period.id;
        periodHeadWrap.appendChild(deletePeriodButton);
      }
      periodHead.appendChild(periodHeadWrap);
      topHeadRow.appendChild(periodHead);
    }
    thead.appendChild(topHeadRow);

    const metricRow = document.createElement("tr");
    for (const period of plan.periods) {
      const isSprint = period.kind === "sprint";

      const working = document.createElement("th");
      working.className = "period-subcol period-subcol-short";
      setCompactPeriodHeader(working, "WD", "Working days");
      metricRow.appendChild(working);

      const available = document.createElement("th");
      available.className = "period-subcol period-subcol-wide";
      setCompactPeriodHeader(available, "Avail", "Available capacity");
      metricRow.appendChild(available);

      if (!isSprint) {
        const estimationPerDay = document.createElement("th");
        estimationPerDay.className = "period-subcol period-subcol-wide";
        const estFull = isPersonDays ? "Man-days per day (Role total)" : `${estimationLabel} per day`;
        setCompactPeriodHeader(estimationPerDay, isPersonDays ? "MD/d" : "SP/d", estFull);
        metricRow.appendChild(estimationPerDay);

        const planned = document.createElement("th");
        planned.className = "period-subcol period-subcol-wide";
        setCompactPeriodHeader(planned, "Plan", `Planned ${estimationTitleForPlanned}`);
        metricRow.appendChild(planned);

        const balance = document.createElement("th");
        balance.className = "period-subcol period-subcol-wide";
        setCompactPeriodHeader(balance, "Bal", availableBalanceTitle);
        metricRow.appendChild(balance);
      }
    }
    thead.appendChild(metricRow);
  } else {
    const topHeadRow = document.createElement("tr");
    const selectAllTh = document.createElement("th");
    selectAllTh.rowSpan = 3;
    selectAllTh.classList.add(stickyHeadClasses[0]);
    const selectAllInput = document.createElement("input");
    selectAllInput.type = "checkbox";
    selectAllInput.setAttribute("aria-label", "Select all capacity rows");
    selectAllInput.dataset.capacitySelect = "all";
    selectAllTh.appendChild(selectAllInput);
    topHeadRow.appendChild(selectAllTh);
    ["Member", "Role"].forEach((title, i) => {
      const th = document.createElement("th");
      th.textContent = title;
      th.rowSpan = 3;
      th.classList.add(stickyHeadClasses[i + 1]);
      topHeadRow.appendChild(th);
    });
    const loadHead = document.createElement("th");
    loadHead.rowSpan = 3;
    loadHead.textContent = "Load (%)";
    loadHead.classList.add("capacity-col-load");
    topHeadRow.appendChild(loadHead);

    for (const period of plan.periods) {
      const periodHead = document.createElement("th");
      periodHead.colSpan = getPeriodColumnsCount(period);
      const isQSummary = isQuarterSummary(period);
      if (isQSummary) periodHead.classList.add("period-head-th--quarter-total");
      const periodHeadWrap = document.createElement("div");
      periodHeadWrap.className = "period-head";
      const periodLabel = document.createElement("span");
      periodLabel.textContent = isQSummary ? `${period.label} (Total)` : period.label;
      periodHeadWrap.appendChild(periodLabel);
      if (!isQSummary) {
        const deletePeriodButton = document.createElement("button");
        deletePeriodButton.type = "button";
        deletePeriodButton.className = "quarter-delete-btn";
        deletePeriodButton.textContent = "×";
        deletePeriodButton.title = `Delete ${period.label}`;
        deletePeriodButton.setAttribute("aria-label", `Delete ${period.label}`);
        deletePeriodButton.dataset.action = "delete-quarter";
        deletePeriodButton.dataset.periodId = period.id;
        periodHeadWrap.appendChild(deletePeriodButton);
      }
      periodHead.appendChild(periodHeadWrap);
      topHeadRow.appendChild(periodHead);
    }
    thead.appendChild(topHeadRow);

    const metricHeadRow = document.createElement("tr");
    const metricSubHeadRow = document.createElement("tr");
    for (const period of plan.periods) {
      const isSprint = period.kind === "sprint";
      const teamMode = plan.teamPeriodValues?.[period.id]?.teamEstimationMode || "average";
      const dayOff = document.createElement("th");
      dayOff.className = "period-subcol period-subcol-short";
      dayOff.rowSpan = 2;
      dayOff.textContent = "Days off";
      const working = document.createElement("th");
      working.className = "period-subcol period-subcol-short";
      working.rowSpan = 2;
      working.textContent = "Working days";

      const available = document.createElement("th");
      available.className = "period-subcol period-subcol-wide";
      available.colSpan = 2;
      available.textContent = "Available capacity";

      if (isSprint) {
        metricHeadRow.append(dayOff, working, available);
      } else {
        const estimationPerDay = document.createElement("th");
        estimationPerDay.className = "period-subcol period-subcol-wide";
        if (isPersonDays) {
          estimationPerDay.colSpan = 1;
          estimationPerDay.rowSpan = 2;
          estimationPerDay.textContent = "Man-days per day (Role total)";
        } else {
          estimationPerDay.colSpan = 2;
          estimationPerDay.textContent = `${estimationLabel} per day`;
        }

        const planned = document.createElement("th");
        planned.className = "period-subcol period-subcol-wide";
        planned.colSpan = 1;
        planned.rowSpan = 2;
        planned.textContent = `Planned ${estimationTitleForPlanned}`;

        const balance = document.createElement("th");
        balance.className = "period-subcol period-subcol-wide";
        balance.colSpan = 1;
        balance.rowSpan = 2;
        balance.textContent = availableBalanceTitle;

        metricHeadRow.append(dayOff, working, available, estimationPerDay, planned, balance);
      }

      const availableMemberSub = document.createElement("th");
      availableMemberSub.className = "period-subcol period-subcol-wide";
      availableMemberSub.textContent = "Per member";
      metricSubHeadRow.appendChild(availableMemberSub);

      const availableTeamSub = document.createElement("th");
      availableTeamSub.className = "period-subcol period-subcol-wide";
      availableTeamSub.textContent = teamSubLabel;
      metricSubHeadRow.appendChild(availableTeamSub);

      if (!isSprint) {
        if (!isPersonDays) {
          const estimationMemberSub = document.createElement("th");
          estimationMemberSub.className = "period-subcol period-subcol-wide";
          const estimationMemberLabel = document.createElement("span");
          estimationMemberLabel.textContent = "Per member";
          if (teamMode === "average") {
            estimationMemberLabel.className = "subcol-selected";
          }
          estimationMemberSub.appendChild(estimationMemberLabel);
          metricSubHeadRow.appendChild(estimationMemberSub);

          const estimationTeamSub = document.createElement("th");
          estimationTeamSub.className = "period-subcol period-subcol-wide";
          const estimationTeamLabel = document.createElement("span");
          estimationTeamLabel.textContent = teamSubLabel;
          if (teamMode === "manual") {
            estimationTeamLabel.className = "subcol-selected";
          }
          estimationTeamSub.appendChild(estimationTeamLabel);
          metricSubHeadRow.appendChild(estimationTeamSub);
        }
      }
    }
    thead.appendChild(metricHeadRow);
    thead.appendChild(metricSubHeadRow);
  }
  refs.capacityTable.appendChild(thead);

  const tbody = document.createElement("tbody");
  if (!plan.capacityRows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    const totalPeriodColumns = plan.periods.reduce((sum, period) => sum + getPeriodColumnsCount(period), 0);
    cell.colSpan = 4 + totalPeriodColumns;
    cell.textContent = "No team members yet. Use + Row.";
    row.appendChild(cell);
    tbody.appendChild(row);
    refs.capacityTable.appendChild(tbody);
    return;
  }

  const { rowGroupMetaByRowId } = buildRoleGroupMeta(plan.capacityRows, true, plan);
  const { periodTeamMetrics, periodRoleMetrics } = buildPeriodMetrics({
    plan,
    estimationType,
    teamPeriodValues: plan.teamPeriodValues,
    isByRolesGrouping: true
  });

  plan.capacityRows.forEach((capacityRow, index) => {
    const tr = document.createElement("tr");
    const rowGroupMeta = rowGroupMetaByRowId[capacityRow.id];
    const isGroupStart = Boolean(rowGroupMeta?.isGroupStart);
    const groupSpan = Number(rowGroupMeta?.span || 1);
    const roleKey = String(rowGroupMeta?.roleKey || "");
    if (isGroupStart && index > 0) {
      tr.classList.add("capacity-role-group-start");
    }

    const selectTd = document.createElement("td");
    selectTd.classList.add("capacity-col-idx");
    const rowCb = document.createElement("input");
    rowCb.type = "checkbox";
    rowCb.setAttribute("aria-label", "Select capacity row");
    rowCb.dataset.capacitySelect = "row";
    rowCb.dataset.rowId = capacityRow.id;
    selectTd.appendChild(rowCb);
    tr.appendChild(selectTd);

    const member = document.createElement("td");
    member.classList.add("capacity-col-member");
    if (!String(capacityRow.memberName ?? "").trim()) {
      member.classList.add("capacity-member-cell--empty");
    }
    member.appendChild(
      buildCellInput({
        value: capacityRow.memberName,
        dataset: { section: "capacity", rowId: capacityRow.id, field: "memberName" },
        placeholder: "Enter member"
      })
    );
    tr.appendChild(member);

    const role = document.createElement("td");
    role.classList.add("capacity-col-role");
    role.appendChild(
      buildRoleSelect({
        value: capacityRow.roleId,
        dataset: { section: "capacity", rowId: capacityRow.id, field: "roleId" },
        roleOptions
      })
    );
    tr.appendChild(role);

    const load = document.createElement("td");
    load.classList.add("capacity-col-load", "capacity-load-cell");
    const loadPct = resolveLoadPercentStep(capacityRow.loadPercent);
    if (loadPct < 100) {
      load.classList.add("capacity-load-cell--reduced");
    }
    load.appendChild(
      buildPercentSelect({
        value: capacityRow.loadPercent,
        dataset: { section: "capacity", rowId: capacityRow.id, field: "loadPercent" }
      })
    );
    tr.appendChild(load);

    for (const period of plan.periods) {
      const isSprint = period.kind === "sprint";
      const isQuarter = period.kind === "quarter" || !period.kind;
      const anchorKey = `${period.anchorQuarter ?? period.quarter}_${period.anchorYear ?? period.year}`;
      const isQuarterWithSprints = isQuarter && (sprintsByAnchor[anchorKey]?.length > 0);
      if (!capacityRow.periodValues[period.id]) {
        capacityRow.periodValues[period.id] = createEmptyCapacityPeriodValues();
      }
      const values = capacityRow.periodValues[period.id];
      const rowEstimationPerDay = values.rowEstimationPerDay ?? values.estimationPerDay ?? "";

      if (!isCompact) {
        const daysOffCell = document.createElement("td");
        daysOffCell.className = "period-value-cell period-value-cell-short";
        daysOffCell.appendChild(
          buildCellInput({
            value: values.daysOff,
            type: "number",
            dataset: { section: "capacity", rowId: capacityRow.id, field: "daysOff", periodId: period.id },
            readOnly: isQuarterWithSprints
          })
        );
        tr.appendChild(daysOffCell);
      }

      const workingCell = document.createElement("td");
      workingCell.className = "period-value-cell period-value-cell-short";
      workingCell.appendChild(
        buildCellInput({
          value: values.workingDays,
          type: "number",
          dataset: { section: "capacity", rowId: capacityRow.id, field: "workingDays", periodId: period.id },
          readOnly: isQuarterWithSprints
        })
      );
      tr.appendChild(workingCell);

      if (!isCompact) {
        const availableCell = document.createElement("td");
        availableCell.className = "period-value-cell period-value-cell-short";
        availableCell.appendChild(
          buildCellInput({
            value: values.availableCapacity,
            dataset: { section: "capacity", rowId: capacityRow.id, field: "availableCapacity", periodId: period.id },
            readOnly: true
          })
        );
        tr.appendChild(availableCell);
      }

      if (isGroupStart) {
        const groupedMetrics = periodRoleMetrics[period.id]?.[roleKey] || periodTeamMetrics[period.id];
        const availableTeamCell = document.createElement("td");
        availableTeamCell.className = "period-value-cell period-value-cell-short";
        availableTeamCell.rowSpan = groupSpan;
        availableTeamCell.appendChild(
          buildCellInput({
            value: groupedMetrics?.availableCapacityTotal ?? 0,
            dataset: { section: "capacity", rowId: capacityRow.id, field: "availableCapacityTeam", periodId: period.id },
            readOnly: true
          })
        );
        tr.appendChild(availableTeamCell);
      }

      if (!isSprint) {
        if (isPersonDays) {
          if (isGroupStart) {
            const groupedMetrics = periodRoleMetrics[period.id]?.[roleKey] || periodTeamMetrics[period.id];
            const estimationPerDayTeamOnlyCell = document.createElement("td");
            estimationPerDayTeamOnlyCell.className = "period-value-cell period-value-cell-wide";
            estimationPerDayTeamOnlyCell.rowSpan = groupSpan;
            estimationPerDayTeamOnlyCell.appendChild(
              buildCellInput({
                value: groupedMetrics?.estimationTeamValue ?? "",
                dataset: { section: "capacity", rowId: capacityRow.id, field: "rowEstimationPerDayTeam", periodId: period.id },
                readOnly: true
              })
            );
            tr.appendChild(estimationPerDayTeamOnlyCell);
          }
        } else {
          if (!isCompact) {
            const estimationPerDayCell = document.createElement("td");
            estimationPerDayCell.className = "period-value-cell period-value-cell-wide";
            estimationPerDayCell.appendChild(
              buildCellInput({
                value: rowEstimationPerDay,
                type: "number",
                dataset: { section: "capacity", rowId: capacityRow.id, field: "rowEstimationPerDay", periodId: period.id }
              })
            );
            tr.appendChild(estimationPerDayCell);
          }

          if (isGroupStart) {
            const groupedMetrics = periodRoleMetrics[period.id]?.[roleKey] || periodTeamMetrics[period.id];
            const estimationPerDayTeamCell = document.createElement("td");
            estimationPerDayTeamCell.className = "period-value-cell period-value-cell-wide";
            estimationPerDayTeamCell.rowSpan = groupSpan;
            const teamEstInput = buildCellInput({
              value: groupedMetrics?.estimationTeamValue ?? "",
              type: "number",
              dataset: { section: "capacity", rowId: capacityRow.id, field: "rowEstimationPerDayTeam", periodId: period.id },
              readOnly: false
            });
            teamEstInput.title =
              "Role total Story Points per day for this period. Saving switches from team average to this value.";
            estimationPerDayTeamCell.appendChild(teamEstInput);
            tr.appendChild(estimationPerDayTeamCell);
          }
        }
      }

      if (isGroupStart && !isSprint) {
        const plannedTeamCell = document.createElement("td");
        plannedTeamCell.className = "period-value-cell period-value-cell-wide";
        plannedTeamCell.rowSpan = groupSpan;
        plannedTeamCell.appendChild(
          buildCellInput({
            value: String(sumPlannedForRoleGroup(plan, period.id, index, groupSpan)),
            dataset: { section: "capacity", rowId: capacityRow.id, field: "plannedEstimationTeam", periodId: period.id },
            readOnly: true
          })
        );
        tr.appendChild(plannedTeamCell);

        const roleGroupedMetrics = periodRoleMetrics[period.id]?.[roleKey];
        const plannedForRoleGroup = sumPlannedForRoleGroup(plan, period.id, index, groupSpan);
        const remainingTeam =
          estimationType === "story_points"
            ? computeStoryPointsTeamAvailableBalance({
                availableCapacityTotal: roleGroupedMetrics?.availableCapacityTotal ?? 0,
                estimationTeamValue: roleGroupedMetrics?.estimationTeamValue,
                plannedTotal: plannedForRoleGroup,
                buffersFactor
              })
            : Number(
                plan.capacityRows
                  .slice(index, index + groupSpan)
                  .reduce((sum, memberRow) => {
                    const memberValues = memberRow.periodValues?.[period.id];
                    if (!memberValues) return sum;
                    const memberEstimationPerDay =
                      memberValues.rowEstimationPerDay ?? memberValues.estimationPerDay ?? "";
                    const memberRemaining = calculateRemainingMember(memberValues, memberEstimationPerDay);
                    if (memberRemaining === "" || memberRemaining === undefined) return sum;
                    return sum + Number((toNumber(memberRemaining, 0) * buffersFactor).toFixed(2));
                  }, 0)
                  .toFixed(2)
              );
        const balanceTeamCell = document.createElement("td");
        balanceTeamCell.className = "period-value-cell period-value-cell-wide";
        balanceTeamCell.rowSpan = groupSpan;
        balanceTeamCell.appendChild(
          buildCellInput({
            value: remainingTeam,
            dataset: { section: "capacity", rowId: capacityRow.id, field: "availableBalanceTeam", periodId: period.id },
            readOnly: true
          })
        );
        tr.appendChild(balanceTeamCell);
      }
    }

    tbody.appendChild(tr);
  });

  refs.capacityTable.appendChild(tbody);
}
