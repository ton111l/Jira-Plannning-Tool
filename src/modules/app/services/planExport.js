import * as XLSX from "../../../../node_modules/xlsx/xlsx.mjs";
import { safeDownloadBasename, triggerTextDownload } from "./backlogExport.js";

const xlsxUtils = XLSX.utils;
const writeWorkbookFile = XLSX.writeFileXLSX || XLSX.writeFile;

function asPlainValue(value) {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
}

function collectBacklogHeaders(rows) {
  const base = [
    "id",
    "key",
    "summary",
    "status",
    "priority",
    "issueType",
    "estimation",
    "estimationKind",
    "targetPeriodId",
    "targetCapacityRowId",
    "source"
  ];
  const extras = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    Object.keys(row).forEach((key) => {
      if (!base.includes(key)) {
        extras.add(key);
      }
    });
  }
  return [...base, ...[...extras].sort()];
}

function buildBacklogSheetRows(plan) {
  const rows = Array.isArray(plan?.backlogRows) ? plan.backlogRows : [];
  const headers = collectBacklogHeaders(rows);
  return rows.map((row) => {
    const out = {};
    headers.forEach((header) => {
      out[header] = asPlainValue(row?.[header]);
    });
    return out;
  });
}

function buildCapacitySheetRows(plan) {
  const periods = Array.isArray(plan?.periods) ? plan.periods : [];
  const rows = Array.isArray(plan?.capacityRows) ? plan.capacityRows : [];
  const periodColumns = periods.map((p) => ({ id: p.id, label: p.label || p.id }));
  const periodValueFields = [
    "daysOff",
    "workingDays",
    "availableCapacity",
    "plannedEstimation",
    "availableBalance",
    "rowEstimationPerDay",
    "estimationPerDay",
    "plannedCapacity"
  ];
  return rows.map((row) => {
    const out = {
      id: asPlainValue(row?.id),
      memberName: asPlainValue(row?.memberName),
      roleId: asPlainValue(row?.roleId),
      loadPercent: asPlainValue(row?.loadPercent)
    };
    periodColumns.forEach((period) => {
      const pv = row?.periodValues?.[period.id] || {};
      periodValueFields.forEach((field) => {
        out[`${period.label}__${field}`] = asPlainValue(pv[field]);
      });
    });
    return out;
  });
}

export function buildPlanJson(plan) {
  return JSON.stringify(
    {
      planName: plan?.name ?? "",
      exportedAt: new Date().toISOString(),
      periods: plan?.periods ?? [],
      teamPeriodValues: plan?.teamPeriodValues ?? {},
      capacityRows: plan?.capacityRows ?? [],
      backlogRows: plan?.backlogRows ?? []
    },
    null,
    2
  );
}

export function buildPlanWorkbook(plan) {
  const wb = xlsxUtils.book_new();
  const capacitySheet = xlsxUtils.json_to_sheet(buildCapacitySheetRows(plan));
  const backlogSheet = xlsxUtils.json_to_sheet(buildBacklogSheetRows(plan));
  xlsxUtils.book_append_sheet(wb, capacitySheet, "Capacity");
  xlsxUtils.book_append_sheet(wb, backlogSheet, "Backlog");
  return wb;
}

export function downloadPlanExport(plan, kind) {
  if (!plan) {
    return { ok: false, message: "Create plan first." };
  }
  const base = safeDownloadBasename(plan.name || "plan");
  if (kind === "xlsx") {
    const wb = buildPlanWorkbook(plan);
    writeWorkbookFile(wb, `${base}_plan.xlsx`);
    return { ok: true, message: "XLSX file download started." };
  }
  triggerTextDownload(
    `${base}_plan.json`,
    buildPlanJson(plan),
    "application/json;charset=utf-8"
  );
  return { ok: true, message: "JSON file download started." };
}
