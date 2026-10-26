# Changelog

## 1.1.4

- Pin to desktop follows the real state. The page asks the desktop helper again when it comes back into view and every 12 seconds while visible, so unpinning from the bar, the key bind, or the timer shows up right away.
- The bar icon updates the moment the board is pinned, unpinned, or refreshed from anywhere.
- Pin to desktop is now the last button in the top row, after the shortcuts button.

## 1.1.3

- The desktop snapshot keeps clear of the top bar and the screen edges. It reads the space the bar reserves on each monitor (32 pixels if that is unknown) and adds a small margin, so the date row is never hidden under the bar on any screen.
- Full screen, from the page or from the window manager, gives the top row a little more room.

## 1.1.2

- Full screen sits just left of Add plan. F toggles it. Esc, or the window's own fullscreen key, keeps the icon in step. The wide dashboard is used while the page is full screen.

## 1.1.1

- The desktop helper accepts only the planner page: a local file, or the page served at localhost port 8080. Any other origin is refused.
- A plan can carry a start and end time, or stay all day, plus an optional place. The place opens in Maps only when that link is clicked. Times and places travel with the calendar file and with Google Calendar.

## 1.1.0

- Past plan titles stay readable. Narrow screens give Up next the room up to the search icon.
- An empty board shows one hint: drag across days to add the first plan.

## Unreleased

- The dashboard switches with the window: Up next on a narrow screen, three upcoming cells when wide. Past months and finished plans fade back.
- The day header stays pinned while the months scroll. The dashboard adds an Up next box beside Next.
- Sharp terminal chrome. Next and Last are flat neon counts. One-day marks are dots with a short label.
- The dashboard is four groups: counts, Next, Last, and a short Upcoming list.
- Plan bars are glass. The editor palette is teal, sky, lavender, sand, rose, and mint.
- Plan bars are solid, with a duration pill. One- and two-day plans are dots. The board scrollbar stays hidden.
- Optional read-only Google Calendar connect. Events stay in this browser. Disconnect removes them.
- Today centers the current month and day. The header keyboard button opens help.
- The year grid stays within the window. Today centers the month vertically only.
- Pin to desktop from the header, with W and Super+Shift+Y.
- Wallpaper mode. Right-click the bar button to pin the board onto the wallpaper, and again to put your wallpaper back.

## 1.0.0

- Scrolling year board with trips, events, and reminders.
- Days away counts trips only. One-day plans without a type are events.
- Plans and notes stay in this browser. Images stay in IndexedDB.
- JSON backup can include images or leave them out. Files over 20 MB are refused.
- Help cards, keyboard shortcuts, and a first-visit welcome.
