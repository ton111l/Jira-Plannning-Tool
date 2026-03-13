export function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function sanitizeLoadPercent(value) {
  return clamp(toNumber(value, 100), 0, 100);
}

export function sanitizeNonNegative(value) {
  return Math.max(0, toNumber(value, 0));
}

export function calculatePlannedCapacity(workingDays, daysOff, loadPercent) {
  const safeWorkingDays = sanitizeNonNegative(workingDays);
  const safeDaysOff = sanitizeNonNegative(daysOff);
  const safeLoadPercent = sanitizeLoadPercent(loadPercent);

  const availableDays = Math.max(0, safeWorkingDays - safeDaysOff);
  return Number(((availableDays * safeLoadPercent) / 100).toFixed(2));
}
