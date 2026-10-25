# Year planner

A single-page year board in vanilla JavaScript. No dependencies, no CDN, and no build step.

Plans stay in `localStorage` under `year-planner/v1`. Attached images live in IndexedDB so a backup of the plan list does not have to carry the image bytes. Existing plans in that key keep loading.

## Features

- One scrolling board from January 2026 through December 2027. Change `RANGE_START` and `RANGE_END` at the top of `app.js` to show a different span.
- Add a plan by clicking a day twice and then another day, by dragging across days, or with Add plan.
- Drag a bar to move it. Drag either end to resize it.
- Notes, links, and up to four images per plan.
- Search, undo, and a one-line next / last summary that updates once a minute and pauses while the tab is hidden.
- JSON backup and `.ics` import and export. Import asks before it replaces the current list, and it can merge instead. Duplicate ids are kept unique.
- Keyboard: `T` today, `[` `]` January of the previous or next year, arrows move the focused day, `N` new plan, `/` search, `Ctrl`+`Z` undo, `?` help.
- Offline shell via `sw.js` when the page is served over http or https.
- Colors come from `theme.css`. On Omarchy, `./open` refreshes that file from the active theme before launching the window.

## Run

Open `index.html` in a browser, or from this folder:

```sh
python3 -m http.server
```

Then visit `http://localhost:8000`.

On this machine, `./open` rewrites `theme.css` from the active Omarchy theme and opens the page in its own window.

```sh
python3 apply-theme.py
node test.js
```

`node test.js` runs `Planner.selfCheck` and exits non-zero if a date or layout check fails.
