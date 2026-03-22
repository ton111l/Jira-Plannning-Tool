import assert from "node:assert/strict";
import { calculatePlannedCapacity, sanitizeLoadPercent, sanitizeNonNegative } from "../src/modules/calculations.js";
import { createPlan, createCapacityRow, createBacklogRow, createEmptyCapacityPeriodValues } from "../src/modules/models.js";
import { importIssuesFromJira } from "../src/modules/jira.js";

function testCalculations() {
  assert.equal(calculatePlannedCapacity(20, 5, 100), 15);
  assert.equal(calculatePlannedCapacity(20, 5, 50), 7.5);
  assert.equal(calculatePlannedCapacity(10, 20, 100), 0);
  assert.equal(sanitizeLoadPercent(150), 100);
  assert.equal(sanitizeLoadPercent(-1), 0);
  assert.equal(sanitizeNonNegative(-10), 0);
}

function testPlanCreation() {
  const plan = createPlan({ name: "Plan A", quarter: "Q2", year: 2026 });
  assert.equal(plan.name, "Plan A");
  assert.equal(plan.periods.length, 1);
  assert.equal(plan.periods[0].quarter, "Q2");
  assert.equal(plan.periods[0].year, 2026);
  assert.ok(plan.capacityRows.length >= 1);
}

function testRowFactories() {
  const period = { id: "period_1" };
  const row = createCapacityRow([period]);
  assert.ok(row.periodValues.period_1);
  row.periodValues.period_1 = createEmptyCapacityPeriodValues();
  assert.equal(row.periodValues.period_1.daysOff, 0);

  const backlogRow = createBacklogRow({ key: "ABC-1", source: "jira" });
  assert.equal(backlogRow.key, "ABC-1");
  assert.equal(backlogRow.source, "jira");
}

async function testJiraImportMapping() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const urlString = String(url);
    if (urlString.includes("/secure/QueryComponent!Jql.jspa")) {
      return {
        ok: true,
        status: 200,
        text: async () => ""
      };
    }
    if (urlString.includes("/rest/issueNav/1/issueTable")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            issues: [
              {
                key: "JIRA-123",
                summary: "Sample issue",
                issueType: { name: "Story" },
                priority: { name: "High" },
                customfield_10016: 5
              }
            ]
          })
      };
    }
    return {
      ok: true,
      json: async () => ({
        total: 1,
        issues: [
          {
            key: "JIRA-123",
            fields: {
              summary: "Sample issue",
              issuetype: { name: "Story" },
              priority: { name: "High" },
              customfield_10016: 5
            }
          }
        ]
      })
    };
  };

  const result = await importIssuesFromJira({
    baseUrl: "https://jira.local",
    jql: "project = TEST"
  });

  assert.equal(result.total, 1);
  assert.equal(result.mappedRows.length, 1);
  assert.equal(result.mappedRows[0].key, "JIRA-123");
  assert.equal(result.mappedRows[0].estimation, "5");

  globalThis.fetch = originalFetch;
}

async function run() {
  testCalculations();
  testPlanCreation();
  testRowFactories();
  await testJiraImportMapping();
  console.log("All smoke tests passed.");
}

run();
