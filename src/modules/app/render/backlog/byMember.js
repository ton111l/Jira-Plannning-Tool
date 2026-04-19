import { asNumber, getEstimationUnitByType, roleToFieldSuffix } from "../shared/backlogHelpers.js";

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
  estimationType,
  buildCellInput,
  buildBacklogPeriodSelect
}) {
  const estimationUnit = getEstimationUnitByType(estimationType);
  const roleOpts = Array.isArray(plan.roleOptions) && plan.roleOptions.length ? plan.roleOptions : [];
  const roleColumns = roleOpts.map((role) => ({
    role,
    splitField: `split_${roleToFieldSuffix(role.label)}_pct`,
    estimationField: `role_estimation_${roleToFieldSuffix(role.label)}`
  }));
  const nRoleCols = roleColumns.length;
  const baseHeaders = ["Key", "Summary", "Status", "Priority", "IssueType", estimationHeader, "Period"];
  const totalColumns = 1 + baseHeaders.length + nRoleCols * 2 + 1;

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

  const effectiveTitle = `Effective ${estimationUnit}`;
  const effectiveTh = document.createElement("th");
  effectiveTh.rowSpan = 3;
  effectiveTh.className = "backlog-effective-header";
  const wrap = document.createElement("span");
  wrap.className = "label-with-help";
  wrap.appendChild(document.createTextNode(effectiveTitle));
  const help = document.createElement("span");
  help.className = "help-tooltip";
  help.tabIndex = 0;
  help.setAttribute("aria-label", `Help: ${effectiveTitle}`);
  const unitWord = estimationType === "person_days" ? "Man-days" : "Story Points";
  help.appendChild(document.createTextNode("?"));
  const bubble = document.createElement("span");
  bubble.className = "help-tooltip-bubble";
  bubble.textContent = `Read-only. Split (%) divides the issue ${unitWord} across roles; each role’s share is planned on the selected member when Period is set.`;
  help.appendChild(bubble);
  wrap.appendChild(help);
  effectiveTh.appendChild(wrap);
  topRow.appendChild(effectiveTh);
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
    cell.textContent = "No issues yet. Add manually or import from Jira.";
    row.appendChild(cell);
    tbody.appendChild(row);
    refs.backlogTable.appendChild(tbody);
    return;
  }

  plan.backlogRows.forEach((backlogRow) => {
    const tr = document.createElement("tr");
    const baseEstimation = asNumber(backlogRow.estimation);

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
      td.appendChild(
        buildCellInput({
          value: backlogRow[field],
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

    const effectiveEstimation = Number(baseEstimation.toFixed(2));
    backlogRow.effectiveEstimation = effectiveEstimation ? String(effectiveEstimation) : "";

    const effectiveTd = document.createElement("td");
    effectiveTd.appendChild(
      buildCellInput({
        value: backlogRow.effectiveEstimation,
        dataset: { section: "backlog", rowId: backlogRow.id, field: "effectiveEstimation" },
        readOnly: true
      })
    );
    tr.appendChild(effectiveTd);

    tbody.appendChild(tr);
  });
  refs.backlogTable.appendChild(tbody);
}
