# Raven — Multi-Folder Download Manager

A Chrome extension (Manifest V3) for queuing up many downloads at once and
routing each one to its own folder — plus automatic folder rules, a right-click
"download to folder" menu, and a full download manager page.

> **Folder scope:** Chrome extensions can only write inside the user's
> Downloads directory (`chrome.downloads` security model). "Folder" here means
> a relative path such as `work/invoices` under `~/Downloads`.

## Features

- **Multi-download queue** — paste or type several URLs in the popup or the
  manager page, give each its own folder, and fire them all at once.
- **Right-click routing** — context menu on links/images/audio/video:
  "Download with Raven to folder" offers your recent folders or opens the
  manager to pick a new one.
- **Automatic folder rules** — options page rules route downloads you start
  normally by file extension, URL/filename substring, or MIME type
  (e.g. `pdf` → `docs/pdfs`, `image/` → `images`).
- **Download manager page** — progress bars, pause/resume/cancel, retry,
  show-in-folder, open file, filter, and clear-finished.
- Folder names are sanitized to Chrome-safe paths (`..`, control characters,
  and illegal filename characters are stripped) and conflicts resolve via
  `uniquify` — nothing overwrites an existing file.

## Install (unpacked)

1. `git clone` this repo (or download the source).
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this folder.
5. Click the Raven toolbar icon for quick multi-download, or open the manager
   page from the popup's **Manager** button.

## Usage

- **Popup / manager "New downloads"**: one URL + folder per row → *Download all*.
  The "Bulk paste" button in the popup accepts one `url<space-or-tab>folder`
  pair per line (folders may contain spaces).
- **Context menu**: right-click a link/media → *Download with Raven to folder*.
- **Rules**: extension icon → right-click → *Options* (or the "Folder rules"
  button on the manager page).

## Files

| Path | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest (`downloads`, `storage`, `contextMenus`) |
| `background.js` | Service worker: routing, rules, context menu, messaging |
| `shared/paths.js` | Folder sanitization + URL helpers shared by all contexts |
| `popup/` | Quick multi-download UI |
| `manager/` | Full download manager page |
| `options/` | Routing-rules settings page |

No build step, no dependencies — plain HTML/CSS/JS.
