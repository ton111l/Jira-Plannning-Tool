export function roleToFieldSuffix(role) {
  return String(role || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getEstimationUnitByType(estimationType) {
  return estimationType === "person_days" ? "Person-day" : "Story Point";
}

export function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}
