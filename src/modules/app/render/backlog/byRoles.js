import { asNumber, getEstimationUnitByType, roleToFieldSuffix } from "../shared/backlogHelpers.js";

export function renderImportBacklogByRoles({
  refs,
  plan,
  estimationHeader,
  estimationType,
  roleOptions,
  buildCellInput
}) {
  const estimationUnit = getEstimationUnitByType(estimationType);
  const roleColumns = roleOptions.map((role) => ({
    role,
    splitField: `split_${roleToFieldSuffix(role)}_pct`,
    estimationField: `role_estimation_${roleToFieldSuffix(role)}`
  }));

  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const baseHeaders = ["Key", "Summary", "Status", "Priority", "IssueType", estimationHeader];
  const totalColumns = baseHeaders.length + roleColumns.length * 2;

  const topHeader = document.createElement("tr");
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
    cell.textContent = "No issues yet. Add manually or import from Jira.";
    row.appendChild(cell);
    tbody.appendChild(row);
    refs.backlogTable.appendChild(tbody);
    return;
  }

  plan.backlogRows.forEach((backlogRow) => {
    const tr = document.createElement("tr");
    const baseEstimation = asNumber(backlogRow.estimation);

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

    roleColumns.forEach((column) => {
      const splitPercent = asNumber(backlogRow[column.splitField]);
      const roleEstimation = Number((baseEstimation * splitPercent / 100).toFixed(2));
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

      const estimationTd = document.createElement("td");
      estimationTd.className = "backlog-role-estimation";
      estimationTd.appendChild(
        buildCellInput({
          value: backlogRow[column.estimationField],
          dataset: { section: "backlog", rowId: backlogRow.id, field: column.estimationField },
          readOnly: true
        })
      );
      tr.appendChild(estimationTd);
    });

    tbody.appendChild(tr);
  });
  refs.backlogTable.appendChild(tbody);
}
