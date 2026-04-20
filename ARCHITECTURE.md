# Architecture — Jira Planning Tool (extension)

This document describes the technical architecture of the browser extension so that new features (sprint-based planning, velocity, UI) can align with existing calculations and data flows.

## 1. Stack and entry points

| Layer | Location |
|-------|----------|
| UI shell | [`src/app.html`](src/app.html), [`src/styles.css`](src/styles.css) |
| User help (static page) | [`src/help.html`](src/help.html) + [`src/help-page.js`](src/help-page.js) (same folder as `app.html`; see §8.1) |
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
│   ├── services/       # metrics.js; backlogDemand.js (backlog → planned); backlogRoleSplits.js (default Split %); backlogRoleSplitValidation.js (by_roles: **Split (%)** and per-role **Story Point** stay in sync — edit either side; story points derive from epic×split%, or split% from role SP÷epic; invalid row class + English `title` when split sum > 100% or sum of role SP > epic)
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
- **`defaultRoleSplitPctByRoleId`** — map **role option id** → default **Split (%)** for backlog (Story Points + **By roles** or **By member**). One entry per role; values must sum to **100%**. Seeded by [`buildEqualDefaultRoleSplitPctByRoleId`](src/modules/models.js); Settings save validates via [`validateAndCollectDefaultRoleSplitPct`](src/modules/app/actions/settings.js). Visibility of the **Default % SP by roles** block follows **live** Settings form values via [`syncSettingsDefaultRoleSplitSection`](src/modules/app/render/ui.js) (Story Points + **By roles** or **By member**; updated when the dialog renders and when Estimation type or Resource grouping changes). See §4.
- **`backlogRows[]`** — imported or manual issues; **`targetPeriodId`** chosen in the backlog **Period** column (dropdown of `plan.periods` labels). No default: the user must pick a period (empty / placeholder means no demand attributed to any period). When **`resourceGroupingType`** is **`by_member`**, **`targetCapacityRowIdByRoleId`** (map **role option id** → **capacity row id**) plus **`split_*_pct`** attribute each role’s share of the estimation to a member; if unused, legacy **`targetCapacityRowId`** attributes the **full** estimation to one row. Optional **`estimationKind`** (`story_points` | `person_days`) records what the **`estimation`** number means; when set, UI and demand use [`getBacklogEstimationForPlan`](src/modules/app/render/shared/backlogHelpers.js) so switching **`plan.estimationType`** does not show SP as Man-days (or the reverse). Rows without **`estimationKind`** (legacy) still show **estimation** for any plan type. **`periodValues[].plannedEstimation`** and **Available balance** (remaining = supply − planned) come from [`applyPlannedFromBacklog`](src/modules/app/services/backlogDemand.js) (By team / By roles / By member as documented there).

**Backlog table UI (selection, toolbar):** The first column is checkboxes only (header: select-all). Checkboxes use `data-backlog-select` / `data-row-id` and are **not** stored on `backlogRows[]` — pure UI state until an action runs. **`#backlogToolbar`** (when the table is not in the empty overlay state) groups quick **Filter** (`#backlogQuickFilter`, client-side key/summary match), bulk **Period** (applies immediately to selected rows on select change), **Delete selected**, and **View** (`plan.backlogTableViewMode`: `full` | `compact`). Topbar export (`#planExportBtn`) is plan-level and not per-tab. The bottom stats strip (`#backlogStatsBar`) shows **Total items / Filtered items / Selected items** and is recalculated by filter + selection handlers. Delete removes chosen rows by `id` after confirmation ([`openDeleteConfirmDialog`](src/app.js)). Invalid **By roles / By member** split rows are counted by [`countBacklogRowsWithInvalidRoleSplits`](src/modules/app/services/backlogRoleSplitValidation.js); [`syncBacklogSplitSummary`](src/modules/app/render/ui.js) shows a short status line under the toolbar. Change handlers: `handleBacklogSelectionChange`, `handleDeleteSelectedBacklogRows`, `updateBacklogBulkActionsState`, density / bulk period handlers in [`src/app.js`](src/app.js); DOM wiring in [`src/modules/app/events/bindEvents.js`](src/modules/app/events/bindEvents.js). [`renderBacklogOverlay`](src/modules/app/render/ui.js) hides **`#backlogToolbar`** (and stats bar) when the backlog zero-state overlay is shown. Table markup: [`render/backlog/byTeam.js`](src/modules/app/render/backlog/byTeam.js), [`byRoles.js`](src/modules/app/render/backlog/byRoles.js), [`byMember.js`](src/modules/app/render/backlog/byMember.js). `handleTableInput` does not receive backlog `section`/`field` on checkboxes, so toggling selection does not touch row fields.

