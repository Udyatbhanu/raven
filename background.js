// Raven service worker: folder-routed downloads, routing rules, context menu.
importScripts('shared/paths.js');

const { sanitizeFolder, basename, joinPath, normalizeUrl, isDownloadableUrl } =
  self.RavenPaths;

const STORAGE_DEFAULTS = {
  rules: [], // [{ id, match: 'ext'|'contains'|'mime', value, folder, enabled }]
  routingEnabled: true,
  recentFolders: [], // most recent first, used for the context menu + datalists
};

let settings = { ...STORAGE_DEFAULTS };
let settingsLoaded = false;

// Folder assignments for downloads Raven initiated itself. Consumed by
// onDeterminingFilename so extension downloads are never re-routed by rules.
const pendingAssignments = new Map(); // url -> folder[]

function queueAssignment(url, folder) {
  if (!folder) return;
  const list = pendingAssignments.get(url) || [];
  list.push(folder);
  pendingAssignments.set(url, list);
}

function takeAssignment(item) {
  for (const url of [item.finalUrl, item.url]) {
    const list = pendingAssignments.get(url);
    if (list && list.length) {
      const folder = list.shift();
      if (!list.length) pendingAssignments.delete(url);
      return folder;
    }
  }
  return null;
}

function loadSettings() {
  return chrome.storage.local.get(STORAGE_DEFAULTS).then((stored) => {
    settings = stored;
    settingsLoaded = true;
    rebuildContextMenus();
    return settings;
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const key of Object.keys(STORAGE_DEFAULTS)) {
    if (changes[key]) settings[key] = changes[key].newValue;
  }
  if (changes.recentFolders) rebuildContextMenus();
});

// Serialized: concurrent downloads must not clobber each other's updates.
let folderWriteQueue = Promise.resolve();

function rememberFolder(folder) {
  const clean = sanitizeFolder(folder);
  if (!clean) return;
  folderWriteQueue = folderWriteQueue
    .then(async () => {
      const { recentFolders = [] } = await chrome.storage.local.get({
        recentFolders: [],
      });
      const list = [clean, ...recentFolders.filter((f) => f !== clean)].slice(0, 10);
      await chrome.storage.local.set({ recentFolders: list });
    })
    .catch(() => {});
}

// ---------- filename routing ----------

function matchRule(item) {
  if (!settings.routingEnabled) return null;
  const name = basename(item.filename || '').toLowerCase();
  const url = (item.finalUrl || item.url || '').toLowerCase();
  const mime = (item.mime || '').toLowerCase();

  for (const rule of settings.rules) {
    if (!rule || rule.enabled === false) continue;
    const value = String(rule.value || '').toLowerCase().trim();
    const folder = sanitizeFolder(rule.folder);
    if (!value || !folder) continue;

    if (rule.match === 'ext') {
      const ext = value.startsWith('.') ? value.slice(1) : value;
      if (name.endsWith('.' + ext)) return folder;
    } else if (rule.match === 'contains') {
      if (url.includes(value) || name.includes(value)) return folder;
    } else if (rule.match === 'mime') {
      if (mime.startsWith(value)) return folder;
    }
  }
  return null;
}

function routeDownload(item, suggest) {
  // Downloads started by Raven carry an explicit folder assignment.
  const assigned = takeAssignment(item);
  if (assigned !== null) {
    const target = joinPath(assigned, basename(item.filename));
    suggest({ filename: target, conflictAction: 'uniquify' });
    return;
  }
  if (item.byExtensionId === chrome.runtime.id) {
    suggest({ filename: basename(item.filename), conflictAction: 'uniquify' });
    return;
  }
  const folder = matchRule(item);
  if (folder) {
    suggest({ filename: joinPath(folder, basename(item.filename)), conflictAction: 'uniquify' });
    return;
  }
  // No rule matched: leave Chrome's default naming untouched.
  suggest({ filename: basename(item.filename), conflictAction: 'uniquify' });
}

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (settingsLoaded) {
    routeDownload(item, suggest);
    return;
  }
  // Service worker restarted without cached settings: keep the event alive
  // while storage is read, then route.
  loadSettings().then(() => routeDownload(item, suggest));
  return true;
});

// ---------- downloads ----------

async function startDownload(rawUrl, folder, saveAs) {
  const url = normalizeUrl(rawUrl);
  if (!isDownloadableUrl(url)) {
    return { error: `Invalid or unsupported URL: ${rawUrl}` };
  }
  const clean = sanitizeFolder(folder);
  queueAssignment(url, clean);
  try {
    const id = await chrome.downloads.download({
      url,
      conflictAction: 'uniquify',
      saveAs: !!saveAs,
    });
    rememberFolder(clean);
    return { id, url, folder: clean };
  } catch (err) {
    // Roll back the queued assignment so it can't leak onto a later download.
    takeAssignment({ url, finalUrl: url });
    return { error: err.message || String(err), url };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'raven:download') {
    startDownload(msg.url, msg.folder, msg.saveAs).then(sendResponse);
    return true; // async response
  }
  return false;
});

// ---------- context menu ----------

const PARENT_MENU_ID = 'raven-download-to';
const PICK_MENU_ID = 'raven-download-pick';
const FOLDER_MENU_PREFIX = 'raven-folder-';
const MENU_CONTEXTS = ['link', 'image', 'audio', 'video'];

function createMenuItem(props) {
  return new Promise((resolve) => {
    chrome.contextMenus.create(props, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

// Serialized: removeAll is async, so overlapping rebuilds would race and
// create duplicate menu IDs.
let menuRebuildQueue = Promise.resolve();

function rebuildContextMenus() {
  menuRebuildQueue = menuRebuildQueue
    .then(async () => {
      await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));
      await createMenuItem({
        id: PARENT_MENU_ID,
        title: 'Download with Raven to folder',
        contexts: MENU_CONTEXTS,
      });
      const folders = settings.recentFolders;
      for (const [i, folder] of folders.entries()) {
        await createMenuItem({
          id: `${FOLDER_MENU_PREFIX}${i}`,
          parentId: PARENT_MENU_ID,
          title: folder,
          contexts: MENU_CONTEXTS,
        });
      }
      if (folders.length) {
        await createMenuItem({
          id: 'raven-menu-divider',
          parentId: PARENT_MENU_ID,
          type: 'separator',
          contexts: MENU_CONTEXTS,
        });
      }
      await createMenuItem({
        id: PICK_MENU_ID,
        parentId: PARENT_MENU_ID,
        title: 'Choose folder…',
        contexts: MENU_CONTEXTS,
      });
    })
    .catch(() => {});
  return menuRebuildQueue;
}

chrome.contextMenus.onClicked.addListener((info) => {
  const url = info.linkUrl || info.srcUrl;
  if (!url) return;

  if (info.menuItemId === PICK_MENU_ID) {
    const target =
      chrome.runtime.getURL('manager/manager.html') +
      `?add=${encodeURIComponent(url)}`;
    chrome.tabs.create({ url: target });
    return;
  }
  if (String(info.menuItemId).startsWith(FOLDER_MENU_PREFIX)) {
    const i = Number(String(info.menuItemId).slice(FOLDER_MENU_PREFIX.length));
    const folder = settings.recentFolders[i];
    if (folder) startDownload(url, folder);
  }
});

chrome.runtime.onInstalled.addListener(loadSettings);
chrome.runtime.onStartup.addListener(loadSettings);
loadSettings();
