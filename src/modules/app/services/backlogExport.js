function escCsv(value) {
  const x = String(value ?? "");
  if (/[",\n\r]/.test(x)) {
    return `"${x.replace(/"/g, '""')}"`;
  }
  return x;
}

function collectCsvHeaders(rows) {
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
  const extra = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    for (const k of Object.keys(row)) {
      if (base.includes(k)) {
        continue;
      }
      if (k === "targetCapacityRowIdByRoleId" && row[k] && typeof row[k] === "object") {
        extra.add("targetCapacityRowIdByRoleId_json");
        continue;
      }
      const v = row[k];
      if (v !== null && typeof v === "object") {
        continue;
      }
      extra.add(k);
    }
  }
  const sortedExtra = [...extra].sort();
  return [...base, ...sortedExtra];
}

function cellValueForCsv(row, key) {
  if (key === "targetCapacityRowIdByRoleId_json") {
    const m = row.targetCapacityRowIdByRoleId;
    if (!m || typeof m !== "object") {
      return "";
    }
    return JSON.stringify(m);
  }
  const v = row[key];
  if (v === undefined || v === null) {
    return "";
  }
  return String(v);
}

/** @param {{ name?: string, backlogRows?: object[] }} plan */
export function buildBacklogCsv(plan) {
  const rows = Array.isArray(plan?.backlogRows) ? plan.backlogRows : [];
  if (!rows.length) {
    return "id,key,summary,status,priority,issueType,estimation,estimationKind,targetPeriodId,targetCapacityRowId,source\n";
  }
  const headers = collectCsvHeaders(rows);
  const lines = [headers.map(escCsv).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escCsv(cellValueForCsv(row, h))).join(","));
  }
  return lines.join("\n");
}

/**
 * @param {object} plan
 * @returns {string}
 */
export function buildBacklogJson(plan) {
  return JSON.stringify(
    {
      planName: plan?.name ?? "",
      exportedAt: new Date().toISOString(),
      periods: plan?.periods ?? [],
      backlogRows: plan?.backlogRows ?? []
    },
    null,
    2
  );
}

/**
 * @param {string} filename
 * @param {string} body
 * @param {string} mime
 */
export function triggerTextDownload(filename, body, mime) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function safeDownloadBasename(planName) {
  const raw = String(planName || "backlog")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return raw || "backlog";
}
