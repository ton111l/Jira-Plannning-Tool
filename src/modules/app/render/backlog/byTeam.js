import { asNumber, getEstimationUnitByType } from "../shared/backlogHelpers.js";

export function renderImportBacklogByTeam({
  refs,
  plan,
  estimationHeader,
  estimationType,
  buildCellInput,
  buildBacklogPeriodSelect
}) {
  const estimationUnit = getEstimationUnitByType(estimationType);
  const baseHeaders = ["Key", "Summary", "Status", "Priority", "IssueType", estimationHeader, "Period"];
  const totalColumns = baseHeaders.length + 2 + 1;

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

  const effectiveTitle = `Effective ${estimationUnit}`;
  const headerLabels = [...baseHeaders, "Team allocation (%)", effectiveTitle];
  headerLabels.forEach((label) => {
    const th = document.createElement("th");
    if (label === effectiveTitle) {
      th.className = "backlog-effective-header";
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
      bubble.textContent = `Read-only. Formula: Estimation × (Team allocation % ÷ 100). Example: 8 ${unitWord} with 50% team allocation → 4 effective.`;
      help.appendChild(bubble);
      wrap.appendChild(help);
      th.appendChild(wrap);
    } else {
      th.textContent = label;
    }
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