**Backlog layout (CSS):** [`src/styles.css`](src/styles.css) — `#backlogTable.backlog-import-table` uses `backlog-import-by-team` / `backlog-import-by-roles` / `backlog-import-by-member` with `width`/`min-width: max-content` so the grid does not stretch to fill the panel; `.backlog-col-select` is fixed narrow; Key and Summary use explicit min widths so issue keys and titles stay readable. Both backlog and capacity table areas scroll inside `.table-wrap` when row/column count exceeds available viewport height.

**Backlog demand flow:** [`getBacklogRowPeriodId(row, plan)`](src/modules/app/services/backlogDemand.js) resolves which period a row counts toward (only when `targetPeriodId` matches a `plan.periods[].id`). Before capacity render, [`src/app.js`](src/app.js) calls `applyPlannedFromBacklog` so member `plannedEstimation` and team roll-ups match backlog rows for that period. Capacity UI shows **Planned** (`sumPlannedForPeriod` / role-group sums) and **Available balance** as supply minus planned (see `render/capacity/byTeam.js`, `byRoles.js`). [`sumPlannedForPeriod`](src/modules/app/services/backlogDemand.js) returns the sum of per-row planned values **rounded to 2 decimal places** so **Per team** merged totals do not show float noise (e.g. `409.02000000000004`).

Per-plan settings include: `estimationType`, `resourceGroupingType`, `jiraBaseUrl`, `estimationFieldName`, **`importEstimationFieldKind`** (last-used Jira field type in Import dialog), `lastImportJql`, `defaultWorkingDays`, **`defaultLoadPercent`** (Load % for all capacity rows, default 100; applied to every row on Settings Save), **`capacityTableViewMode`**: `full` | `compact` (Capacity **View** — Compact **omits** **Days off** and all **Per member** cells so header `colspan` matches the body; **Per team** / **Role total** columns stay. Implemented by a second, flatter thead + fewer `td` per row, not CSS-only hide), **`backlogTableViewMode`**: `full` | `compact` (legacy `comfortable` normalized to `full` in `init()`). [`src/styles.css`](src/styles.css) sets `#capacityTable.grid-table` to `width`/`min-width: max-content` for **both** **full** and **compact** so the table stays **left-aligned** and only as wide as its columns; horizontal overflow scrolls inside `#capacityTableWrap.table-wrap`.

**Capacity table UI (selection, toolbar):** Capacity now mirrors backlog selection mechanics: first column uses checkbox select-all/row-select (`data-capacity-select`), the old **Act** column is removed, and toolbar bulk action is **Delete selected**. Quick filter (`#capacityQuickFilter`) matches **Member** and **Role**. Bottom stats strip (`#capacityStatsBar`) shows **Total rows / Filtered rows / Selected rows**. In `#capacityTableWrap`, extra bottom spacing is reserved so the floating `+` row button does not cover last visible rows.

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

