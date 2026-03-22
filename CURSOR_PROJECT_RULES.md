# Cursor Project Rules: Jira Planning Extention

## 1) Project Context

- Project type: Chrome/Edge extension MVP for Jira Data Server / Data Center planning.
- Tech stack: vanilla JavaScript, native CSS, HTML (no framework, no external CDN).
- Entry point: `src/app.js` (orchestrator).
- Primary UI: `src/app.html`, `src/styles.css`.
- Local persistence: `chrome.storage.local`.

## 2) Core Architecture Rules

- Keep `src/app.js` as orchestration layer, not a monolith of all logic.
- Separate concerns by module:
  - render logic -> `src/modules/app/render/*`
  - state helpers -> `src/modules/app/state.js`
  - formulas/aggregations -> `src/modules/app/services/metrics.js`
  - event wiring -> `src/modules/app/events/bindEvents.js`
  - user actions -> `src/modules/app/actions/*`
- For `resourceGroupingType` (`by_team` / `by_roles`), use strategy files (router + per-mode modules) instead of large `if` blocks.

## 3) UI/UX Rules

- Preserve compact table layout and existing class names where possible.
- Do not add external UI libraries.
- Keep destructive actions behind confirmation dialogs.
- Keep modal behavior predictable:
  - close/cancel actions must not be blocked by irrelevant validation.
- Keep zero-state overlays consistent across tabs (blur + clear CTA).

## 4) Data Model Rules

- Plan-level settings must be stored per plan (not only global state):
  - `estimationType`
  - `resourceGroupingType`
  - `jiraBaseUrl`
  - `estimationFieldName`
  - `lastImportJql`
  - `planningTimeMode`, `anchorQuarter`, `anchorYear`, `sprintDurationDays`, `sprintCount`, `velocity`, `defaultWorkingDays`
- New fields must include migration/backward compatibility in `init()` and model factories.
- Do not break existing plan data in storage when introducing new fields.

### Planning time modes (architecture)

- **Single time bucket** remains `plan.periods[]` (each row has `periodValues[periodId]`). Do not add a parallel “sprints array” beside periods.
- **`planningTimeMode`**: `quarter` (default) or `sprint`. Quarter mode: periods are calendar quarters (`period.kind === "quarter"`). Sprint mode: periods are sprint slices inside one anchor quarter (`period.kind === "sprint"`, `sprintIndex` 1..N).
- **Anchor quarter**: `plan.anchorQuarter` / `plan.anchorYear` — the quarter window sprint periods are packed into (even in sprint mode).
- **Sprint metadata** (for UI later): `plan.sprintDurationDays`, `plan.sprintCount`. Use `suggestSprintCount()` in `src/modules/planning/periodFactory.js` only as a hint; persisted `sprintCount` is authoritative.
- **Constraints** (no UI required): `getEffectiveEstimationType()`, `assertPlanInvariants()`, `normalizePlanForMode()` in `src/modules/planning/planConstraints.js`. Sprint mode forces **Story Points** for calculations (`person_days` is invalid for that mode).
- **Velocity** (stub): `plan.velocity = { mode, perPeriod }` — do not wire into `metrics.js` until requirements are defined.
- **Backlog parking** (future UI): `backlogRows[].targetPeriodId` — optional; must reference a `plan.periods[].id` when set.
- **Factories**: `buildSprintPeriods()` in `src/modules/planning/periodFactory.js` for generating sprint periods without duplicating metric keys.

## 5) Jira Import Rules

- Primary import flow: Jira Search API (`/rest/api/2/search`), with robust fallback variants.
- Always request explicit fields when possible.
- Keep key normalization stable (`ABC-123` format).
- Re-import must update Jira-sourced fields by `key` and preserve synthetic/user-calculated fields.
- Maintain import diagnostics:
  - clear user-facing error messages
  - debug logs with `searchMethod`, status context, and sample/statistics.

## 6) Code Style Rules

- Prefer small, composable functions.
- Avoid duplicated logic across `by_team` / `by_roles`; extract shared helpers.
- Keep naming consistent with current conventions.
- Add comments only where intent is non-obvious.
- Default to ASCII in source files.

## 7) Change Safety Rules

- Do not use destructive git commands.
- Do not revert unrelated user changes.
- Make minimal invasive edits for bug fixes; avoid broad rewrites without need.
- For large refactors, preserve behavior first, improve structure second.

## 8) Validation Checklist (before completion)

- `node --check` passes for touched JS modules.
- Lints pass for changed files.
- No regressions in:
  - Capacity table (`by_team`, `by_roles`)
  - Backlog table (`by_team`, `by_roles`)
  - plan switching and per-plan settings rendering
  - import dialog open/close and import gating logic
