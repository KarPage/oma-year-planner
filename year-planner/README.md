# Year planner

A scrolling year board for plans and trips. It is one HTML page, a stylesheet, and a few plain scripts. There is no build step and no runtime dependencies.

Your data stays on your device. Plans are saved in this browser under `year-planner/v1`. Images are saved in IndexedDB, not in that plan list. Nothing is sent to a server.

Screenshots for a release live in [screenshots/](screenshots/).

## Features

- Months run in one scrolling board. The day numbers stay pinned. A year label sits between December and January.
- Rolling 12 starts at the current month. The year arrows jump to January.
- Drag across days to add a plan, or click a day twice. Drag a bar to move it, or drag its ends to resize it.
- A plan is a Trip, an Event, or a Reminder. Older plans with no type are treated as a trip when they cover more than one day, and as an event when they cover one day.
- Days away counts trips only. That number is on the dashboard, at the end of each month, and in the Away popover.
- One-day plans are small markers. Click one to edit the name, color, or type. A checklist can show progress on the bar, such as `Canada · 8d · 3/7`.
- Notes can contain links. Up to four images can be attached. They are shrunk before they are stored.
- Search, undo, and a wide-screen strip for this month and the next three plans.
- JSON backup, with or without images, and `.ics` import and export. A file over 20 MB is refused. Import can replace the list or merge into it.
- Colors come from `theme.css`. On Omarchy, `./open` refreshes that file from the active theme.

## Run

Open `index.html` in a browser.

To install it or use it offline, serve the folder. A `file://` address cannot register the service worker.

```sh
./serve
```

Then open `http://localhost:8080`.

```sh
node test.js
```

## Keyboard

| Key | Action |
| --- | --- |
| T | Today |
| N | New plan |
| / | Search |
| ? or Shift+/ | Shortcuts |
| Arrows | Move the focused day, or scroll months |
| Page Up / Page Down | About six months |
| Home / End | Ends of the board |
| Enter | Edit |
| Esc | Close |
| Ctrl+Z | Undo |

## Privacy

Plans, notes, checklists, and images never leave the browser unless you export a file yourself. The page does not load fonts, scripts, or images from the network.
