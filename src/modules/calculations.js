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

/**
 * Matches the Load (%) `<select>` in the UI: 10..100 in steps of 10; null/empty/invalid → 100.
 * Use for row styling so a stored null does not look like 0% load (pink highlight).
 */
export function resolveLoadPercentStep(value) {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 10 && n <= 100) {
    return Math.round(n / 10) * 10;
  }
  return 100;
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
