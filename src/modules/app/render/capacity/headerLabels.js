/**
 * Compact column titles for capacity thead (second row). Full text in `title`.
 * @param {HTMLElement} th
 * @param {string} _shortText
 * @param {string} fullText
 */
export function setCompactPeriodHeader(th, _shortText, fullText) {
  th.textContent = fullText;
  th.title = fullText;
}

/**
 * Long tooltip for capacity numeric inputs (native `title` on focus/hover).
 * @param {string} field
 * @param {{ estimationLabel?: string }} ctx
 * @returns {string}
 */
export function getCapacityNumericFieldTitle(field, ctx) {
  const est = ctx.estimationLabel || "Story points";
  switch (field) {
    case "memberName":
      return "Member label for this row (does not affect calculations).";
    case "roleId":
      return "Role for this row. Used when backlog demand is split by role.";
    case "loadPercent":
      return "Load (%) applied to working time for this member in each period.";
    case "daysOff":
      return "Days off subtract from working days before load (%) is applied.";
    case "workingDays":
      return "Working days in the period. Read-only when sprint slices roll up into this quarter.";
    case "availableCapacity":
      return "Person-days of capacity after days off and load (%) are applied.";
    case "rowEstimationPerDay":
      return `${est} per day for this member: supply for the period is available capacity times this rate; balance is supply minus planned.`;
    case "rowEstimationPerDayTeam":
      return `${est} per day for the team or role total. When you save a value here, manual mode is used instead of the average of members.`;
    case "plannedEstimation":
      return "Planned demand from the backlog for this member and period (read-only).";
    case "plannedEstimationTeam":
      return "Total planned demand from the backlog for this period (read-only).";
    case "availableBalance":
      return "Remaining capacity in estimation units after planned demand (buffers applied when enabled).";
    case "availableBalanceTeam":
      return "Team or role total remaining capacity after planned demand (buffers applied when enabled).";
    case "availableCapacityTeam":
      return "Aggregated available person-days for the team or role group.";
    default:
      return "";
  }
}
