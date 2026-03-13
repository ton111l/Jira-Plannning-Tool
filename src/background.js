chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("src/app.html")
  });
});

function withTimeout(promise, timeoutMs, timeoutPayload) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) {
        return;
      }
      done = true;
      resolve(timeoutPayload);
    }, timeoutMs);

    promise
      .then((result) => {
        if (done) {
          return;
        }
        done = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        if (done) {
          return;
        }
        done = true;
        clearTimeout(timer);
        resolve({
          ok: false,
          errorCode: "BACKGROUND",
          message: String(error?.message || error)
        });
      });
  });
}

async function findJiraTab(baseUrl) {
  let origin = "";
  try {
    origin = new URL(String(baseUrl || "").trim()).origin;
  } catch {
    return null;
  }
  if (!origin) {
    return null;
  }

  const tabs = await chrome.tabs.query({ url: `${origin}/*` });
  if (!tabs.length) {
    return null;
  }
  return tabs.find((tab) => tab.active) || tabs[0];
}

function getOrigin(baseUrl) {
  try {
    return new URL(String(baseUrl || "").trim()).origin;
  } catch {
    return "";
  }
}

function waitForTabLoaded(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve(false);
    }, timeoutMs);

    function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") {
        return;
      }
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve(true);
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function ensureJiraTab(baseUrl) {
  const existingTab = await findJiraTab(baseUrl);
  if (existingTab?.id) {
    return { tab: existingTab, created: false };
  }

  const origin = getOrigin(baseUrl);
  if (!origin) {
    return { tab: null, created: false };
  }

  const createdTab = await chrome.tabs.create({
    url: origin,
    active: false
  });
  if (!createdTab?.id) {
    return { tab: null, created: false };
  }
  await waitForTabLoaded(createdTab.id);
  return { tab: createdTab, created: true };
}

function isMissingReceiverError(error) {
  const text = String(error?.message || error || "").toLowerCase();
  return text.includes("receiving end does not exist") || text.includes("could not establish connection");
}

async function sendImportRequestToTab(tabId, payload) {
  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      throw error;
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content/jira-content.js"]
    });
    return chrome.tabs.sendMessage(tabId, payload);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "jira-import-request") {
    (async () => {
      const timeoutMs = Number(message.timeoutMs) || 120000;
      try {
        const jiraTab = await findJiraTab(message.baseUrl);
        const ensured = jiraTab?.id ? { tab: jiraTab, created: false } : await ensureJiraTab(message.baseUrl);
        if (!ensured.tab?.id) {
          sendResponse({
            ok: false,
            errorCode: "NO_JIRA_TAB",
            message: "Cannot open Jira tab for selected Jira Base URL."
          });
          return;
        }

        const authCheckResponse = await withTimeout(
          sendImportRequestToTab(ensured.tab.id, {
            type: "jira-auth-check",
            baseUrl: message.baseUrl
          }),
          15000,
          {
            ok: false,
            errorCode: "TIMEOUT",
            message: "Authorization check timed out."
          }
        );

        if (!authCheckResponse?.ok) {
          if (authCheckResponse?.errorCode === "AUTH") {
            await chrome.tabs.update(ensured.tab.id, { active: true });
            sendResponse({
              ok: false,
              errorCode: "AUTH",
              message: "Open Jira tab and complete authorization, then retry import."
            });
            return;
          }
        }

        const response = await withTimeout(
          sendImportRequestToTab(ensured.tab.id, {
            type: "jira-import-request",
            requestId: message.requestId,
            baseUrl: message.baseUrl,
            jql: message.jql,
            maxResults: message.maxResults,
            estimationFieldName: message.estimationFieldName,
            timeoutMs
          }),
          timeoutMs + 1000,
          {
            ok: false,
            errorCode: "TIMEOUT",
            message: `Background router timeout after ${timeoutMs} ms.`
          }
        );

        sendResponse(response || {
          ok: false,
          errorCode: "EMPTY_RESPONSE",
          message: "Empty response from Jira content bridge."
        });
      } catch (error) {
        sendResponse({
          ok: false,
          errorCode: "BACKGROUND",
          message: String(error?.message || error)
        });
      }
    })();
    return true;
  }

  if (!message || message.type !== "jira-fetch") {
    return;
  }

  (async () => {
    try {
      const response = await fetch(message.url, {
        method: message.method || "GET",
        headers: message.headers || {},
        body: message.body,
        credentials: message.credentials || "include"
      });
      const body = await response.text();
      sendResponse({
        ok: true,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: String(error?.message || error)
      });
    }
  })();

  return true;
});
