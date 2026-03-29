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

/** Value for Period `<select>`: valid `targetPeriodId` if it matches a plan period, else "" (no default). */
export function resolveBacklogPeriodSelectValue(row, plan) {
  const periods = plan?.periods || [];
  if (periods.length === 0) {
    return "";
  }
  const t = row?.targetPeriodId;
  return t && periods.some((p) => p.id === t) ? t : "";
}