- **`by_team`** — effective demand (**estimation** × **`teamAllocationPercent`**, default **100%** when unset — optional field on row data, no backlog column) is split **evenly** across all capacity rows; see [`getTeamModeEffectiveDemand`](src/modules/app/services/backlogDemand.js). Capacity UI [`render/capacity/byTeam.js`](src/modules/app/render/capacity/byTeam.js); backlog UI [`render/backlog/byTeam.js`](src/modules/app/render/backlog/byTeam.js) — Key through Period only.
- **`by_roles`** — demand is split by per-role **Split (%)** columns on backlog rows, then distributed across capacity rows that share that role; capacity UI [`render/capacity/byRoles.js`](src/modules/app/render/capacity/byRoles.js); backlog [`render/backlog/byRoles.js`](src/modules/app/render/backlog/byRoles.js). In **full** Capacity view, **Planned** and **Available balance** use **Role total** only (no Per member sub-columns); **Available capacity** and **Story Points per day** still use Per member + Role total. **Settings → Default % SP by roles** (visible for Story Points + **By roles** or **By member**): one numeric field per role (same catalog as **Roles for this plan**); **Save** rejects unless the sum is **100%** (±0.02). Editing the **first** field runs **`distributeDefaultRoleSplitFromFirst`** ([`render/ui.js`](src/modules/app/render/ui.js)), which assigns the remainder equally to the other rows (last row absorbs rounding). Live **Total** under the list reflects validity. New plans and **`init()`** migration use **`buildEqualDefaultRoleSplitPctByRoleId`** when any role is missing a stored default. Empty backlog **Split (%)** cells are filled from plan defaults by [`applyDefaultRoleSplitsToBacklogRows`](src/modules/app/services/backlogRoleSplits.js) (does not overwrite non-empty splits) when saving Settings, after import, and when enabling manual backlog with an empty table.
- **`by_member`** — backlog uses **Member by roles**: under [`render/backlog/byMember.js`](src/modules/app/render/backlog/byMember.js) the table has a **three-row** header (group **Member by roles**, then role names, then **Split (%)** | **Member** per role). For each role, **`split_*_pct`** defines the share of the issue **estimation**; **`targetCapacityRowIdByRoleId`** maps **role option id** → **capacity row id** for that share. [`applyPlannedFromBacklog`](src/modules/app/services/backlogDemand.js) adds each role’s portion to the selected member’s `plannedEstimation`. If no per-role member is assigned (legacy), **`targetCapacityRowId`** still attributes the **full** estimation to one member. Default **Split (%)** values are filled from plan defaults via [`applyDefaultRoleSplitsToBacklogRows`](src/modules/app/services/backlogRoleSplits.js) (same as **By roles**). Capacity reuses the **By team** renderer ([`render/capacity/byTeam.js`](src/modules/app/render/capacity/byTeam.js)) with **(Per member)** headers and per-row metric cells (no merged **Per team** block).

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

Current create flow detail: when sprint planning is applied during plan creation, the anchor quarter period is **replaced** by generated sprint periods (not kept in parallel), and related quarter keys are removed from `teamPeriodValues`/`capacityRows.periodValues`.

## 6. Import pipeline

- Primary path: Jira REST Search API and fallbacks — [`src/modules/jira.js`](src/modules/jira.js).
- Progress feedback in the import dialog is staged in [`src/app.js`](src/app.js) (`submitImport`).
- **Re-import / merge:** rows match on normalized **issue key** (`normalizeBacklogIssueKey`). Existing keys get Jira-sourced fields updated; new keys are **appended**. Rows removed locally (e.g. **Delete selected**) are simply absent from `backlogRows[]`; if the same issue appears again in a Jira import result, it is merged as a **new** row like any other missing key. Duplicate keys in stored backlog are deduped (first row wins) before merge; new rows from one import batch are registered so the same key cannot appear twice in that batch.
- **Jira field for estimates** is configured in the **Import backlog from Jira** dialog (not in Settings): the dialog includes **Jira estimation field type** (Story Points vs Man-days) **independent of** Settings **Estimation type**. The text field is the Jira field id (`plan.estimationFieldName`). **Story Points** type requires a non-empty custom field id; **Man-days** may be empty (defaults to `timeoriginalestimate` when resolving the API field). [`resolveImportEstimationFieldNameForImport`](src/app.js) / [`syncImportEstimationFieldUi`](src/app.js) use the **dialog** field type, not `plan.estimationType`. On merge, each imported row gets `estimationKind` (`story_points` | `person_days`). Display and [`applyPlannedFromBacklog`](src/modules/app/services/backlogDemand.js) use [`getBacklogEstimationForPlan`](src/modules/app/render/shared/backlogHelpers.js) so values **do not** appear as the wrong unit when the user switches plan **Estimation type** in Settings. Legacy rows without `estimationKind` still show `estimation` for any plan type. Manual edits set `estimationKind` to the current plan type. `plan.importEstimationFieldKind` stores the last-used import field type (dialog default).

