# Year planner

A single-page year board in vanilla JavaScript. No dependencies, no CDN, and no build step.

Plans stay in `localStorage` under `year-planner/v1`. Attached images live in IndexedDB so a backup of the plan list does not have to carry the image bytes. Existing plans in that key keep loading.

## Features

- One scrolling board from this year through next year. A plan can extend that window by up to two years before the current year and three years after it. Plans further out stay in your data and still turn up in search. Rolling 12 still scrolls so the current month sits at the top.
- Add a plan by clicking a day twice and then another day, by dragging across days, or with Add plan. While the range is in progress, a label by the pointer and the Add plan bar both show the inclusive length, such as `Feb 21 – Mar 6 · 14 days`.
- A plan that starts and ends on the same day is a thin line at the bottom of the cell. Several on one day stack, and past three a small `+N` stands in for the rest. Hover lists them. Click opens a list to pick or edit one. Multi-day bars keep their usual shape and sit above those lines.
- Drag a bar to move it. Drag either end to resize it.
- Scroll a month with the wheel (it snaps to each month), by dragging the month names or a year divider, with Up and Down when no day is focused, or with Shift+Up and Shift+Down when one is. Page Up and Page Down move about six months. Home and End jump to the ends of the board.
- On a wide window the day columns use the full width. Below about 1000px the layout tightens: single weekday letters, a wrapping dashboard strip, month names like `Jan`, and trip labels that keep a short `·Nd`. All 31 days and the Away column fit without horizontal scrolling down to about 640px.
- Notes, links, and up to four images per plan.
- Search, undo, and a dashboard strip for counts, the next plan, and the last trip. The next and last line scrolls only when it overflows, and it stays still when motion is reduced. `/` focuses search. Esc clears it, then blurs.
- JSON backup and `.ics` import and export. Import asks before it replaces the current list, and it can merge instead. A merged plan whose id is already in the list is skipped when the title, dates, category, note, and color match, and kept as a second copy with a new id when they do not.
- Keyboard: `T` today, `[` `]` January of the previous or next year, Left and Right move the focused day, Up and Down move it by a month (or scroll the board, see above), `N` new plan, `/` search, `Esc` clears the search then blurs it, `Ctrl`+`Z` undo, `?` help.
- Offline shell via `sw.js` when the page is served over http or https. Pages and scripts load from the network first and fall back to the cache, so an update shows up without clearing site data.
- Colors, including the selection tint and the resize handles, come from `theme.css`. The browser theme color and the manifest colors follow `--bg`. On Omarchy, `./open` refreshes that file from the active theme before launching the window.

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
