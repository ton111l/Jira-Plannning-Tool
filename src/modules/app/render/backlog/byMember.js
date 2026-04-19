import { asNumber, getEstimationUnitByType } from "../shared/backlogHelpers.js";

function buildMemberSelect(plan, backlogRow) {
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
  const v = backlogRow.targetCapacityRowId;
  select.value = (plan.capacityRows || []).some((r) => r.id === v) ? v : "";
  select.dataset.section = "backlog";
  select.dataset.rowId = backlogRow.id;
  select.dataset.field = "targetCapacityRowId";
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
  const headerLabels = [...baseHeaders, "Member", effectiveTitle];
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
      bubble.textContent = `Read-only. Full ${unitWord} for this issue attributed to the selected member when Period is set.`;
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

    const memberTd = document.createElement("td");
    memberTd.className = "backlog-col-member";
    memberTd.appendChild(buildMemberSelect(plan, backlogRow));
    tr.appendChild(memberTd);

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
