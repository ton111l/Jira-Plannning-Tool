import { renderCapacityByRoles } from "./byRoles.js";
import { renderCapacityByTeam } from "./byTeam.js";

function renderCapacityNoPlan(refs) {
  const headRow = document.createElement("tr");
  ["", "Member", "Role", "Load (%)"].forEach((title) => {
    const th = document.createElement("th");
    if (!title) {
      th.className = "capacity-col-idx";
      const selectAll = document.createElement("input");
      selectAll.type = "checkbox";
      selectAll.disabled = true;
      selectAll.setAttribute("aria-label", "Select all capacity rows");
      th.appendChild(selectAll);
    } else {
      th.textContent = title;
    }
    headRow.appendChild(th);
  });
  refs.capacityTable.appendChild(headRow);

  for (let index = 1; index <= 5; index += 1) {
    const tr = document.createElement("tr");

    const idx = document.createElement("td");
    idx.className = "capacity-col-idx";
    const rowCb = document.createElement("input");
    rowCb.type = "checkbox";
    rowCb.disabled = true;
    rowCb.setAttribute("aria-label", "Select capacity row");
    idx.appendChild(rowCb);
    tr.appendChild(idx);

    const member = document.createElement("td");
    member.textContent = "";
    tr.appendChild(member);

    const role = document.createElement("td");
    role.textContent = "Select";
    tr.appendChild(role);

    const load = document.createElement("td");
    load.textContent = "100%";
    tr.appendChild(load);

    refs.capacityTable.appendChild(tr);
  }
}

export function renderCapacityTable({
  refs,
  plan,
  estimationType,
  resourceGroupingType,
  estimationLabel,
  roleOptions,
  ensureTeamPeriodValues,
  buildCellInput,
  buildRoleSelect,
  buildPercentSelect,
  createEmptyCapacityPeriodValues
}) {
  refs.capacityTable.innerHTML = "";
  refs.capacityTable.classList.remove(
    "capacity-view-compact",
    "capacity-view-full",
    "capacity-sp-by-team-layout"
  );
  if (!plan) {
    refs.capacityTable.classList.add("capacity-view-full");
    refs.capacityTable.classList.remove("capacity-sticky-enabled");
    renderCapacityNoPlan(refs);
    return;
  }

  refs.capacityTable.classList.add("capacity-sticky-enabled");

  const compact = plan.capacityTableViewMode === "compact";
  refs.capacityTable.classList.toggle("capacity-view-compact", compact);
  refs.capacityTable.classList.toggle("capacity-view-full", !compact);
  refs.capacityTable.classList.toggle(
    "capacity-sp-by-team-layout",
    (resourceGroupingType === "by_team" || resourceGroupingType === "by_member") &&
      estimationType === "story_points"
  );

  if (resourceGroupingType === "by_roles") {
    renderCapacityByRoles({
      refs,
      plan,
      estimationType,
      estimationLabel,
      roleOptions,
      ensureTeamPeriodValues,
      buildCellInput,
      buildRoleSelect,
      buildPercentSelect,
      createEmptyCapacityPeriodValues
    });
    return;
  }

  renderCapacityByTeam({
    refs,
    plan,
    estimationType,
    estimationLabel,
    roleOptions,
    ensureTeamPeriodValues,
    buildCellInput,
    buildRoleSelect,
    buildPercentSelect,
    createEmptyCapacityPeriodValues
  });
}
