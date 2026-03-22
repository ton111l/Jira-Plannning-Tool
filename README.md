# Jira Planning Tool MVP

## Current mode
This MVP is implemented for development/debugging without build packaging first, as defined in BRD.

## How to run locally (Chrome/Edge)
1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select project folder: `d:\projects\Jira Planning Extention`.
5. Click extension icon to open the planning page in a new tab.

## Dev server with auto-reload
- Primary dev flow (Vite + CRXJS):
  - `npm run dev` - runs extension dev/watch flow.
  - Load unpacked from `dist` in `chrome://extensions`.
  - During dev, changes are rebuilt automatically; for some changes Chrome may still require manual extension refresh.
- Production-like build:
  - `npm run build`
  - Load unpacked from `dist`.
- Legacy fallback (BrowserSync):
  - `npm run dev:legacy`
  - `npm run dev:legacy:open`
  - Open: `http://127.0.0.1:4173/src/app.html`
  - This mode is kept for transition/debug fallback.

## Reload limitations to expect
- Changes in `manifest.json`, permissions, and some service worker updates may require manual extension reload.
- Content script updates on already-open Jira tabs can require tab refresh.

## Implemented features
- `Create Plan` and `Select Plan` with local persistence.
- `Capacity` tab:
  - Team name field.
  - Dynamic `+ Row` and `+ Quarter`.
  - Formula: `Planned capacity = (Working days - Days off) * Load%`.
- `Backlog for planning` tab:
  - Manual table editing and `+ Row`.
  - Jira import via JQL.
- `Settings`:
  - Jira Base URL for import endpoint.
- Saved locally with restore of last selected plan.

## Jira import notes
- Works against Jira Data Server endpoint: `/rest/api/2/search`.
- Uses browser session (`credentials: include`).
- Handles fallback messages for auth/network issues.

## Closed-contour requirement
- No external script/style/font loading from internet.
- Only local files and native JS/CSS are used.
