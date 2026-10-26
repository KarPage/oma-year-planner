# Oma Year Planner

A scrolling year board for plans and trips. It is one HTML page, a stylesheet, and a few plain scripts. There is no build step and no runtime dependencies.

Your data stays on your device. Plans are saved in this browser under `year-planner/v1`. Images are saved in IndexedDB, not in that plan list. Nothing is sent to a server unless you connect Google Calendar, which is optional and off by default.

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
- Optional read-only Google Calendar connect. Events are copied into this browser. Local plans are never sent to Google.
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

## Wallpaper mode

A still picture of the board, laid over the desktop. Nothing on it clicks or moves.

```
./wallpaper pin       lock the board onto the wallpaper
./wallpaper unpin     put the old wallpaper back, then open the planner
./wallpaper toggle    pin if it is loose, unpin if it is locked
./wallpaper refresh   paint it again while it is pinned
./wallpaper status    say whether it is pinned
```

Left-click the bar icon: `./open`. Right-click: `./wallpaper toggle`.

While it is pinned, the picture is painted again at midnight, and again when the planner window closes.

It needs Chromium and ImageMagick (`magick`). Pinning saves your wallpaper path and the pictures in `~/.local/state/oma-year`, and adds a user timer, `~/.config/systemd/user/oma-year-wallpaper.{service,timer}`, for the midnight repaint. To draw your plans, it copies Chromium's local storage into a temporary folder, takes the picture there, and deletes the copy.

To remove it all:

```sh
./wallpaper unpin
systemctl --user disable --now oma-year-wallpaper.timer
rm -f ~/.config/systemd/user/oma-year-wallpaper.service ~/.config/systemd/user/oma-year-wallpaper.timer
rm -rf ~/.local/state/oma-year
```

## Google Calendar

Connect is off until `config.js` has a client id. With `GOOGLE_CLIENT_ID` left as `""`, the button stays hidden and the page never loads Google's script.

1. In Google Cloud Console, create a project and enable the Google Calendar API.
2. Configure the OAuth consent screen.
3. Create an OAuth client id of type **Web application**.
4. Under **Authorized JavaScript origins**, add `http://localhost:8080`.
5. Paste that client id into `GOOGLE_CLIENT_ID` in `config.js`.
6. Run `./serve` and open `http://localhost:8080`. A `file://` address cannot complete Google sign-in.

Click **Connect Google Calendar**. The sign-in script loads only then. Access is read-only (`calendar.readonly`). The primary calendar is included first. The dashboard tile lists the others so you can tick them. The access token stays in memory for this tab. It is not written to `localStorage`. When it expires, a **Reconnect Google** chip appears. Nothing asks Google again until you click it.

Synced plans are marked with a small G. Edit them in Google Calendar. **Disconnect** revokes the token and removes those plans. Undo puts the plans back.

Calendar sync state (which calendars, the sync token, and the account address) is stored under `year-planner/gcal`, separate from `year-planner/v1`.

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

Plans, notes, checklists, and images never leave the browser unless you export a file yourself. The page does not load fonts, scripts, or images from the network unless you connect Google Calendar.

Google Calendar is optional and read-only. Events travel straight from Google to this browser. Nothing is sent back, and there is no app server. Disconnect removes the synced plans and the saved calendar list.
