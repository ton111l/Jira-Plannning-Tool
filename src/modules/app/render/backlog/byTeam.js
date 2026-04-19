import { getBacklogEstimationForPlan } from "../shared/backlogHelpers.js";

export function renderImportBacklogByTeam({
  refs,
  plan,
  estimationHeader,
  buildCellInput,
  buildBacklogPeriodSelect
}) {
  const baseHeaders = ["Key", "Summary", "Status", "Priority", "IssueType", estimationHeader, "Period"];
  const totalColumns = 1 + baseHeaders.length;

  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const singleHeader = document.createElement("tr");

  const selectAllTh = document.createElement("th");
  selectAllTh.className = "backlog-col-select";
  const selectAllInput = document.createElement("input");
  selectAllInput.type = "checkbox";
  selectAllInput.setAttribute("aria-label", "Select all rows");
  selectAllInput.title = "Select all";
  selectAllInput.dataset.backlogSelect = "all";
  selectAllTh.appendChild(selectAllInput);
  singleHeader.appendChild(selectAllTh);

  const headerLabels = [...baseHeaders];
  headerLabels.forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    singleHeader.appendChild(th);
  });
  thead.appendChild(singleHeader);
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
      td.appendChild(
        buildCellInput({
          value: cellValue,
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

    tbody.appendChild(tr);
  });
  refs.backlogTable.appendChild(tbody);
}
