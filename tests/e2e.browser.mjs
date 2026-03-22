import assert from "node:assert/strict";
import { chromium } from "playwright";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  try {
    const page = await context.newPage();
    const appUrl = "http://127.0.0.1:4173/src/app.html";
    await page.goto(appUrl);

    await page.locator("#createPlanBtn").click();
    await page.locator("#planNameInput").fill("E2E Plan");
    await page.locator("#quarterInput").selectOption("Q1");
    await page.locator("#yearInput").fill("2026");
    await page.locator("#confirmCreatePlanBtn").click();

    await page.waitForTimeout(300);
    const selectedPlan = await page.locator("#planSelect").inputValue();
    assert.ok(selectedPlan, "Plan should be selected after creation");

    await page.locator("#teamNameInput").fill("Platform Team");
    await page.locator("#addCapacityRowBtn").click();
    await page.locator("#addQuarterBtn").click();

    const loadInput = page.locator('input[data-section="capacity"][data-field="loadPercent"]').first();
    await loadInput.fill("80");
    const daysOffInput = page
      .locator('input[data-section="capacity"][data-field="daysOff"][data-period-id]')
      .first();
    await daysOffInput.fill("2");
    const workingInput = page
      .locator('input[data-section="capacity"][data-field="workingDays"][data-period-id]')
      .first();
    await workingInput.fill("20");
    await page.waitForTimeout(300);
    const plannedCapacity = await page
      .locator('input[data-section="capacity"][data-field="plannedCapacity"][data-period-id]')
      .first()
      .inputValue();
    assert.equal(plannedCapacity, "14.4");

    await page.getByRole("button", { name: "Backlog for planning" }).click();
    await page.locator("#addBacklogRowBtn").click();
    await page.locator('input[data-section="backlog"][data-field="key"]').first().fill("TEST-1");
    await page.locator('input[data-section="backlog"][data-field="summary"]').first().fill("Manual item");

    await page.locator("#settingsBtn").click();
    await page.locator("#jiraBaseUrlInput").fill("http://jira.local");
    await page.locator("#saveSettingsBtn").click();

    await page.route("**/rest/api/2/search", async (route) => {
      const method = route.request().method();
      if (method === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "http://127.0.0.1:4173",
            "access-control-allow-credentials": "true",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type"
          }
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": "http://127.0.0.1:4173",
          "access-control-allow-credentials": "true"
        },
        body: JSON.stringify({
          total: 1,
          issues: [
            {
              key: "JIRA-42",
              fields: {
                summary: "Imported issue",
                issuetype: { name: "Story" },
                priority: { name: "High" },
                customfield_10016: 3
              }
            }
          ]
        })
      });
    });

    await page.locator("#openImportModalBtn").click();
    await page.locator("#jqlInput").fill("project = TEST");
    await page.locator("#confirmImportBtn").click();
    await page.waitForTimeout(1000);

    const backlogKeyValues = await page
      .locator('input[data-section="backlog"][data-field="key"]')
      .evaluateAll((inputs) => inputs.map((input) => input.value));
    const statusMessage = await page.locator("#statusBar").innerText();
    console.log("Debug status:", statusMessage);
    console.log("Debug backlog keys:", backlogKeyValues.join(", "));
    assert.ok(backlogKeyValues.includes("JIRA-42"), "Imported issue should appear in backlog table");

    console.log("Browser E2E passed.");
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error("Browser E2E failed:", error);
  process.exit(1);
});
