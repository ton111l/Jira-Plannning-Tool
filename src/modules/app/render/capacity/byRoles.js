import { sanitizeNonNegative } from "../../../calculations.js";
import { sumPlannedForRoleGroup } from "../../services/backlogDemand.js";
import { buildPeriodMetrics, buildRoleGroupMeta } from "../../services/metrics.js";
import { asNumber } from "../shared/backlogHelpers.js";

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
    if (isCompact) {
      return 5;
    }
    if (isPersonDays) {
      return 9;
    }
    const teamMode = plan.teamPeriodValues?.[period.id]?.teamEstimationMode || "average";
    return teamMode === "manual" ? 9 : 10;
  };
  const teamSubLabel = "Role total";

  const thead = document.createElement("thead");
  const estimationTitleForPlanned = estimationLabel ? estimationLabel.toLowerCase() : "estimation";

  if (isCompact) {
    const topHeadRow = document.createElement("tr");
    ["#", "Member", "Role", "Act"].forEach((title) => {
      const th = document.createElement("th");
      th.textContent = title;
      th.rowSpan = 2;
      topHeadRow.appendChild(th);
    });
    const loadHeadCompact = document.createElement("th");
    loadHeadCompact.rowSpan = 2;
    loadHeadCompact.textContent = "Load (%)";
    topHeadRow.appendChild(loadHeadCompact);

    for (const period of plan.periods) {
      const periodHead = document.createElement("th");
      periodHead.colSpan = 5;
      const periodHeadWrap = document.createElement("div");
      periodHeadWrap.className = "period-head";
      const periodLabel = document.createElement("span");
      periodLabel.textContent = period.label;
      const deletePeriodButton = document.createElement("button");
      deletePeriodButton.type = "button";
      deletePeriodButton.className = "quarter-delete-btn";
      deletePeriodButton.textContent = "×";
      deletePeriodButton.title = `Delete ${period.label}`;
      deletePeriodButton.setAttribute("aria-label", `Delete ${period.label}`);
      deletePeriodButton.dataset.action = "delete-quarter";
      deletePeriodButton.dataset.periodId = period.id;
      periodHeadWrap.append(periodLabel, deletePeriodButton);
      periodHead.appendChild(periodHeadWrap);
      topHeadRow.appendChild(periodHead);
    }
    thead.appendChild(topHeadRow);

    const metricRow = document.createElement("tr");
    for (const period of plan.periods) {
      const teamMode = plan.teamPeriodValues?.[period.id]?.teamEstimationMode || "average";
      const hasTeamFixedMode = !isPersonDays && teamMode === "manual";

      const working = document.createElement("th");
      working.className = "period-subcol period-subcol-short";
      working.textContent = "Working days";
      metricRow.appendChild(working);

      const available = document.createElement("th");
      available.className = "period-subcol period-subcol-wide";
      available.textContent = "Available capacity";
      metricRow.appendChild(available);

      const estimationPerDay = document.createElement("th");
      estimationPerDay.className = "period-subcol period-subcol-wide";
      estimationPerDay.textContent = isPersonDays
        ? "Man-days per day (Role total)"
        : hasTeamFixedMode
          ? `${estimationLabel} per day (Team)`
          : `${estimationLabel} per day (${teamSubLabel})`;
      metricRow.appendChild(estimationPerDay);

      const planned = document.createElement("th");
      planned.className = "period-subcol period-subcol-wide";
      planned.textContent = `Planned ${estimationTitleForPlanned}`;
      metricRow.appendChild(planned);

      const balance = document.createElement("th");
      balance.className = "period-subcol period-subcol-wide";
      balance.textContent = "Available balance";
      metricRow.appendChild(balance);
    }
    thead.appendChild(metricRow);
  } else {
    const topHeadRow = document.createElement("tr");
    ["#", "Member", "Role", "Act"].forEach((title) => {
      const th = document.createElement("th");
      th.textContent = title;
      th.rowSpan = 3;
      topHeadRow.appendChild(th);
    });
    const loadHead = document.createElement("th");
    loadHead.rowSpan = 3;
    loadHead.textContent = "Load (%)";
    topHeadRow.appendChild(loadHead);

    for (const period of plan.periods) {
      const periodHead = document.createElement("th");
      periodHead.colSpan = getPeriodColumnsCount(period);
      const periodHeadWrap = document.createElement("div");
      periodHeadWrap.className = "period-head";
      const periodLabel = document.createElement("span");
      periodLabel.textContent = period.label;
      const deletePeriodButton = document.createElement("button");
      deletePeriodButton.type = "button";
      deletePeriodButton.className = "quarter-delete-btn";
      deletePeriodButton.textContent = "×";
      deletePeriodButton.title = `Delete ${period.label}`;
      deletePeriodButton.setAttribute("aria-label", `Delete ${period.label}`);
      deletePeriodButton.dataset.action = "delete-quarter";
      deletePeriodButton.dataset.periodId = period.id;
      periodHeadWrap.append(periodLabel, deletePeriodButton);
      periodHead.appendChild(periodHeadWrap);
      topHeadRow.appendChild(periodHead);
    }
    thead.appendChild(topHeadRow);

    const metricHeadRow = document.createElement("tr");
    const metricSubHeadRow = document.createElement("tr");
    for (const period of plan.periods) {
      const teamMode = plan.teamPeriodValues?.[period.id]?.teamEstimationMode || "average";
      const hasTeamFixedMode = !isPersonDays && teamMode === "manual";
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

      const estimationPerDay = document.createElement("th");
      estimationPerDay.className = "period-subcol period-subcol-wide";
      estimationPerDay.colSpan = isPersonDays || hasTeamFixedMode ? 1 : 2;
      if (isPersonDays || hasTeamFixedMode) {
        estimationPerDay.rowSpan = 2;
      }
      estimationPerDay.textContent = isPersonDays
        ? "Man-days per day (Role total)"
        : hasTeamFixedMode
          ? `${estimationLabel} per day (Team)`
          : `${estimationLabel} per day`;

      const planned = document.createElement("th");
      planned.className = "period-subcol period-subcol-wide";
      planned.colSpan = 2;
      planned.textContent = `Planned ${estimationTitleForPlanned}`;

      const balance = document.createElement("th");
      balance.className = "period-subcol period-subcol-wide";
      balance.colSpan = 2;
      balance.textContent = "Available balance";

      metricHeadRow.append(dayOff, working, available, estimationPerDay, planned, balance);

      const availableMemberSub = document.createElement("th");
      availableMemberSub.className = "period-subcol period-subcol-wide";
      availableMemberSub.textContent = "Per member";
      metricSubHeadRow.appendChild(availableMemberSub);

      const availableTeamSub = document.createElement("th");
      availableTeamSub.className = "period-subcol period-subcol-wide";
      availableTeamSub.textContent = teamSubLabel;
      metricSubHeadRow.appendChild(availableTeamSub);

      if (!isPersonDays && !hasTeamFixedMode) {
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

      const plannedMemberSub = document.createElement("th");
      plannedMemberSub.className = "period-subcol period-subcol-wide";
      plannedMemberSub.textContent = "Per member";
      metricSubHeadRow.appendChild(plannedMemberSub);

      const plannedTeamSub = document.createElement("th");
      plannedTeamSub.className = "period-subcol period-subcol-wide";
      plannedTeamSub.textContent = teamSubLabel;
      metricSubHeadRow.appendChild(plannedTeamSub);

      const balanceMemberSub = document.createElement("th");
      balanceMemberSub.className = "period-subcol period-subcol-wide";
      balanceMemberSub.textContent = "Per member";
      metricSubHeadRow.appendChild(balanceMemberSub);

      const balanceTeamSub = document.createElement("th");
      balanceTeamSub.className = "period-subcol period-subcol-wide";
      balanceTeamSub.textContent = teamSubLabel;
      metricSubHeadRow.appendChild(balanceTeamSub);
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
    cell.colSpan = 5 + totalPeriodColumns;
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

    const idx = document.createElement("td");
    idx.textContent = String(index + 1);
    tr.appendChild(idx);

    const member = document.createElement("td");
    member.appendChild(
      buildCellInput({
        value: capacityRow.memberName,
        dataset: { section: "capacity", rowId: capacityRow.id, field: "memberName" },
        placeholder: "Enter member"
      })
    );
    tr.appendChild(member);

    const role = document.createElement("td");
    role.appendChild(
      buildRoleSelect({
        value: capacityRow.roleId,
        dataset: { section: "capacity", rowId: capacityRow.id, field: "roleId" },
        roleOptions
      })
    );
    tr.appendChild(role);

    const remove = document.createElement("td");
    remove.className = "capacity-action-cell";
    const deleteRowButton = document.createElement("button");
    deleteRowButton.type = "button";
    deleteRowButton.className = "row-delete-btn";
    deleteRowButton.textContent = "×";
    deleteRowButton.title = "Delete member";
    deleteRowButton.setAttribute("aria-label", "Delete member");
    deleteRowButton.dataset.action = "delete-capacity-row";
    deleteRowButton.dataset.rowId = capacityRow.id;
    remove.appendChild(deleteRowButton);
    tr.appendChild(remove);

    const load = document.createElement("td");
    load.appendChild(
      buildPercentSelect({
        value: capacityRow.loadPercent,
        dataset: { section: "capacity", rowId: capacityRow.id, field: "loadPercent" }
      })
    );
    tr.appendChild(load);

    for (const period of plan.periods) {
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
            dataset: { section: "capacity", rowId: capacityRow.id, field: "daysOff", periodId: period.id }
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
          dataset: { section: "capacity", rowId: capacityRow.id, field: "workingDays", periodId: period.id }
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
        const teamMode = plan.teamPeriodValues?.[period.id]?.teamEstimationMode || "average";
        const hasTeamFixedMode = teamMode === "manual";
        if (!hasTeamFixedMode && !isCompact) {
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
          estimationPerDayTeamCell.appendChild(
            buildCellInput({
              value: groupedMetrics?.estimationTeamValue ?? "",
              dataset: { section: "capacity", rowId: capacityRow.id, field: "rowEstimationPerDayTeam", periodId: period.id },
              readOnly: true
            })
          );
          tr.appendChild(estimationPerDayTeamCell);
        }
      }

      if (!isCompact) {
        const plannedCell = document.createElement("td");
        plannedCell.className = "period-value-cell period-value-cell-wide";
        plannedCell.appendChild(
          buildCellInput({
            value: values.plannedEstimation ?? "",
            dataset: { section: "capacity", rowId: capacityRow.id, field: "plannedEstimation", periodId: period.id },
            readOnly: true
          })
        );
        tr.appendChild(plannedCell);
      }

      if (isGroupStart) {
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
      }

      if (!isCompact) {
        const balanceCell = document.createElement("td");
        balanceCell.className = "period-value-cell period-value-cell-wide";
        const supplyMember =
          estimationType === "story_points"
            ? rowEstimationPerDay === "" || rowEstimationPerDay === undefined
              ? ""
              : Number((sanitizeNonNegative(values.availableCapacity) * sanitizeNonNegative(rowEstimationPerDay)).toFixed(2))
            : values.availableBalance ?? values.plannedCapacity ?? 0;
        const plannedMember = asNumber(values.plannedEstimation);
        const remainingMember =
          supplyMember === "" || supplyMember === undefined ? "" : Number((sanitizeNonNegative(supplyMember) - plannedMember).toFixed(2));
        balanceCell.appendChild(
          buildCellInput({
            value: remainingMember,
            dataset: { section: "capacity", rowId: capacityRow.id, field: "availableBalance", periodId: period.id },
            readOnly: true
          })
        );
        tr.appendChild(balanceCell);
      }

      if (isGroupStart) {
        const groupedMetrics = periodRoleMetrics[period.id]?.[roleKey] || periodTeamMetrics[period.id];
        const supplyTeam =
          estimationType === "story_points"
            ? groupedMetrics?.estimationTeamValue === "" || groupedMetrics?.estimationTeamValue === undefined
              ? ""
              : Number(
                  (
                    sanitizeNonNegative(groupedMetrics?.availableCapacityTotal) *
                    sanitizeNonNegative(groupedMetrics?.estimationTeamValue)
                  ).toFixed(2)
                )
            : groupedMetrics?.availableBalanceTotal ?? 0;
        const plannedTeam = sumPlannedForRoleGroup(plan, period.id, index, groupSpan);
        const remainingTeam =
          supplyTeam === "" || supplyTeam === undefined ? "" : Number((sanitizeNonNegative(supplyTeam) - plannedTeam).toFixed(2));
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
