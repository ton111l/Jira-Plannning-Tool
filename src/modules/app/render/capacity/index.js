import { renderCapacityByRoles } from "./byRoles.js";
import { renderCapacityByTeam } from "./byTeam.js";

function renderCapacityNoPlan(refs) {
  const headRow = document.createElement("tr");
  ["#", "Member", "Role", "Specialization", "Act", "Load (%)"].forEach((title) => {
    const th = document.createElement("th");
    th.textContent = title;
    headRow.appendChild(th);
  });
  refs.capacityTable.appendChild(headRow);

  for (let index = 1; index <= 5; index += 1) {
    const tr = document.createElement("tr");

    const idx = document.createElement("td");
    idx.textContent = String(index);
    tr.appendChild(idx);

    const member = document.createElement("td");
    member.textContent = "";
    tr.appendChild(member);

    const role = document.createElement("td");
    role.textContent = "Select";
    tr.appendChild(role);

    const specialization = document.createElement("td");
    specialization.textContent = "";
    tr.appendChild(specialization);

    const remove = document.createElement("td");
    remove.textContent = "";
    tr.appendChild(remove);

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
  buildCellSelect,
  buildPercentSelect,
  createEmptyCapacityPeriodValues
}) {
  refs.capacityTable.innerHTML = "";
  if (!plan) {
    renderCapacityNoPlan(refs);
    return;
  }

  if (resourceGroupingType === "by_roles") {
    renderCapacityByRoles({
      refs,
      plan,
      estimationType,
      estimationLabel,
      roleOptions,
      ensureTeamPeriodValues,
      buildCellInput,
      buildCellSelect,
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
    buildCellSelect,
    buildPercentSelect,
    createEmptyCapacityPeriodValues
  });
}
