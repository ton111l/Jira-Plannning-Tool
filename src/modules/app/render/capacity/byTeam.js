import { sanitizeNonNegative } from "../../../calculations.js";
import { buildPeriodMetrics } from "../../services/metrics.js";

export function renderCapacityByTeam({
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
  const isPersonDays = estimationType === "person_days";
  const getPeriodColumnsCount = (period) => {
    if (isPersonDays) {
      return 9;
    }
    const teamMode = plan.teamPeriodValues?.[period.id]?.teamEstimationMode || "average";
    return teamMode === "manual" ? 9 : 10;
  };
  const teamSubLabel = "Per team";

  const thead = document.createElement("thead");
  const topHeadRow = document.createElement("tr");
  ["#", "Member", "Role", "Act"].forEach((title) => {
    const th = document.createElement("th");
    th.textContent = title;
    th.rowSpan = 3;
    topHeadRow.appendChild(th);
  });
  const loadHead = document.createElement("th");
  loadHead.rowSpan = 3;
  const loadHeadWrap = document.createElement("div");
  loadHeadWrap.className = "head-inline-actions";
  const loadLabel = document.createElement("span");
  loadLabel.textContent = "Load (%)";
  const editLoadButton = document.createElement("button");
  editLoadButton.type = "button";
  editLoadButton.className = "working-days-edit-btn";
  editLoadButton.textContent = "✎";
  editLoadButton.title = "Set Load (%) for all rows";
  editLoadButton.setAttribute("aria-label", "Set Load (%) for all rows");
  editLoadButton.dataset.action = "bulk-load-percent";
  loadHeadWrap.append(loadLabel, editLoadButton);
  loadHead.appendChild(loadHeadWrap);
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
  const estimationTitleForPlanned = estimationLabel ? estimationLabel.toLowerCase() : "estimation";
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
      ? "Man-days per day (team total)"
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

  const { periodTeamMetrics } = buildPeriodMetrics({
    plan,
    estimationType,
    teamPeriodValues: plan.teamPeriodValues,
    isByRolesGrouping: false
  });

  plan.capacityRows.forEach((capacityRow, index) => {
    const tr = document.createElement("tr");
    const isGroupStart = index === 0;
    const groupSpan = plan.capacityRows.length;

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

      if (isGroupStart) {
        const groupedMetrics = periodTeamMetrics[period.id];
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
          const groupedMetrics = periodTeamMetrics[period.id];
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
        if (!hasTeamFixedMode) {
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
          const groupedMetrics = periodTeamMetrics[period.id];
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

      if (isGroupStart) {
        const plannedTeamCell = document.createElement("td");
        plannedTeamCell.className = "period-value-cell period-value-cell-wide";
        plannedTeamCell.rowSpan = groupSpan;
        plannedTeamCell.appendChild(
          buildCellInput({
            value: "",
            dataset: { section: "capacity", rowId: capacityRow.id, field: "plannedEstimationTeam", periodId: period.id },
            readOnly: true
          })
        );
        tr.appendChild(plannedTeamCell);
      }

      const balanceCell = document.createElement("td");
      balanceCell.className = "period-value-cell period-value-cell-wide";
      const linkedMemberBalanceValue =
        estimationType === "story_points"
          ? rowEstimationPerDay === "" || rowEstimationPerDay === undefined
            ? ""
            : Number((sanitizeNonNegative(values.availableCapacity) * sanitizeNonNegative(rowEstimationPerDay)).toFixed(2))
          : values.availableBalance ?? values.plannedCapacity ?? 0;
      balanceCell.appendChild(
        buildCellInput({
          value: linkedMemberBalanceValue,
          dataset: { section: "capacity", rowId: capacityRow.id, field: "availableBalance", periodId: period.id },
          readOnly: true
        })
      );
      tr.appendChild(balanceCell);

      if (isGroupStart) {
        const groupedMetrics = periodTeamMetrics[period.id];
        const linkedTeamBalanceValue =
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
        const balanceTeamCell = document.createElement("td");
        balanceTeamCell.className = "period-value-cell period-value-cell-wide";
        balanceTeamCell.rowSpan = groupSpan;
        balanceTeamCell.appendChild(
          buildCellInput({
            value: linkedTeamBalanceValue,
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
