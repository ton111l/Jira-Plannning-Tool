(function jiraPlanningPageBridge() {
  const REQUEST_SOURCE = "jira-planning-content";
  const RESPONSE_SOURCE = "jira-planning-page-bridge";
  const DEBUG_PREFIX = "[Jira Import Debug][page-bridge]";

  function buildFormBody(params) {
    return Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&");
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

  function buildRowStats(rows) {
    const total = rows.length;
    if (!total) {
      return { total, emptySummary: 0, emptyIssueType: 0, emptyPriority: 0, emptyEstimation: 0 };
    }
    const emptySummary = rows.filter((row) => !row.summary).length;
    const emptyIssueType = rows.filter((row) => !row.issueType).length;
    const emptyPriority = rows.filter((row) => !row.priority).length;
    const emptyEstimation = rows.filter((row) => row.estimation === "").length;
    return { total, emptySummary, emptyIssueType, emptyPriority, emptyEstimation };
  }

  function areRowsSparse(rows) {
    return rows.length > 0 && rows.every(
      (row) => !row.summary && !row.issueType && !row.priority && row.estimation === ""
    );
  }

  function asEstimation(value) {
    if (value === null || value === undefined || value === "") {
      return "";
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? String(value) : "";
    }
    return String(value).trim();
  }

  function mapSearchIssue(issue, estimationFieldName) {
    const fields = issue?.fields || {};
    const preferred = asEstimation(fields[estimationFieldName]);
    const fallback = asEstimation(fields.customfield_10016) || asEstimation(fields.timeoriginalestimate);
    return {
      key: normalizeIssueKey(issue?.key || ""),
      summary: cleanValue(fields.summary || ""),
      status: cleanValue(fields.status?.name || ""),
      issueType: cleanValue(fields.issuetype?.name || ""),
      priority: cleanValue(fields.priority?.name || fields.status?.name || ""),
      estimation: preferred || fallback || "",
      source: "jira"
    };
  }

  async function importViaSearchApi(baseUrl, jql, maxResults, estimationFieldName) {
    const optionalFields = [estimationFieldName, "customfield_10016", "timeoriginalestimate"].filter(Boolean);
    const requestFields = Array.from(new Set([
      "summary",
      "issuetype",
      "priority",
      "status",
      "labels",
      ...optionalFields
    ]));
    const normalizedMaxResults = Math.min(Math.max(Number(maxResults) || 50, 1), 200);
    async function doSearch(fields) {
      const fieldsCsv = fields.join(",");
      const normalizedJql = String(jql).trim();
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
        try {
          response = await fetch(url, {
            method: "GET",
            credentials: "include",
            headers: {
              "Accept": "application/json"
            }
          });
          if (response.ok) {
            return { response, method: methodLabels[index] };
          }
        } catch {
          response = null;
        }
      }
      try {
        response = await fetch(`${baseUrl}/rest/api/2/search`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            jql: normalizedJql,
            fields,
            maxResults: normalizedMaxResults
          })
        });
        return { response, method: "POST:json" };
      } catch {
        throw new Error("Failed to fetch Search API via GET/POST variants.");
      }
    }

    let response;
    let searchMethod = "unknown";
    try {
      const result = await doSearch(requestFields);
      response = result.response;
      searchMethod = result.method;
    } catch (error) {
      return {
        ok: false,
        status: 0,
        message: String(error?.message || error || "Failed to fetch"),
        method: "fetch_error",
        rows: []
      };
    }
    if (!response.ok) {
      const snippet = await readBodySnippet(response);
      const maybeInvalidField = response.status === 400 && /field|customfield|does not exist|cannot be viewed/i.test(snippet);
      if (maybeInvalidField) {
        const result = await doSearch(["summary", "issuetype", "priority", "timeoriginalestimate"]);
        response = result.response;
        searchMethod = `${result.method}:safe_fields`;
      }
    }
    if (!response.ok) {
      const snippet = await readBodySnippet(response);
      return {
        ok: false,
        status: response.status,
        message: `Search API fallback failed with status ${response.status}${snippet ? `: ${snippet}` : ""}`,
        method: searchMethod,
        rows: []
      };
    }
    const payload = await response.json();
    const issues = Array.isArray(payload?.issues) ? payload.issues : [];
    return {
      ok: true,
      status: 200,
      method: searchMethod,
      rows: issues.map((issue) => mapSearchIssue(issue, estimationFieldName)).filter((row) => row.key || row.summary)
    };
  }

  function normalizeError(error, fallbackCode = "NETWORK") {
    const message = String(error?.message || error || "Unknown bridge error.");
    return {
      errorCode: fallbackCode,
      message
    };
  }

  async function readBodySnippet(response, limit = 500) {
    try {
      const text = await response.text();
      return String(text || "").slice(0, limit).replace(/\s+/g, " ").trim();
    } catch {
      return "";
    }
  }

  function parseIssueTableJson(rawText, estimationFieldName) {
    let payload = null;
    try {
      payload = JSON.parse(rawText);
    } catch {
      return [];
    }

    const candidates = [
      payload?.issues,
      payload?.issueTable?.issues,
      payload?.issueTable?.webIssues,
      payload?.issueRows,
      payload?.rows,
      payload?.data?.issues
    ];
    const items = candidates.find((value) => Array.isArray(value)) || [];

    function asEstimation(value) {
      if (value === null || value === undefined || value === "") {
        return "";
      }
      if (typeof value === "number") {
        return Number.isFinite(value) ? String(value) : "";
      }
      return String(value).trim();
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

    return items
      .map((item) => ({
        key: normalizeIssueKey(resolveField(item, ["key", "issueKey", "id.key", "fields.key", "issue"])) ,
        summary: cleanValue(resolveField(item, ["summary", "fields.summary", "summaryText", "title", "issueSummary"])),
        status: cleanValue(resolveField(item, ["status.name", "fields.status.name", "status", "fields.status"])),
        issueType: cleanValue(resolveField(item, ["issueType.name", "fields.issuetype.name", "issueType", "type", "fields.type"])),
        priority: cleanValue(resolveField(item, ["priority.name", "fields.priority.name", "priorityName", "priority", "fields.priority"])),
        estimation: asEstimation(
          resolveField(item, [
            `fields.${estimationFieldName}`,
            estimationFieldName,
            "estimation",
            "fields.customfield_10016",
            "customfield_10016",
            "fields.timeoriginalestimate",
            "timeoriginalestimate"
          ])
        ),
        source: "jira"
      }))
      .filter((row) => row.key || row.summary);
  }

  function parseIssueTableHtml(rawText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawText, "text/html");
    const rowNodes = Array.from(
      doc.querySelectorAll("tr[data-issuekey], tr[data-key], tr.issuerow, li[data-issuekey], li[data-key]")
    );

    return rowNodes
      .map((rowNode) => {
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
      })
      .filter((row) => row.key || row.summary);
  }

  async function postForm(url, params, headers = {}) {
    return fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "*/*",
        "X-Requested-With": "XMLHttpRequest",
        ...headers
      },
      body: buildFormBody(params)
    });
  }

  async function runImport(payload) {
    const baseUrl = String(payload?.baseUrl || "").trim().replace(/\/+$/, "");
    const jql = String(payload?.jql || "").trim();
    const maxResults = Math.min(Math.max(Number(payload?.maxResults) || 50, 1), 200);
    const estimationFieldName = String(payload?.estimationFieldName || "").trim() || "customfield_10016";

    if (!baseUrl) {
      return { ok: false, errorCode: "CONFIG", message: "Jira Base URL is empty." };
    }
    if (!jql) {
      return { ok: false, errorCode: "VALIDATION", message: "JQL is empty." };
    }

    const searchPrimary = await importViaSearchApi(baseUrl, jql, maxResults, estimationFieldName);
    if (searchPrimary.ok && searchPrimary.rows.length) {
      console.info(DEBUG_PREFIX, {
        selectedSource: "search_api_primary",
        searchMethod: searchPrimary.method,
        requestedFields: ["summary", "issuetype", "priority", "status", "labels", estimationFieldName],
        selectedStats: buildRowStats(searchPrimary.rows),
        selectedSample: searchPrimary.rows.slice(0, 3)
      });
      return {
        ok: true,
        status: 200,
        payload: {
          total: searchPrimary.rows.length,
          mappedRows: searchPrimary.rows,
          meta: {
            searchMethod: searchPrimary.method
          }
        }
      };
    }
    return {
      ok: false,
      errorCode: "SEARCH_EMPTY",
      message: searchPrimary.message || "Search API returned no issues."
    };
  }

  window.addEventListener("message", async (event) => {
    const data = event?.data;
    if (!data || data.source !== REQUEST_SOURCE || data.type !== "jira-import-request") {
      return;
    }

    const { requestId, payload } = data;
    if (!requestId) {
      return;
    }

    try {
      const result = await runImport(payload);
      window.postMessage(
        {
          source: RESPONSE_SOURCE,
          type: "jira-import-response",
          requestId,
          ...result
        },
        "*"
      );
    } catch (error) {
      const normalized = normalizeError(error, "NETWORK");
      window.postMessage(
        {
          source: RESPONSE_SOURCE,
          type: "jira-import-response",
          requestId,
          ok: false,
          ...normalized
        },
        "*"
      );
    }
  });
})();
