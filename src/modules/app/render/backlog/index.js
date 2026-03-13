import { renderImportBacklogByRoles } from "./byRoles.js";
import { renderImportBacklogByTeam } from "./byTeam.js";

export function renderBacklogTable({
  refs,
  plan,
  estimationHeader,
  buildCellInput,
  estimationType,
  resourceGroupingType,
  roleOptions
}) {
  refs.backlogTable.innerHTML = "";
  refs.backlogTable.classList.remove(
    "backlog-import-table",
    "backlog-manual-table",
    "backlog-import-by-roles",
    "backlog-import-by-team"
  );
  if (!plan) {
    refs.backlogTable.innerHTML = "<tr><td>Create plan to start backlog planning.</td></tr>";
    return;
  }

  refs.backlogTable.classList.add("backlog-import-table");
  const byRoles = resourceGroupingType === "by_roles";
  refs.backlogTable.classList.add(byRoles ? "backlog-import-by-roles" : "backlog-import-by-team");

  if (byRoles) {
    renderImportBacklogByRoles({
      refs,
      plan,
      estimationHeader,
      estimationType,
      roleOptions,
      buildCellInput
    });
    return;
  }

  renderImportBacklogByTeam({
    refs,
    plan,
    estimationHeader,
    estimationType,
    buildCellInput
  });
}
