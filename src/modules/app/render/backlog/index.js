import { renderImportBacklogByRoles } from "./byRoles.js";
import { renderImportBacklogByTeam } from "./byTeam.js";
import { renderImportBacklogByMember } from "./byMember.js";

export function renderBacklogTable({
  refs,
  plan,
  estimationHeader,
  buildCellInput,
  buildBacklogPeriodSelect,
  estimationType,
  resourceGroupingType,
  roleOptions
}) {
  refs.backlogTable.innerHTML = "";
  refs.backlogTable.classList.remove(
    "backlog-import-table",
    "backlog-manual-table",
    "backlog-import-by-roles",
    "backlog-import-by-team",
    "backlog-import-by-member"
  );
  if (!plan) {
    refs.backlogTable.innerHTML = "<tr><td>Create plan to start backlog planning.</td></tr>";
    return;
  }

  refs.backlogTable.classList.add("backlog-import-table");
  if (resourceGroupingType === "by_roles") {
    refs.backlogTable.classList.add("backlog-import-by-roles");
    renderImportBacklogByRoles({
      refs,
      plan,
      estimationHeader,
      estimationType,
      roleOptions,
      buildCellInput,
      buildBacklogPeriodSelect
    });
    return;
  }
  if (resourceGroupingType === "by_member") {
    refs.backlogTable.classList.add("backlog-import-by-member");
    renderImportBacklogByMember({
      refs,
      plan,
      estimationHeader,
      buildCellInput,
      buildBacklogPeriodSelect
    });
    return;
  }

  refs.backlogTable.classList.add("backlog-import-by-team");
  renderImportBacklogByTeam({
    refs,
    plan,
    estimationHeader,
    buildCellInput,
    buildBacklogPeriodSelect
  });
}

