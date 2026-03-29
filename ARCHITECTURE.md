# Architecture — Jira Planning Tool (extension)

This document describes the technical architecture of the browser extension so that new features (sprint-based planning, velocity, UI) can align with existing calculations and data flows.

## 1. Stack and entry points

| Layer | Location |
|-------|----------|
| UI shell | [`src/app.html`](src/app.html), [`src/styles.css`](src/styles.css) |
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
│   ├── render/         # UI: capacity/backlog strategies (by_team / by_roles), ui.js
│   ├── services/       # metrics.js — aggregations per period
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
- **`capacityRows[]`** — each row has `periodValues[periodId]` (working days, estimation per day, balances, etc.). **`roleId`** references an entry in **`plan.roleOptions[]`** (`{ id, label }`). Legacy `role` / `specialization` strings are migrated on load via [`migrateLegacyRolesToCatalog`](src/modules/app/roleCatalog.js). When a row is appended, **`workingDays`** for each period is initialized from the **previous last row** in `capacityRows` (then derived fields are recomputed); see `handleAddCapacityRow` in [`src/app.js`](src/app.js).
- **`roleOptions[]`** — per-plan list of roles for the capacity Role column. Users can add or edit roles via **+ Add role…** in the capacity row select and manage the full list in **Settings** (create / rename / delete; deleting a role clears `roleId` on rows that used it). Default seed for new plans: Developer, Analyst, QA; see [`createDefaultRoleOptions`](src/modules/models.js).
- **`teamPeriodValues[periodId]`** — team-level overrides (e.g. team Story Points per day mode).
- **`backlogRows[]`** — imported or manual issues; **`targetPeriodId`** chosen in the backlog **Period** column (dropdown of `plan.periods` labels). No default: the user must pick a period (empty / placeholder means no demand attributed to any period). **`periodValues[].plannedEstimation`** and **Available balance** (remaining = supply − planned) come from [`applyPlannedFromBacklog`](src/modules/app/services/backlogDemand.js) (By team / By roles as documented there).

Per-plan settings include: `estimationType`, `resourceGroupingType`, `jiraBaseUrl`, `estimationFieldName`, `lastImportJql`, `defaultWorkingDays`, **`defaultLoadPercent`** (Load % for all capacity rows, default 100; applied to every row on Settings Save), and planning-mode fields below.

### 3.2 Period object

Each period has at minimum:

- `id` (stable key for maps)
- `label` (display)
- `quarter`, `year` (legacy compatibility)
- **`kind`**: `"quarter"` | `"sprint"`
- **`anchorQuarter`**, **`anchorYear`** — the quarter window the period belongs to
- **`sprintIndex`** — optional, `1..N` when `kind === "sprint"`

Factories: [`src/modules/models.js`](src/modules/models.js) (`createPeriod`), [`src/modules/planning/periodFactory.js`](src/modules/planning/periodFactory.js) (`buildSprintPeriods`, `suggestSprintCount`).

## 4. Resource grouping (unchanged contract)

- **`by_team`** — one team column group; metrics aggregate as today.
- **`by_roles`** — split by role; implemented via strategy files under `src/modules/app/render/capacity/` and `render/backlog/`.

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

` suggestSprintCount(anchorQuarter, anchorYear, sprintDurationDays)` returns a hint; it must not overwrite `sprintCount` unless the product flow explicitly applies it.

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
- **Re-import / merge:** rows match on normalized **issue key** (`normalizeBacklogIssueKey`). Existing keys get Jira-sourced fields updated; new keys are **appended**. Duplicate keys in stored backlog are deduped (first row wins) before merge; new rows from one import batch are registered so the same key cannot appear twice in that batch.
- **Jira field for estimates** is configured in the **Import backlog from Jira** dialog (not in Settings): labels and placeholders follow **Estimation type** from plan settings — **Story Points** → custom field id (e.g. `customfield_…`, required before import); **Man-days** → field id for numeric/time estimate (e.g. `timeoriginalestimate`, optional; empty defaults to `timeoriginalestimate` at import). Stored per plan as `plan.estimationFieldName` (see `resolveImportEstimationFieldName` / `syncImportEstimationFieldUi` in [`src/app.js`](src/app.js)).

## 7. Persistence and migration

- Load/save: [`src/modules/storage.js`](src/modules/storage.js).
- **Any new plan-level field** must be backfilled in [`src/app.js`](src/app.js) `init()` for older stored state (see existing patterns for `planningTimeMode`, `velocity`, period `kind`, `targetPeriodId`).

## 8. Build and distribution

- Development: `npm run dev` / `npm run build:watch` as documented in [`README.md`](README.md).
- Load unpacked extension from **`dist/`** after `npm run build`.
- [`manifest.json`](manifest.json) must list web-accessible resources so nested modules under `src/**` resolve in the packaged extension.

## 9. Documentation map

| Doc | Scope |
|-----|--------|
| This file | Architecture and planning modes |
| [`CURSOR_PROJECT_RULES.md`](CURSOR_PROJECT_RULES.md) | IDE/agent conventions and project rules |
| [`README.md`](README.md) | Run and build instructions |

---

*Last updated to match the planning module layout and quarter/sprint architecture layer.*
