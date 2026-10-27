# Agent notes

Oma Year Planner is an Omarchy plugin. The repository root is the plugin: `manifest.json` (`io.github.karpage.oma-year`, kind `bar-widget`), `BarWidget.qml`, and `YearMenu.qml`. Those two QML files are the Quickshell bar button and its menu.

The planner is plain HTML, CSS, and JavaScript in `year-planner/`. `index.html` loads `app.css`, `theme.css`, and the scripts `version.js`, `config.js`, `planner.js`, `store.js`, `board.js`, `popovers.js`, `editor.js`, `gcal.js`, and `app.js`. `package.json` has no dependencies and its only script is `node test.js`. There is no framework, no lockfile, no build step, and no bundler. Keep it that way. Do not add npm packages.

`year-planner/bridge` is the pin helper, Python with only the standard library. It binds `127.0.0.1` (port `47321`, or `OMA_YEAR_BRIDGE_PORT`) and accepts pin, unpin, and toggle on POST, plus status and ping on GET. Every request must send `X-Planner-Token`. The token is 32 random bytes (`secrets.token_hex(32)`) in a mode `0600` file under `$XDG_RUNTIME_DIR` (`oma-year-planner/bridge-token`). Never put the token on a command line, in a log, or on stdout. `Handler.log_message` is empty, `./bridge ensure` prints nothing, and `./bridge launch` prints only the launcher path. Chromium is given that path; the page forwards with the token in the URL fragment.

## Tests

From `year-planner/`:

```sh
node test.js
python3 test-bridge.py
```

Every change must keep both passing. Add tests for new behavior.

`node test.js` runs `Planner.selfCheck`, then checks that `version.js`, `app.webmanifest`, and `package.json` carry the same version and that `sw.js` still loads `version.js`. It also runs `test-bridge.py` when `python3` is on `PATH`. If `python3` is missing, it prints `bridge token check skipped (python3 not found)` and still exits 0, so run `python3 test-bridge.py` itself as well.

`test-bridge.py` starts a private copy of `./bridge` with a fake wallpaper script. It sets `XDG_RUNTIME_DIR` to a temp directory, and `./open` is given stub `hyprctl` and `chromium` binaries on `PATH`. It does not need Hyprland, a real Chromium, or `/run/user`. The token checks, the command-line checks, and the `/proc` argv scan always run. Cleanup finds the helper with `ss` (`iproute2`), which is installed on GitHub's Ubuntu runners.

## Versioning

The release version is one string, currently kept in all of these:

- `year-planner/version.js` (`var VERSION`)
- `year-planner/package.json`
- `year-planner/app.webmanifest`
- `manifest.json` at the repository root

Bump all four together only when asked for a release, and add an entry to `year-planner/CHANGELOG.md` in the same change. Leave the version and the changelog alone otherwise. `test.js` fails if the first three disagree. It does not read the root `manifest.json`, so a release still has to update that file by hand. `sw.js` must keep `importScripts("version.js")` and `"year-planner-v" + VERSION`.

## Design

Keep the sharp Omarchy terminal look: square corners, 1px borders, no glass, no blur, and no Apple-style rounding. Buttons, inputs, dialogs, and plan bars use `border-radius: 0`. `app.css` has no `backdrop-filter`. One-day marks (`.bar.is-brief .fill`) are dots (`border-radius: 50%`); leave those as dots.

Colors come from the active Omarchy theme. `theme.css` imports `theme-defaults.css` (Osaka Jade) and then `theme.local.css`. `./open` runs `apply-theme.py`, which writes `theme.local.css` from `~/.local/state/omarchy/current/theme/colors.toml`. That file is gitignored. Use the theme variables (`--bg`, `--fg`, `--muted`, `--accent`, and the others on `:root`). Do not add a second hard-coded palette.

The page and the board set `overflow-x: hidden`, and `.calendar` uses `overflow-x: clip`. Keep the board free of horizontal scroll. The board scrollbar stays hidden (`scrollbar-width: none`, and a zero-width webkit scrollbar); a 2px bar shows only while the pointer is over the board. The day header (`.dayhead-bar`) is `position: sticky`. Past days (`.cell.past`), past months (`.month.is-gone`), and past plans (`.bar.is-past`, greyed and dimmed) stay muted. Upcoming plans (`.is-next`) stay full strength.

## Privacy

The app is local-first. Plans and notes are stored in `localStorage` under `year-planner/v1`. Images are stored in IndexedDB. Do not add network requests other than the optional read-only Google Calendar. That client is `gcal.js`: scope `calendar.readonly`, the sign-in script loads only after Connect, and the button stays hidden while `GOOGLE_CLIENT_ID` in `config.js` is `""`. The access token stays in memory. Synced state is `year-planner/gcal`, separate from the plan list.

Screenshots and test data must be demo data only. The root README says the plans in `screenshots/` are demo data, and it credits the barbecue photo as a real Wikimedia Commons image (T.Tseng, CC BY 2.0). Do not put real personal plans in screenshots, fixtures, or tests. Do not add AI-generated photos. A new image has to be a real photograph or illustration, under a free license, with credit in the README.

## Repository

`year-planner/` is a git subtree. The import commit records `git-subtree-dir: year-planner`, and later releases arrive as "Sync year-planner" and "Merge year-planner" commits from the author's working copy. Keep edits inside the existing file layout. Do not mass-reformat or rename files there; the page, the plugin, and the subtree sync all use these paths.
