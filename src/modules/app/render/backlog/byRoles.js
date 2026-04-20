import {
  getBacklogEstimationForPlan,
  getEstimationUnitByType,
  roleToFieldSuffix
} from "../shared/backlogHelpers.js";
import {
  refreshBacklogRoleSplitRowDom,
  syncBacklogRowRoleEstimationsFromSplits
} from "../../services/backlogRoleSplitValidation.js";

export function renderImportBacklogByRoles({
  refs,
  plan,
  estimationHeader,
  estimationType,
  roleOptions,
  buildCellInput,
  buildBacklogPeriodSelect
}) {
  const estimationUnit = getEstimationUnitByType(estimationType);
  const roleColumns = roleOptions.map((role) => ({
    role,
    splitField: `split_${roleToFieldSuffix(role)}_pct`,
    estimationField: `role_estimation_${roleToFieldSuffix(role)}`
  }));

  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const baseHeaders = ["Key", "Summary", "Status", "Priority", "IssueType", estimationHeader, "Period"];
  const totalColumns = baseHeaders.length + roleColumns.length * 2 + 1;

  const topHeader = document.createElement("tr");
  const selectAllTh = document.createElement("th");
  selectAllTh.className = "backlog-col-select";
  selectAllTh.rowSpan = 2;
  const selectAllInput = document.createElement("input");
  selectAllInput.type = "checkbox";
  selectAllInput.setAttribute("aria-label", "Select all rows");
  selectAllInput.title = "Select all";
  selectAllInput.dataset.backlogSelect = "all";
  selectAllTh.appendChild(selectAllInput);
  topHeader.appendChild(selectAllTh);

  baseHeaders.forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    th.rowSpan = 2;
    if (label === "Key") th.className = "backlog-col-key";
    if (label === "Summary") th.className = "backlog-col-summary";
    if (label === "Status") th.className = "backlog-col-status";
    if (label === "IssueType") th.className = "backlog-col-issuetype";
    if (label === "Priority") th.className = "backlog-col-priority";
    if (label === estimationHeader) th.className = "backlog-col-estimation";
    if (label === "Period") th.className = "backlog-col-period";
    topHeader.appendChild(th);
  });
  roleColumns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column.role;
    th.colSpan = 2;
    th.className = "backlog-role-group";
    topHeader.appendChild(th);
  });
  thead.appendChild(topHeader);

  const subHeader = document.createElement("tr");
  roleColumns.forEach(() => {
    const splitTh = document.createElement("th");
    splitTh.textContent = "Split (%)";
    splitTh.className = "backlog-role-split";
    subHeader.appendChild(splitTh);

    const estimationTh = document.createElement("th");
    estimationTh.textContent = estimationUnit;
    estimationTh.className = "backlog-role-estimation";
    subHeader.appendChild(estimationTh);
  });
  thead.appendChild(subHeader);
  refs.backlogTable.appendChild(thead);

  if (!plan.backlogRows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = totalColumns;
    cell.textContent =
      "No issues in this plan yet. Use Import backlog from Jira (JQL). For By roles, set Split (%) and " +
      "role estimates so they stay consistent with the row total; pick a Period for Capacity.";
    row.appendChild(cell);
    tbody.appendChild(row);
    refs.backlogTable.appendChild(tbody);
    return;
  }

  plan.backlogRows.forEach((backlogRow) => {
    const tr = document.createElement("tr");
    tr.dataset.backlogRowId = backlogRow.id;

    const selectTd = document.createElement("td");
    selectTd.className = "backlog-col-select";
    const rowCb = document.createElement("input");
    rowCb.type = "checkbox";
    rowCb.setAttribute("aria-label", "Select row");
    rowCb.dataset.backlogSelect = "row";
    rowCb.dataset.rowId = backlogRow.id;
    selectTd.appendChild(rowCb);
    tr.appendChild(selectTd);

    ["key", "summary", "status", "priority", "issueType", "estimation"].forEach((field) => {
      const td = document.createElement("td");
      td.classList.add(`backlog-col-${field.toLowerCase()}`);
      const cellValue = field === "estimation" ? getBacklogEstimationForPlan(backlogRow, plan) : backlogRow[field];
      const isReadOnlyField = ["key", "summary", "status", "priority", "issueType"].includes(field);
      td.appendChild(
        buildCellInput({
          value: cellValue,
          readOnly: isReadOnlyField,
          dataset: { section: "backlog", rowId: backlogRow.id, field }
        })
      );
      tr.appendChild(td);
    });

    const periodTd = document.createElement("td");
    periodTd.className = "backlog-col-period";
    periodTd.appendChild(
      buildBacklogPeriodSelect({
        row: backlogRow,
        plan,
        dataset: { section: "backlog", rowId: backlogRow.id, field: "targetPeriodId" }
      })
    );
    tr.appendChild(periodTd);

    syncBacklogRowRoleEstimationsFromSplits(backlogRow, plan);

    roleColumns.forEach((column) => {
      const splitTd = document.createElement("td");
      splitTd.className = "backlog-role-split";
      splitTd.appendChild(
        buildCellInput({
          value: backlogRow[column.splitField] || "",
          type: "number",
          dataset: { section: "backlog", rowId: backlogRow.id, field: column.splitField }
        })
      );
      tr.appendChild(splitTd);

      const estimationTd = document.createElement("td");
      estimationTd.className = "backlog-role-estimation";
      const roleSpInput = buildCellInput({
        value: backlogRow[column.estimationField],
        type: "number",
        readOnly: false,
        dataset: { section: "backlog", rowId: backlogRow.id, field: column.estimationField }
      });
      roleSpInput.step = "any";
      roleSpInput.min = "0";
      estimationTd.appendChild(roleSpInput);
      tr.appendChild(estimationTd);
    });

    refreshBacklogRoleSplitRowDom(tr, backlogRow, plan);

    tbody.appendChild(tr);
  });
  refs.backlogTable.appendChild(tbody);
}
