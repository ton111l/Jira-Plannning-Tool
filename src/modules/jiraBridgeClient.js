function canUseChromeRuntime() {
  return (
    typeof chrome !== "undefined" &&
    Boolean(chrome.runtime?.id) &&
    typeof chrome.runtime?.sendMessage === "function"
  );
}

export function isJiraBridgeAvailable() {
  return canUseChromeRuntime();
}

function sendRuntimeMessage(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      const runtimeError = chrome.runtime?.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      resolve(response);
    });
  });
}

export async function importIssuesViaJiraTab({
  baseUrl,
  jql,
  maxResults = 200,
  estimationFieldName = "",
  timeoutMs = 120000
}) {
  if (!isJiraBridgeAvailable()) {
    const error = new Error("Jira bridge is not available.");
    error.code = "BRIDGE_UNAVAILABLE";
    throw error;
  }

  const requestId = `jira_import_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const response = await sendRuntimeMessage({
    type: "jira-import-request",
    requestId,
    baseUrl,
    jql,
    maxResults,
    estimationFieldName,
    timeoutMs
  });

  if (!response) {
    const error = new Error("Empty response from Jira bridge.");
    error.code = "EMPTY_RESPONSE";
    throw error;
  }

  if (!response.ok) {
    const error = new Error(response.message || "Jira bridge request failed.");
    error.code = response.errorCode || "BRIDGE_ERROR";
    throw error;
  }

  const payload = response.payload || {};
  return {
    total: Number(payload.total || 0),
    mappedRows: Array.isArray(payload.mappedRows) ? payload.mappedRows : [],
    meta: payload.meta || {}
  };
}
