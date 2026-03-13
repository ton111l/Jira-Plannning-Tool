# App Module Map

This folder contains the gradual decomposition of the former monolithic `src/app.js`.

## Structure

- `constants.js` - shared constants (`ROLE_OPTIONS`, estimation labels, grouping modes).
- `runtime.js` - shared runtime containers (`refs`, `runtime` state holder).
- `refs.js` - DOM references bootstrap (`cacheRefs`).
- `services/metrics.js` - capacity aggregation formulas (member/team/role totals).
- `render/ui.js` - generic UI rendering helpers (tabs, settings, overlays, FAB positioning).
- `render/backlog.js` - backlog table rendering.
- `actions/backlog.js` - backlog mode actions (`manual` and import dialog bootstrap).
- `events/bindEvents.js` - central DOM event wiring.

## How to change code safely

- UI-only changes: start in `render/*`.
- Business formulas: change only in `services/metrics.js`.
- Data mutation flows: change in `actions/*`.
- Event binding: update `events/bindEvents.js`.
- Keep `src/app.js` as orchestrator and integration layer.
