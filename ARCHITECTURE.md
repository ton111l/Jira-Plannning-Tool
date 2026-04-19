# Architecture — Jira Planning Tool (extension)

This document describes the technical architecture of the browser extension so that new features (sprint-based planning, velocity, UI) can align with existing calculations and data flows.

## 1. Stack and entry points

| Layer | Location |
|-------|----------|
| UI shell | [`src/app.html`](src/app.html), [`src/styles.css`](src/styles.css) |
| User help (static page) | [`public/help.html`](public/help.html) → copied to `dist/help.html` at build (see §8.1) |
| Application orchestration | [`src/app.js`](src/app.js) — tabs, modals, persistence, render pipeline |
| Extension background | [`src/background.js`](src/background.js) |
| Jira page bridge | [`src/content/jira-content.js`](src/content/jira-content.js), [`src/content/jira-page-bridge.js`](src/content/jira-page-bridge.js) |
| Build | [Vite](https://vitejs.dev/) + [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin) — output in `dist/` |

**Stack:** Manifest V3, vanilla JavaScript (ES modules), native CSS. No framework, no CDN dependencies in runtime.

## 2. Layered module layout

```
src/modules/
├── app/
│   ├── actions/        # User actions (settings, backlog)
│   ├── events/         # bindEvents — DOM wiring
│   ├── render/         # UI: capacity/backlog strategies (by_team / by_roles / by_member), ui.js
│   ├── services/       # metrics.js; backlogDemand.js (backlog → planned); backlogRoleSplits.js (default Split %)
│   ├── state.js        # active plan, regroup by role, sanitizers
│   └── constants.js
├── planning/           # Time-mode rules and period factories (see §5)
├── jira.js             # Import / Search API
├── models.js           # Plan, period, row factories
├── storage.js          # chrome.storage.local
└── calculations.js     # Shared numeric helpers
```

**Rule:** `src/app.js` stays thin; domain logic lives in `modules/`.

## 3. Core data model

### 3.1 Plan

Stored in `chrome.storage.local` as part of app state. Key concepts:

- **`periods[]`** — **single** timeline abstraction. All capacity and team metrics are keyed by `period.id`. Do not introduce a parallel “sprints array” beside `periods`.
- **`capacityRows[]`** — each row has `periodValues[periodId]` (working days, estimation per day, balances, etc.). **`roleId`** references an entry in **`plan.roleOptions[]`** (`{ id, label }`). Legacy `role` / `specialization` strings are migrated on load via [`migrateLegacyRolesToCatalog`](src/modules/app/roleCatalog.js). When a row is appended, **`workingDays`** for each period is set from **`plan.defaultWorkingDays`** (Settings **Working days for all rows**), then derived fields are recomputed; see `handleAddCapacityRow` in [`src/app.js`](src/app.js).
- **`roleOptions[]`** — per-plan list of roles for the capacity Role column. Users can add or edit roles via **+ Add role…** in the capacity row select and manage the full list in **Settings** (create / rename / delete; deleting a role clears `roleId` on rows that used it). Default seed for new plans: Developer, Analyst, QA; see [`createDefaultRoleOptions`](src/modules/models.js).
- **`teamPeriodValues[periodId]`** — team-level overrides (e.g. team Story Points per day mode).
- **`defaultRoleSplitPctByRoleId`** — map **role option id** → default **Split (%)** for backlog (Story Points + **By roles** only). One entry per role; values must sum to **100%**. Seeded by [`buildEqualDefaultRoleSplitPctByRoleId`](src/modules/models.js); Settings save validates via [`validateAndCollectDefaultRoleSplitPct`](src/modules/app/actions/settings.js). Visibility of the **Default % SP by roles** block follows **live** Settings form values via [`syncSettingsDefaultRoleSplitSection`](src/modules/app/render/ui.js) (Story Points + **By roles** only; updated when the dialog renders and when Estimation type or Resource grouping changes). See §4.
- **`backlogRows[]`** — imported or manual issues; **`targetPeriodId`** chosen in the backlog **Period** column (dropdown of `plan.periods` labels). No default: the user must pick a period (empty / placeholder means no demand attributed to any period). When **`resourceGroupingType`** is **`by_member`**, **`targetCapacityRowId`** references a **`capacityRows[].id`** (Member column); full issue **estimation** for that period is attributed only to that row. **`periodValues[].plannedEstimation`** and **Available balance** (remaining = supply − planned) come from [`applyPlannedFromBacklog`](src/modules/app/services/backlogDemand.js) (By team / By roles / By member as documented there).

**Backlog table UI (selection and delete):** The first column is checkboxes only (header: select-all). Checkboxes use `data-backlog-select` / `data-row-id` and are **not** stored on `backlogRows[]` — pure UI state until an action runs. **Delete selected** (toolbar next to import) removes chosen rows by `id` after confirmation via the shared delete dialog ([`openDeleteConfirmDialog`](src/app.js)). Change handlers: `handleBacklogSelectionChange`, `handleDeleteSelectedBacklogRows`, `syncBacklogSelectAllState`, `updateBacklogBulkActionsState` in [`src/app.js`](src/app.js); DOM wiring in [`src/modules/app/events/bindEvents.js`](src/modules/app/events/bindEvents.js). [`renderBacklogOverlay`](src/modules/app/render/ui.js) hides `#backlogBulkActions` when the backlog zero-state overlay is shown (same visibility rule as the top **Import** button). Table markup: [`render/backlog/byTeam.js`](src/modules/app/render/backlog/byTeam.js), [`byRoles.js`](src/modules/app/render/backlog/byRoles.js), [`byMember.js`](src/modules/app/render/backlog/byMember.js). `handleTableInput` does not receive backlog `section`/`field` on checkboxes, so toggling selection does not touch row fields.

**Backlog layout (CSS):** [`src/styles.css`](src/styles.css) — `#backlogTable.backlog-import-table` uses `backlog-import-by-team` / `backlog-import-by-roles` / `backlog-import-by-member` with `width`/`min-width: max-content` so the grid does not stretch to fill the panel; `.backlog-col-select` is fixed narrow; Key and Summary use explicit min widths so issue keys and titles stay readable.

**Backlog demand flow:** [`getBacklogRowPeriodId(row, plan)`](src/modules/app/services/backlogDemand.js) resolves which period a row counts toward (only when `targetPeriodId` matches a `plan.periods[].id`). Before capacity render, [`src/app.js`](src/app.js) calls `applyPlannedFromBacklog` so member `plannedEstimation` and team roll-ups match backlog rows for that period. Capacity UI shows **Planned** (`sumPlannedForPeriod` / role-group sums) and **Available balance** as supply minus planned (see `render/capacity/byTeam.js`, `byRoles.js`). [`sumPlannedForPeriod`](src/modules/app/services/backlogDemand.js) returns the sum of per-row planned values **rounded to 2 decimal places** so **Per team** merged totals do not show float noise (e.g. `409.02000000000004`).

Per-plan settings include: `estimationType`, `resourceGroupingType`, `jiraBaseUrl`, `estimationFieldName`, `lastImportJql`, `defaultWorkingDays`, **`defaultLoadPercent`** (Load % for all capacity rows, default 100; applied to every row on Settings Save), **`capacityTableViewMode`**: `full` | `compact` (Capacity **View** — Compact **omits** **Days off** and all **Per member** cells so header `colspan` matches the body; **Per team** / **Role total** columns stay. Implemented by a second, flatter thead + fewer `td` per row, not CSS-only hide). In compact mode, [`src/styles.css`](src/styles.css) sets `#capacityTable.grid-table.capacity-view-compact` to `width`/`min-width: max-content` so the table is **not** forced to full panel width (unlike **full**, which keeps the default `.grid-table` `min-width: 100%`). Planning-mode fields below.

**Capacity Story Points + By team / By member:** When `estimationType` is Story Points and `resourceGroupingType` is **`by_team`** or **`by_member`**, [`render/capacity/index.js`](src/modules/app/render/capacity/index.js) adds class **`capacity-sp-by-team-layout`** on `#capacityTable` and uses the **By team** renderer for both (flat member rows). If the plan has **no sprint** periods, [`render/capacity/byTeam.js`](src/modules/app/render/capacity/byTeam.js) renders a **two-row** header (no third “Per member / Per team” sub-header row). **By team** uses **`(Per team)`** labels and merged team cells for those metrics; **By member** uses **`(Per member)`** and **one row per member** for Available capacity, Story Points per day, Planned, and Available balance. Compact view mirrors the same **(Per team)** vs **(Per member)** distinction. If **any** period is a sprint, the table keeps the **three-row** header with Per member / Per team sub-columns so sprint blocks stay aligned. **Per team Story Points per day** is stored in **`plan.teamPeriodValues[periodId]`** (`teamEstimationMode`: `average` | `manual`, `teamEstimationPerDay`). The team-level cell is **editable** for **By team**; **By member** edits per-row `rowEstimationPerDay`. Display follows [`metrics.js`](src/modules/app/services/metrics.js). On change, [`handleTableInput`](src/app.js) sets `field === "rowEstimationPerDayTeam"` to **`manual`** when editing the team cell (**By team**), then recomputes capacity rows.

### 3.2 Period object

Each period has at minimum:

- `id` (stable key for maps)
- `label` (display)
- `quarter`, `year` (legacy compatibility)
- **`kind`**: `"quarter"` | `"sprint"`
- **`anchorQuarter`**, **`anchorYear`** — the quarter window the period belongs to
- **`sprintIndex`** — optional, `1..N` when `kind === "sprint"`

Factories: [`src/modules/models.js`](src/modules/models.js) (`createPeriod`), [`src/modules/planning/periodFactory.js`](src/modules/planning/periodFactory.js) (`buildSprintPeriods`, `suggestSprintCount`).

## 4. Resource grouping

- **`by_team`** — backlog effective demand (estimation × team allocation %) is split **evenly** across all capacity rows; capacity UI uses [`render/capacity/byTeam.js`](src/modules/app/render/capacity/byTeam.js); backlog UI [`render/backlog/byTeam.js`](src/modules/app/render/backlog/byTeam.js).
- **`by_roles`** — demand is split by per-role **Split (%)** columns on backlog rows, then distributed across capacity rows that share that role; capacity UI [`render/capacity/byRoles.js`](src/modules/app/render/capacity/byRoles.js); backlog [`render/backlog/byRoles.js`](src/modules/app/render/backlog/byRoles.js). In **full** Capacity view, **Planned** and **Available balance** use **Role total** only (no Per member sub-columns); **Available capacity** and **Story Points per day** still use Per member + Role total. **Settings → Default % SP by roles:** one numeric field per role (same catalog as **Roles for this plan**); **Save** rejects unless the sum is **100%** (±0.02). Editing the **first** field runs **`distributeDefaultRoleSplitFromFirst`** ([`render/ui.js`](src/modules/app/render/ui.js)), which assigns the remainder equally to the other rows (last row absorbs rounding). Live **Total** under the list reflects validity. New plans and **`init()`** migration use **`buildEqualDefaultRoleSplitPctByRoleId`** when any role is missing a stored default. Empty backlog **Split (%)** cells are filled from plan defaults by [`applyDefaultRoleSplitsToBacklogRows`](src/modules/app/services/backlogRoleSplits.js) (does not overwrite non-empty splits) when saving Settings, after import, and when enabling manual backlog with an empty table.
- **`by_member`** — each backlog row picks one **Member** (`targetCapacityRowId` → `capacityRows[].id`); full **estimation** for the row’s **Period** is added to that capacity row’s `plannedEstimation` for that period (see [`applyPlannedFromBacklog`](src/modules/app/services/backlogDemand.js)). Capacity reuses the **By team** renderer ([`render/capacity/byTeam.js`](src/modules/app/render/capacity/byTeam.js)) but Story Points column headers use **(Per member)** and **per-row** cells for Available capacity, SP/day, Planned, and Available balance (no merged **Per team** block). Backlog: [`render/backlog/byMember.js`](src/modules/app/render/backlog/byMember.js).

Planning time mode does **not** replace this; it only changes how `periods` are sliced and which estimation options are valid.

## 5. Planning time modes (quarter vs sprint)

Implemented as **data + constraint layer** without mandatory UI (see [`src/modules/planning/`](src/modules/planning/)).

### 5.1 `planningTimeMode`

- **`quarter`** (default) — periods are calendar quarters (`period.kind === "quarter"`).
- **`sprint`** — periods are sprint slices inside one anchor quarter (`period.kind === "sprint"`). Same `period.id` indexing for metrics.

### 5.2 Anchor and sprint metadata (on the plan)

| Field | Purpose |
|-------|---------|
| `anchorQuarter`, `anchorYear` | Quarter into which sprint periods are packed |
| `sprintDurationDays` | Input for **suggesting** sprint count (not authoritative alone) |
| `sprintCount` | Persisted number of sprint periods (user-editable when UI exists) |

[`suggestSprintCount`](src/modules/planning/periodFactory.js) returns a hint (inputs: anchor quarter/year, sprint duration); it must not overwrite `sprintCount` unless the product flow explicitly applies it.

### 5.3 Estimation rules

- **Quarter mode:** `estimationType` can be `story_points` or `person_days` (Man-days).
- **Sprint mode:** only Story Points are valid for calculations. [`getEffectiveEstimationType(plan)`](src/modules/planning/planConstraints.js) forces `story_points` when `planningTimeMode === sprint`.

Use **`isPersonDaysAllowed(plan)`** before exposing Man-days in future UI.

### 5.4 Invariants and normalization

- [`assertPlanInvariants(plan)`](src/modules/planning/planConstraints.js) — structural checks (e.g. sprint mode + person_days, unknown `targetPeriodId`).
- [`normalizePlanForMode(plan)`](src/modules/planning/planConstraints.js) — safe fixes (e.g. coerce estimation for sprint mode).

Called from app `init()` migration; failures can be logged with `console.warn`.

### 5.5 Velocity (stub)

- `plan.velocity = { mode: "none" | "per_period", perPeriod: { [periodId]: number } }`

Metrics in [`src/modules/app/services/metrics.js`](src/modules/app/services/metrics.js) are **not** wired to velocity until requirements are defined. All velocity reads should go through this object later.

### 5.6 Mode transitions (future)

Switching `quarter` ↔ `sprint` may require rebuilding `periods` and remapping `periodValues` / `targetPeriodId`. Do not reuse old `period.id` values without an explicit mapping step (documented as a future migration in code comments).

## 6. Import pipeline

- Primary path: Jira REST Search API and fallbacks — [`src/modules/jira.js`](src/modules/jira.js).
- Progress feedback in the import dialog is staged in [`src/app.js`](src/app.js) (`submitImport`).
- **Re-import / merge:** rows match on normalized **issue key** (`normalizeBacklogIssueKey`). Existing keys get Jira-sourced fields updated; new keys are **appended**. Rows removed locally (e.g. **Delete selected**) are simply absent from `backlogRows[]`; if the same issue appears again in a Jira import result, it is merged as a **new** row like any other missing key. Duplicate keys in stored backlog are deduped (first row wins) before merge; new rows from one import batch are registered so the same key cannot appear twice in that batch.
- **Jira field for estimates** is configured in the **Import backlog from Jira** dialog (not in Settings): labels and placeholders follow **Estimation type** from plan settings — **Story Points** → custom field id (e.g. `customfield_…`, required before import); **Man-days** → field id for numeric/time estimate (e.g. `timeoriginalestimate`, optional; empty defaults to `timeoriginalestimate` at import). Stored per plan as `plan.estimationFieldName` (see `resolveImportEstimationFieldName` / `syncImportEstimationFieldUi` in [`src/app.js`](src/app.js)).

## 7. Persistence and migration

- Load/save: [`src/modules/storage.js`](src/modules/storage.js).
- **Any new plan-level field** must be backfilled in [`src/app.js`](src/app.js) `init()` for older stored state (see existing patterns for `planningTimeMode`, `velocity`, period `kind`, `targetPeriodId`, **`targetCapacityRowId`** (empty string), **`capacityTableViewMode`**, and **`defaultRoleSplitPctByRoleId`** — for Story Points + **By roles**, missing or incomplete defaults are replaced with [`buildEqualDefaultRoleSplitPctByRoleId`](src/modules/models.js)).

## 8. Build and distribution

- Development: `npm run dev` / `npm run build:watch` as documented in [`README.md`](README.md).
- Load unpacked extension from **`dist/`** after `npm run build`.
- [`manifest.json`](manifest.json) must list web-accessible resources so nested modules under `src/**` resolve in the packaged extension.

### 8.1 Static help page (`public/help.html`)

- Vite copies everything under [`public/`](public/) to the **root** of `dist/`, so [`public/help.html`](public/help.html) becomes **`dist/help.html`** (alongside `dist/src/…`).
- The page is plain HTML plus [`public/help-page.js`](public/help-page.js) (copied next to `dist/help.html` as `dist/help-page.js`). **Inline `<script>` in HTML is not used:** Chrome extension MV3 **CSP** blocks inline scripts on `chrome-extension://` pages, so language switching lives in the external file. Bilingual body copy in **`#help-content-en`** (English, **default**) and **`#help-content-ru`** (Russian). Toolbar buttons **Eng** / **Ru** toggle visibility and update `<html lang>`, `document.title`, and `aria-pressed`. Language choice is persisted in **`localStorage`** under **`helpPageLang`** (`en` | `ru`).
- Styling: `<link href="src/styles.css">` resolves from `dist/help.html` to `dist/src/styles.css`; help-only layout rules live in a `<style>` block in the same file.
- Entry point from the app: [`src/app.html`](src/app.html) top bar — link with **ℹ️** (left of Settings) uses `href="../help.html"` and `target="_blank"` so the guide opens in a new tab (`chrome-extension://…/help.html`).

## 9. Documentation map

| Doc | Scope |
|-----|--------|
| This file | Architecture and planning modes |
| [`CURSOR_PROJECT_RULES.md`](CURSOR_PROJECT_RULES.md) | IDE/agent conventions and project rules |
| [`README.md`](README.md) | Run and build instructions |
| [`public/help.html`](public/help.html) | End-user instructions (EN/RU); not a duplicate of this architecture doc |

---

*Last updated: **by_member** capacity — `(Per member)` headers and per-row SP columns in [`byTeam.js`](src/modules/app/render/capacity/byTeam.js) (incl. compact); **default % SP by roles** + [`syncSettingsDefaultRoleSplitSection`](src/modules/app/render/ui.js); [`sumPlannedForPeriod`](src/modules/app/services/backlogDemand.js) rounding; capacity SP layout (`capacity-sp-by-team-layout`); planning quarter/sprint layer.*
