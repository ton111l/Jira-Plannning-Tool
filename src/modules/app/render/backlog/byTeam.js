import { asNumber, getEstimationUnitByType } from "../shared/backlogHelpers.js";

export function renderImportBacklogByTeam({
  refs,
  plan,
  estimationHeader,
  estimationType,
  buildCellInput
}) {
  const estimationUnit = getEstimationUnitByType(estimationType);
  const baseHeaders = ["Key", "Summary", "Status", "Priority", "IssueType", estimationHeader];
  const totalColumns = baseHeaders.length + 2;

  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const singleHeader = document.createElement("tr");
  [...baseHeaders, "Team allocation (%)", `Effective ${estimationUnit}`].forEach((label) => {
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

    const teamAllocationPercent = backlogRow.teamAllocationPercent === "" || backlogRow.teamAllocationPercent === undefined
      ? 100
      : asNumber(backlogRow.teamAllocationPercent);
    const effectiveEstimation = Number((baseEstimation * teamAllocationPercent / 100).toFixed(2));
    backlogRow.effectiveEstimation = effectiveEstimation ? String(effectiveEstimation) : "";

    const allocationTd = document.createElement("td");
    allocationTd.appendChild(
      buildCellInput({
        value: String(teamAllocationPercent),
        type: "number",
        dataset: { section: "backlog", rowId: backlogRow.id, field: "teamAllocationPercent" }
      })
    );
    tr.appendChild(allocationTd);

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
