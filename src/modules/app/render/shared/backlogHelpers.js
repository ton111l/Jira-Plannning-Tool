export function roleToFieldSuffix(role) {
  return String(role || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getEstimationUnitByType(estimationType) {
  return estimationType === "person_days" ? "Man-day" : "Story Point";
}

export function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * Backlog row `estimation` matches plan only when `estimationKind` is absent (legacy) or equals plan.estimationType.
 * Imported rows set `estimationKind` from the import dialog (Story Points vs Man-days field).
 */
export function getBacklogEstimationForPlan(row, plan) {
  const raw = row?.estimation;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return "";
  }
  const planType = plan?.estimationType === "person_days" ? "person_days" : "story_points";
  const kind = row?.estimationKind;
  if (kind === "story_points" || kind === "person_days") {
    if (kind !== planType) {
      return "";
    }
  }
  return String(raw);
}

export function getBacklogEstimationNumericForPlan(row, plan) {
  return asNumber(getBacklogEstimationForPlan(row, plan));
}

/** Value for Period `<select>`: valid `targetPeriodId` if it matches a plan period, else "" (no default). */
export function resolveBacklogPeriodSelectValue(row, plan) {
  const periods = plan?.periods || [];
  if (periods.length === 0) {
    return "";
  }
  const t = row?.targetPeriodId;
  return t && periods.some((p) => p.id === t) ? t : "";
}
