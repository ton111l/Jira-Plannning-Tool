import { safeDownloadBasename, triggerTextDownload } from "./backlogExport.js";

function escCsv(value) {
  const x = String(value ?? "");
  if (/[",\n\r]/.test(x)) {
    return `"${x.replace(/"/g, '""')}"`;
  }
  return x;
}

const PERIOD_VALUE_FIELDS = [
  "daysOff",
  "workingDays",
  "availableCapacity",
  "plannedEstimation",
  "availableBalance",
  "rowEstimationPerDay",
  "estimationPerDay",
  "plannedCapacity"
];

/** @param {{ name?: string, periods?: object[], capacityRows?: object[], teamPeriodValues?: object }} plan */
export function buildCapacityCsv(plan) {
  const rows = Array.isArray(plan?.capacityRows) ? plan.capacityRows : [];
  const periodIds = (plan?.periods || []).map((p) => p.id);
  const dynHeaders = [];
  for (const pid of periodIds) {
    for (const f of PERIOD_VALUE_FIELDS) {
      dynHeaders.push(`${pid}_${f}`);
    }
  }
  const headers = ["id", "memberName", "roleId", "loadPercent", ...dynHeaders];
  const lines = [headers.map(escCsv).join(",")];
  for (const row of rows) {
    const cells = [row.id, row.memberName ?? "", row.roleId ?? "", row.loadPercent ?? ""];
    for (const pid of periodIds) {
      const pv = row.periodValues?.[pid] || {};
      for (const f of PERIOD_VALUE_FIELDS) {
        cells.push(pv[f] ?? "");
      }
    }
    lines.push(cells.map(escCsv).join(","));
  }
  return lines.join("\n");
}

/**
 * @param {object} plan
 * @returns {string}
 */
export function buildCapacityJson(plan) {
  const payload = {
    planName: plan?.name ?? "",
    exportedAt: new Date().toISOString(),
    periods: plan?.periods ?? [],
    teamPeriodValues: plan?.teamPeriodValues ?? {},
    capacityRows: (plan?.capacityRows || []).map((r) => ({
      id: r.id,
      memberName: r.memberName ?? "",
      roleId: r.roleId ?? "",
      loadPercent: r.loadPercent ?? "",
      periodValues: r.periodValues || {}
    }))
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * @param {object} plan
 * @param {"csv"|"json"} kind
 */
export function downloadCapacityExport(plan, kind) {
  if (!plan?.capacityRows?.length) {
    return { ok: false, message: "No capacity rows to export." };
  }
  const base = safeDownloadBasename(plan.name);
  if (kind === "csv") {
    triggerTextDownload(`${base}_capacity.csv`, buildCapacityCsv(plan), "text/csv;charset=utf-8");
    return { ok: true, message: "CSV file download started." };
  }
  triggerTextDownload(
    `${base}_capacity.json`,
    buildCapacityJson(plan),
    "application/json;charset=utf-8"
  );
  return { ok: true, message: "JSON file download started." };
}