- No broken selectors or missing refs in `refs.js` and `bindEvents.js`.

## 9) Cursor Agent Working Agreement

- Ask clarifying questions when requirements are ambiguous.
- Propose strategy options for non-trivial architectural changes.
- Implement end-to-end when scope is clear.
- After substantial edits, report:
  - what changed
  - why changed
  - what was validated

## 10) Scalability & Maintainability Best Practices

- Use feature-oriented boundaries:
  - Keep files grouped by feature (`render/capacity/*`, `render/backlog/*`) instead of technical dumping grounds.
- Keep module responsibilities strict:
  - one reason to change per file.
- Keep files small enough for fast navigation:
  - target ~150-300 lines for normal modules;
  - if file grows beyond ~400 lines, split by strategy, state, or UI fragment.
- Prefer explicit contracts between modules:
  - pass typed-like shapes in JSDoc for complex payloads;
  - avoid hidden dependencies on global mutable state.
- Avoid bidirectional dependencies:
  - no cyclic imports between `actions`, `render`, `services`, `state`.
- For mode-specific behavior (`by_team`, `by_roles`), use router + strategy modules.
- Store domain rules in one place:
  - calculations in `services/*`, not duplicated in UI handlers.

## 11) AI-Friendly Context Management Rules

- Optimize for limited context windows:
  - avoid giant “god files” and long mixed-responsibility functions.
- Keep high-signal docs close to code:
  - each major folder should have a short `README.md` with purpose and entrypoints.
- Introduce stable naming patterns:
  - suffixes: `*Action`, `*View`, `*Service`, `*State`, `*Router`.
- Make changes traceable:
  - one feature/refactor should touch a minimal, predictable set of files.
- Prefer additive refactors over rewrites:
  - introduce new module, switch imports, then remove old code.
- Keep helper functions pure when possible:
  - deterministic input/output improves both testing and AI reasoning.
- Avoid “smart” abstractions without repeated use:
  - abstraction is allowed only after 2+ real call sites.

## 12) Extension Design Best Practices (Chrome MV3)

- Keep message contracts explicit:
  - define request/response shapes and stable error codes (`AUTH`, `TIMEOUT`, etc.).
- Separate transport from domain mapping:
  - network call layer != issue mapping layer != UI integration layer.
- Treat Jira parsing as unreliable input:
  - validate required fields and normalize keys early.
- Use defensive fallbacks, but keep priority path clear:
  - one primary import flow and controlled retries.
- Do not block UI on non-critical logs:
  - diagnostics should aid debugging, not alter behavior.
- Keep permissions minimal in `manifest.json`, add only when required.

## 13) Testing & Regression Strategy

- For each non-trivial change, define:
  - affected flows;
  - expected unchanged behavior;
  - explicit regression checklist.
- Minimum checks for UI refactors:
  - render in `by_team` and `by_roles`;
  - plan switching;
  - import open/close and import success/error states.
- Add small smoke scenarios for critical paths:
  - create plan, edit capacity, import backlog, re-import merge by key.
- Prefer targeted tests around bug-prone behavior over broad flaky suites.

## 14) Refactor Protocol for Large Changes

- Step 1: extract code without behavior changes.
- Step 2: switch call sites to new modules.
- Step 3: run lint/syntax checks.
- Step 4: remove deprecated code paths.
- Step 5: re-run regression checklist.
- Never mix deep refactor + feature changes in one unstructured pass.

## 15) Performance & Data Volume Guardrails

- Do not repeatedly recompute whole-table derived values on every keystroke if scope can be narrowed.
- Cache where safe and invalidate explicitly.
- Keep DOM updates scoped:
  - avoid full-table redraw unless needed.
- Use concise logging:
  - include high-value stats and samples, not full payload dumps.
- For imported datasets, prefer incremental merge by `key` over full replace.

## 16) Documentation Discipline

- Update relevant docs when architecture changes:
  - root `README.md` for run/usage-level changes;
  - module `README.md` for structural changes.
- Keep architecture docs short and operational:
  - what module does, inputs, outputs, ownership.
- Every major pattern should have one canonical example in codebase.

## 17) Legal & Privacy Naming Policy

- Do not include references to real companies in code, comments, logs, tests, screenshots, or docs.
- Do not include real corporate attributes:
  - real domains/URLs,
  - company names/brands,
  - internal system names,
  - legal entity names,
  - real project/team/client names.
- Use neutral placeholders in all examples:
  - `https://jira.company.local`
  - `PROJECT_KEY`
  - `Team A`
  - `Example Corp` (only if a generic non-real label is needed).
- Exception:
  - mentioning `Jira` as a product/platform is allowed.
- If existing legacy data contains real identifiers, sanitize during refactor:
  - replace with placeholders before committing.