## 7. Persistence and migration

- Load/save: [`src/modules/storage.js`](src/modules/storage.js).
- **Any new plan-level field** must be backfilled in [`src/app.js`](src/app.js) `init()` for older stored state (see existing patterns for `planningTimeMode`, `velocity`, period `kind`, `targetPeriodId`, **`targetCapacityRowId`** (empty string), **`capacityTableViewMode`**, **`backlogTableViewMode`** (`full` | `compact`, with legacy `comfortable` normalized to `full`), **`defaultRoleSplitPctByRoleId`** — for Story Points + **By roles** or **By member**, missing or incomplete defaults are replaced with [`buildEqualDefaultRoleSplitPctByRoleId`](src/modules/models.js) — and **`importEstimationFieldKind`** / **`backlogRows[].estimationKind`** (import field type vs plan unit; invalid `estimationKind` cleared)).

## 8. Build and distribution

- Development: `npm run dev` / `npm run build:watch` as documented in [`README.md`](README.md).
- Load unpacked extension from **`dist/`** after `npm run build`.
- [`manifest.json`](manifest.json) must list web-accessible resources so nested modules under `src/**` resolve in the packaged extension.

### 8.1 Static help page (`src/help.html`)

- Help lives **next to** [`src/app.html`](src/app.html) so the same unpacked tree works whether you load the extension from the **repo** (manifest at project root) or from **`dist/`** after `vite build`. The ℹ️ link uses `href="help.html"` (resolves to `chrome-extension://…/src/help.html`).
- Companion script: [`src/help-page.js`](src/help-page.js). **Inline `<script>` in HTML is not used:** Chrome extension MV3 **CSP** blocks inline scripts on `chrome-extension://` pages, so language switching lives in the external file. Bilingual body in **`#help-content-en`** (English, **default**) and **`#help-content-ru`** (Russian). Buttons **Eng** / **Ru** toggle visibility and update `<html lang>`, `document.title`, and `aria-pressed`. Language is persisted in **`localStorage`** under **`helpPageLang`** (`en` | `ru`).
- Styling: `<link href="./styles.css">` (same as the main app page). Help-only layout rules stay in a `<style>` block in `help.html`.
- A **`public/`** copy is **not** the source of truth (it used to copy to `dist/help.html` only when building `dist/`, which broke the link when the extension root was the repo without that file).

## 9. Documentation map

| Doc | Scope |
|-----|--------|
| This file | Architecture and planning modes |
| [`CURSOR_PROJECT_RULES.md`](CURSOR_PROJECT_RULES.md) | IDE/agent conventions and project rules |
| [`README.md`](README.md) | Run and build instructions |
| [`src/help.html`](src/help.html) | End-user instructions (EN/RU); not a duplicate of this architecture doc |

---

*Last updated: Topbar plan export (`#planExportBtn`) remains JSON/XLSX. Backlog and Capacity now both use bottom stats strips (total/filtered/selected), checkbox bulk selection, and table-area scrolling inside `.table-wrap`. Capacity removed the `Act` column in favor of bulk `Delete selected`; quick filters are backlog key/summary and capacity member/role. Sprint create flow replaces the anchor quarter with sprint periods, and sprint `Working days` validates positive whole numbers while supporting multi-digit entry.*
