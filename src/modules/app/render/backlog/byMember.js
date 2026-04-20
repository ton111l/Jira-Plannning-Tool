import {
  asNumber,
  getBacklogEstimationForPlan,
  getBacklogEstimationNumericForPlan,
  roleToFieldSuffix
} from "../shared/backlogHelpers.js";
import { refreshBacklogRoleSplitRowDom } from "../../services/backlogRoleSplitValidation.js";

function buildMemberSelectForRole(plan, backlogRow, roleOption) {
  const select = document.createElement("select");
  select.className = "cell-select";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "Select member";
  select.appendChild(ph);
  for (const crow of plan.capacityRows || []) {
    const opt = document.createElement("option");
    opt.value = crow.id;
    opt.textContent = String(crow.memberName || "").trim() || "(unnamed)";
    select.appendChild(opt);
  }
  const map =
    backlogRow.targetCapacityRowIdByRoleId && typeof backlogRow.targetCapacityRowIdByRoleId === "object"
      ? backlogRow.targetCapacityRowIdByRoleId
      : {};
  const v = map[roleOption.id];
  select.value = (plan.capacityRows || []).some((r) => r.id === v) ? v : "";
  select.dataset.section = "backlog";
  select.dataset.rowId = backlogRow.id;
  select.dataset.field = "targetCapacityRowIdByRole";
  select.dataset.roleId = roleOption.id;
  return select;
}

export function renderImportBacklogByMember({
  refs,
  plan,
  estimationHeader,
  buildCellInput,
  buildBacklogPeriodSelect
}) {
  const roleOpts = Array.isArray(plan.roleOptions) && plan.roleOptions.length ? plan.roleOptions : [];
  const roleColumns = roleOpts.map((role) => ({
    role,
    splitField: `split_${roleToFieldSuffix(role.label)}_pct`,
    estimationField: `role_estimation_${roleToFieldSuffix(role.label)}`
  }));
  const nRoleCols = roleColumns.length;
  const baseHeaders = ["Key", "Summary", "Status", "Priority", "IssueType", estimationHeader, "Period"];
  const totalColumns = 1 + baseHeaders.length + nRoleCols * 2;

  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  const topRow = document.createElement("tr");
  const selectAllTh = document.createElement("th");
  selectAllTh.className = "backlog-col-select";
  selectAllTh.rowSpan = 3;
  const selectAllInput = document.createElement("input");
  selectAllInput.type = "checkbox";
  selectAllInput.setAttribute("aria-label", "Select all rows");
  selectAllInput.title = "Select all";
  selectAllInput.dataset.backlogSelect = "all";
  selectAllTh.appendChild(selectAllInput);
  topRow.appendChild(selectAllTh);

  baseHeaders.forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    th.rowSpan = 3;
    if (label === "Key") th.className = "backlog-col-key";
    if (label === "Summary") th.className = "backlog-col-summary";
    if (label === "Status") th.className = "backlog-col-status";
    if (label === "IssueType") th.className = "backlog-col-issuetype";
    if (label === "Priority") th.className = "backlog-col-priority";
    if (label === estimationHeader) th.className = "backlog-col-estimation";
    if (label === "Period") th.className = "backlog-col-period";
    topRow.appendChild(th);
  });

  const memberByRolesTh = document.createElement("th");
  memberByRolesTh.colSpan = nRoleCols > 0 ? nRoleCols * 2 : 1;
  memberByRolesTh.rowSpan = 1;
  memberByRolesTh.className = "backlog-member-by-roles-header";
  memberByRolesTh.textContent = "Member by roles";
  topRow.appendChild(memberByRolesTh);

  thead.appendChild(topRow);

  const roleNameRow = document.createElement("tr");
  roleColumns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column.role.label;
    th.colSpan = 2;
    th.className = "backlog-role-group";
    roleNameRow.appendChild(th);
  });
  thead.appendChild(roleNameRow);

  const subRow = document.createElement("tr");
  roleColumns.forEach(() => {
    const splitTh = document.createElement("th");
    splitTh.textContent = "Split (%)";
    splitTh.className = "backlog-role-split";
    subRow.appendChild(splitTh);

    const memTh = document.createElement("th");
    memTh.textContent = "Member";
    memTh.className = "backlog-role-member";
    subRow.appendChild(memTh);
  });
  thead.appendChild(subRow);
  refs.backlogTable.appendChild(thead);

  if (!plan.backlogRows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = totalColumns;
    cell.textContent =
      "No issues in this plan yet. Use Import backlog from Jira (JQL). For By member, assign Split (%) " +
      "per role and pick a member row for each; choose Period for Capacity.";
    row.appendChild(cell);
    tbody.appendChild(row);
    refs.backlogTable.appendChild(tbody);
    return;
  }

  plan.backlogRows.forEach((backlogRow) => {
    const tr = document.createElement("tr");
    const baseEstimation = getBacklogEstimationNumericForPlan(backlogRow, plan);

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

    roleColumns.forEach((column) => {
      const splitPercent = asNumber(backlogRow[column.splitField]);
      const roleEstimation = Number(((baseEstimation * splitPercent) / 100).toFixed(2));
      backlogRow[column.estimationField] = roleEstimation ? String(roleEstimation) : "";

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

      const memberTd = document.createElement("td");
      memberTd.className = "backlog-col-member backlog-role-member";
      memberTd.appendChild(buildMemberSelectForRole(plan, backlogRow, column.role));
      tr.appendChild(memberTd);
    });

    refreshBacklogRoleSplitRowDom(tr, backlogRow, plan);

    tbody.appendChild(tr);
  });
  refs.backlogTable.appendChild(tbody);
}
