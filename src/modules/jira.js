import { importIssuesViaJiraTab, isJiraBridgeAvailable } from "./jiraBridgeClient.js";

const BASE_SEARCH_FIELDS = ["summary", "issuetype", "priority", "status", "labels"];
const DEFAULT_ESTIMATION_FIELD = "customfield_10016";
const FALLBACK_ESTIMATION_FIELDS = ["customfield_10016", "timeoriginalestimate"];

async function request(url, options) {
  return fetch(url, options);
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

function canOpenBrowserTab() {
  return typeof chrome !== "undefined" && typeof chrome.tabs?.create === "function";
}

/**
 * Open Jira in a real browser tab for re-login/cookie refresh.
 * Returns true when a tab open was requested.
 */
export async function openJiraAuthTab(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    return false;
  }
  const targetUrl = `${normalized}/issues/?jql=`;
  if (canOpenBrowserTab()) {
    await chrome.tabs.create({ url: targetUrl, active: true });
    return true;
  }
  if (typeof window !== "undefined" && typeof window.open === "function") {
    window.open(targetUrl, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}

async function readResponseBodySnippet(response, limit = 400) {
  try {
    const text = await response.text();
    if (!text) {
      return "";
    }
    return text.slice(0, limit).replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function buildHttpErrorMessage(context, status, bodySnippet) {
  const base = `${context} failed with status ${status}.`;
  if (!bodySnippet) {
    return base;
  }
  return `${base} Response: ${bodySnippet}`;
}

function asEstimationString(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

function toIssueRow(issue, estimationFieldName) {
  const fields = issue?.fields || {};
  const preferredEstimation = asEstimationString(fields[estimationFieldName]);
  const fallbackEstimation = FALLBACK_ESTIMATION_FIELDS
    .map((fieldName) => asEstimationString(fields[fieldName]))
    .find((value) => value !== "");
  const estimation = preferredEstimation || fallbackEstimation || "";

  return {
    key: normalizeIssueKey(issue.key || ""),
    summary: fields.summary || "",
    status: fields.status?.name || "",
    issueType: fields.issuetype?.name || "",
    priority: fields.priority?.name || fields.status?.name || "",
    estimation,
    source: "jira"
  };
}

function buildFormBody(params) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

async function postForm(baseUrl, path, params, extraHeaders = {}) {
  return request(`${baseUrl}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Accept": "*/*",
      "X-Requested-With": "XMLHttpRequest",
      ...extraHeaders
    },
    body: buildFormBody(params)
  });
}

async function warmUpJqlQuery(baseUrl, jql) {
  const response = await postForm(baseUrl, "/secure/QueryComponent!Jql.jspa", {
    jql,
    decorator: "none"
  }, {
    "x-sitemesh-off": "true"
  });
  if (!response.ok) {
    const status = response.status;
    if (status === 401 || status === 403) {
      throw new Error("Authorization error. Please login to Jira and retry import.");
    }
    const snippet = await readResponseBodySnippet(response);
    throw new Error(buildHttpErrorMessage("JQL warm-up request", status, snippet));
  }
}

function extractIssueTableItems(payload) {
  const candidates = [
    payload?.issues,
    payload?.issueTable?.issues,
    payload?.issueTable?.webIssues,
    payload?.issueRows,
    payload?.rows,
    payload?.data?.issues
  ];
  return candidates.find((value) => Array.isArray(value)) || [];
}

function resolveField(item, paths) {
  for (const path of paths) {
    let cursor = item;
    const parts = path.split(".");
    for (const part of parts) {
      cursor = cursor?.[part];
    }
    if (cursor !== undefined && cursor !== null && cursor !== "") {
      return cursor;
    }
  }
  return "";
}

function mapIssueTableItem(item, estimationFieldName) {
  const estimation = asEstimationString(
    resolveField(item, [
      `fields.${estimationFieldName}`,
      estimationFieldName,
      "estimation",
      "fields.customfield_10016",
      "customfield_10016",
      "fields.timeoriginalestimate",
      "timeoriginalestimate"
    ])
  );

  return {
    key: normalizeIssueKey(resolveField(item, ["key", "issueKey", "id.key", "fields.key", "issue"])),
    summary: cleanValue(resolveField(item, ["summary", "fields.summary", "summaryText", "title", "issueSummary"])),
    status: cleanValue(resolveField(item, ["status.name", "fields.status.name", "status", "fields.status"])),
    issueType: cleanValue(resolveField(item, ["issueType.name", "fields.issuetype.name", "issueType", "type", "fields.type"])),
    priority: cleanValue(resolveField(item, ["priority.name", "fields.priority.name", "priorityName", "priority", "fields.priority"])),
    estimation,
    source: "jira"
  };
}

function parseIssueTablePayload(rawText, estimationFieldName) {
  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch {
    return [];
  }
  const items = extractIssueTableItems(payload);
  return items.map((item) => mapIssueTableItem(item, estimationFieldName)).filter((row) => row.key || row.summary);
}

async function importViaIssueNavigator(baseUrl, jql, estimationFieldName) {
  await warmUpJqlQuery(baseUrl, jql);

  const response = await postForm(baseUrl, "/rest/issueNav/1/issueTable", {
    startIndex: 0,
    jql,
    layoutKey: "list-view"
  }, {
    "X-Atlassian-Token": "no-check",
    "__amdmodulename": "jira/issue/utils/xsrf-token-header"
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401 || status === 403) {
      throw new Error("Authorization error. Please login to Jira and retry import.");
    }
    const snippet = await readResponseBodySnippet(response);
    throw new Error(buildHttpErrorMessage("Issue Navigator table request", status, snippet));
  }

  const rawText = await response.text();
  const jsonMappedRows = parseIssueTablePayload(rawText, estimationFieldName);
  const htmlMappedRows = parseIssueTableHtml(rawText);
  let mappedRows = pickRicherRows(jsonMappedRows, htmlMappedRows);
  if (areRowsSparse(mappedRows)) {
    try {
      const searchFallback = await importViaSearchApi(baseUrl, jql, 200, estimationFieldName);
      if (searchFallback?.mappedRows?.length) {
        mappedRows = searchFallback.mappedRows;
      }
    } catch {
      // Keep Issue Navigator rows if Search API fallback fails.
    }
  }
  if (!mappedRows.length) {
    return null;
  }
  return {
    total: mappedRows.length,
    mappedRows
  };
}

function textOrEmpty(node) {
  return String(node?.textContent || "").trim();
}

function cleanValue(value) {
  return String(value || "")
    .replace(/\\+/g, "")
    .replace(/^['"]+|['"]+$/g, "")
    .trim();
}

function normalizeIssueKey(raw) {
  const source = String(raw || "");
  const fromBrowse = source.match(/([A-Z][A-Z0-9_]+-\d+)/i);
  if (fromBrowse) {
    return fromBrowse[1].toUpperCase();
  }
  return source
    .replace(/\\+/g, "")
    .replace(/[`"'“”„‟‘’‚‛]+/g, "")
    .trim();
}

function scoreParsedRows(rows) {
  return rows.reduce((score, row) => {
    let next = score;
    if (row?.summary) next += 2;
    if (row?.issueType) next += 1;
    if (row?.priority) next += 1;
    if (row?.estimation !== "") next += 0.5;
    return next;
  }, 0);
}

function pickRicherRows(primaryRows, secondaryRows) {
  if (!secondaryRows.length) {
    return primaryRows;
  }
  if (!primaryRows.length) {
    return secondaryRows;
  }
  const primaryScore = scoreParsedRows(primaryRows) / primaryRows.length;
  const secondaryScore = scoreParsedRows(secondaryRows) / secondaryRows.length;
  return secondaryScore > primaryScore ? secondaryRows : primaryRows;
}

function areRowsSparse(rows) {
  return rows.length > 0 && rows.every(
    (row) => !row.summary && !row.issueType && !row.priority && row.estimation === ""
  );
}

function parseIssueTableHtml(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return [];
  }
  if (typeof DOMParser === "undefined") {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawText, "text/html");
  const rowNodes = Array.from(
    doc.querySelectorAll("tr[data-issuekey], tr[data-key], tr.issuerow, li[data-issuekey], li[data-key]")
  );

  const rows = rowNodes.map((rowNode) => {
    const keyFromHref = rowNode
      .querySelector("a[href*='/browse/']")
      ?.getAttribute("href")
      ?.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/i)?.[1];
    const key =
      keyFromHref ||
      rowNode.getAttribute("data-issuekey") ||
      rowNode.getAttribute("data-key") ||
      textOrEmpty(rowNode.querySelector("a[data-issue-key], a.issue-link, a[href*='/browse/']"));

    const summary = cleanValue(
      textOrEmpty(rowNode.querySelector("[data-column-id='summary'], [data-id='summary'], td.summary, .issue_summary, .summary")) ||
        rowNode.querySelector("a.issue-link, a[data-issue-key], a[href*='/browse/']")?.getAttribute("title") ||
        textOrEmpty(rowNode.querySelector("a.issue-link, a[data-issue-key], a[href*='/browse/']"))
    );
    const status = cleanValue(
      textOrEmpty(rowNode.querySelector("[data-column-id='status'], [data-id='status'], td.status, .status")) ||
        rowNode.querySelector("img[alt][src*='status'], img[title][src*='status']")?.getAttribute("alt") ||
        rowNode.querySelector("img[alt][src*='status'], img[title][src*='status']")?.getAttribute("title")
    );
    const issueType = cleanValue(
      textOrEmpty(rowNode.querySelector("[data-column-id='issuetype'], [data-id='issuetype'], td.issuetype, .issuetype")) ||
        rowNode.querySelector("img[alt][src*='issuetype'], img[title][src*='issuetype']")?.getAttribute("alt") ||
        rowNode.querySelector("img[alt][src*='issuetype'], img[title][src*='issuetype']")?.getAttribute("title")
    );
    const priority = cleanValue(
      textOrEmpty(rowNode.querySelector("[data-column-id='priority'], [data-id='priority'], td.priority, .priority")) ||
        rowNode.querySelector("img[alt][src*='priority'], img[title][src*='priority']")?.getAttribute("alt") ||
        rowNode.querySelector("img[alt][src*='priority'], img[title][src*='priority']")?.getAttribute("title")
    );
    const estimation = cleanValue(
      textOrEmpty(rowNode.querySelector("[data-column-id*='story'], [data-column-id*='estimate'], [data-id*='story'], [data-id*='estimate']"))
    );

    return {
      key: normalizeIssueKey(key),
      summary,
      status,
      issueType,
      priority,
      estimation,
      source: "jira"
    };
  });

  return rows.filter((row) => row.key || row.summary);
}

async function importViaSearchApi(baseUrl, jql, maxResults, estimationField, onProgress = null) {
  const reportProgress = (payload) => {
    if (typeof onProgress === "function") {
      onProgress(payload);
    }
  };
  reportProgress({ phase: "search_start", value: 25 });
  const optionalFields = [estimationField, ...FALLBACK_ESTIMATION_FIELDS].filter(Boolean);
  const requestFields = Array.from(new Set([...BASE_SEARCH_FIELDS, ...optionalFields]));
  const normalizedMaxResults = Math.min(Math.max(Number(maxResults) || 50, 1), 200);

  async function doSearch(fields) {
    const normalizedJql = String(jql).trim();
    const fieldsCsv = fields.join(",");
    const urlVariants = [];

    const q1 = new URL(`${baseUrl}/rest/api/2/search`);
    q1.searchParams.set("jql", normalizedJql);
    q1.searchParams.set("fields", fieldsCsv);
    q1.searchParams.set("maxResults", String(normalizedMaxResults));
    urlVariants.push(q1.toString());

    const q2 = new URL(`${baseUrl}/rest/api/2/search`);
    q2.searchParams.set("Jql", normalizedJql);
    q2.searchParams.set("fields", fieldsCsv);
    q2.searchParams.set("maxResults", String(normalizedMaxResults));
    urlVariants.push(q2.toString());

    const q3 = new URL(`${baseUrl}/rest/api/2/search`);
    q3.searchParams.set("Jql", `jql=${normalizedJql}`);
    q3.searchParams.set("fields", fieldsCsv);
    q3.searchParams.set("maxResults", String(normalizedMaxResults));
    urlVariants.push(q3.toString());

    let response = null;
    const methodLabels = ["GET:jql", "GET:Jql", "GET:Jql=jql"];
    for (let index = 0; index < urlVariants.length; index += 1) {
      const url = urlVariants[index];
      reportProgress({ phase: "search_try", value: 30 + index * 8 });
      try {
        response = await request(url, {
          method: "GET",
          credentials: "include",
          headers: {
            "Accept": "application/json"
          }
        });
        if (response.ok) {
          reportProgress({ phase: "search_response", value: 55 });
          return { response, method: methodLabels[index] };
        }
      } catch {
        response = null;
      }
    }

    const payload = {
      jql: normalizedJql,
      fields,
      maxResults: normalizedMaxResults
    };
    try {
      reportProgress({ phase: "search_try_post", value: 50 });
      response = await request(`${baseUrl}/rest/api/2/search`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (response?.ok) {
        reportProgress({ phase: "search_response", value: 55 });
      }
      return { response, method: "POST:json" };
    } catch {
      throw new Error("Failed to fetch Search API via GET/POST variants.");
    }
  }

  let responseResult = await doSearch(requestFields);
  let response = responseResult.response;
  let searchMethod = responseResult.method;

  if (!response.ok) {
    const status = response.status;
    const snippet = await readResponseBodySnippet(response);
    const maybeInvalidField = status === 400 && /field|customfield|does not exist|cannot be viewed/i.test(snippet);
    if (maybeInvalidField) {
      const safeFields = [...BASE_SEARCH_FIELDS, "timeoriginalestimate"];
      reportProgress({ phase: "search_safe_fields_retry", value: 60 });
      responseResult = await doSearch(safeFields);
      response = responseResult.response;
      searchMethod = `${responseResult.method}:safe_fields`;
    } else {
      let message = buildHttpErrorMessage("Jira Search API request", status, snippet);
      if (status === 401 || status === 403) {
        message = "Authorization error. Please login to Jira and retry import.";
      }
      throw new Error(message);
    }
  }

  if (!response.ok) {
    const status = response.status;
    const snippet = await readResponseBodySnippet(response);
    let message = buildHttpErrorMessage("Jira Search API request", status, snippet);
    if (status === 401 || status === 403) {
      message = "Authorization error. Please login to Jira and retry import.";
    }
    throw new Error(message);
  }

  const data = await response.json();
  const issues = Array.isArray(data?.issues) ? data.issues : [];
  reportProgress({ phase: "search_parsed", value: 75 });
  return {
    total: Number(data?.total || issues.length),
    mappedRows: issues.map((issue) => toIssueRow(issue, estimationField)),
    meta: {
      searchMethod
    }
  };
}

export async function importIssuesFromJira({ baseUrl, jql, maxResults = 200, estimationFieldName = "", onProgress = null }) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    throw new Error("Jira Base URL is empty.");
  }

  if (!jql || !String(jql).trim()) {
    throw new Error("JQL is empty.");
  }

  const estimationField = String(estimationFieldName || "").trim() || DEFAULT_ESTIMATION_FIELD;
  const normalizedJql = String(jql).trim();

  let bridgeFailure = null;
  if (isJiraBridgeAvailable()) {
    try {
      if (typeof onProgress === "function") {
        onProgress({ phase: "bridge_start", value: 20 });
      }
      const bridgeResult = await importIssuesViaJiraTab({
        baseUrl: normalizedBaseUrl,
        jql: normalizedJql,
        maxResults,
        estimationFieldName: estimationField
      });
      if (typeof onProgress === "function") {
        onProgress({ phase: "bridge_done", value: 75 });
      }
      return bridgeResult;
    } catch (bridgeError) {
      bridgeFailure = bridgeError;
      if (typeof onProgress === "function") {
        onProgress({ phase: "bridge_fallback", value: 22 });
      }
      if (bridgeError?.code === "BRIDGE_UNAVAILABLE") {
        // Continue into API fallback path below.
      } else {
        console.warn("[Jira Import] Bridge failed; trying Search API fallback.", {
          code: bridgeError?.code,
          message: String(bridgeError?.message || bridgeError || "")
        });
      }
    }
  }

  try {
    return await importViaSearchApi(normalizedBaseUrl, normalizedJql, maxResults, estimationField, onProgress);
  } catch (error) {
    const searchMessage = String(error?.message || error || "");
    const isFetchTransportError = searchMessage.toLowerCase().includes("failed to fetch");
    if (isFetchTransportError) {
      if (bridgeFailure) {
        throw new Error(
          `Import failed in both bridge and Search API fallback. Bridge: ${String(bridgeFailure?.message || bridgeFailure)}. ` +
            "Search API: Network/CORS error. Open Jira in this browser profile and make sure the Jira session is active."
        );
      }
      throw new Error(
        "Network/CORS error while contacting Jira. Open the tool via the browser extension tab and make sure Jira session is active."
      );
    }
    if (bridgeFailure) {
      throw new Error(
        `Import failed in both bridge and Search API fallback. Bridge: ${String(bridgeFailure?.message || bridgeFailure)}. ` +
          `Search API: ${searchMessage || "unknown error"}.`
      );
    }
    throw error;
  }
}
