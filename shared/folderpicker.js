// Folder picker: turns a folder <input> into a combobox listing folders known
// to Raven — recently used folders plus every subfolder of ~/Downloads seen in
// the download history. Chrome does not allow extensions to open a native
// directory picker for downloads, so this is the selectable-folder UI.
(function (root) {
  'use strict';

  const { sanitizeFolder, folderBelowDownloads } = root.RavenPaths;

  // All folders the user has used, most-recent first, then history-derived.
  async function knownFolders() {
    const { recentFolders = [] } = await chrome.storage.local.get({
      recentFolders: [],
    });
    const seen = new Set(recentFolders);
    try {
      const items = await chrome.downloads.search({
        orderBy: ['-startTime'],
        limit: 300,
      });
      for (const item of items) {
        const folder = folderBelowDownloads(item.filename);
        if (folder) seen.add(folder);
      }
    } catch {
      /* history unavailable — recent folders still work */
    }
    return [...seen];
  }

  // Attach a dropdown picker to a folder input. `input` should live inside a
  // `.folder-wrap` container; a `▾` button is appended.
  function attach(input) {
    const wrap = input.closest('.folder-wrap') || input.parentElement;
    if (!wrap.classList.contains('folder-wrap')) wrap.classList.add('folder-wrap');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'folder-pick';
    btn.title = 'Pick a folder';
    btn.textContent = '▾';
    wrap.appendChild(btn);

    let list = null;

    function close() {
      if (list) {
        list.remove();
        list = null;
      }
      document.removeEventListener('click', onDocClick, true);
    }

    function onDocClick(e) {
      if (list && !list.contains(e.target) && e.target !== btn) close();
    }

    async function open() {
      const folders = await knownFolders();
      list = document.createElement('div');
      list.className = 'folder-dropdown';

      const mkItem = (label, value) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'folder-option';
        el.textContent = label;
        el.addEventListener('click', () => {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          close();
          input.focus();
        });
        list.appendChild(el);
      };

      mkItem('Downloads (root)', '');
      for (const f of folders) mkItem(f, f);
      if (!folders.length) {
        const hint = document.createElement('div');
        hint.className = 'folder-hint';
        hint.textContent = 'No folders yet — type a name to create one.';
        list.appendChild(hint);
      }
      wrap.appendChild(list);
      document.addEventListener('click', onDocClick, true);
    }

    btn.addEventListener('click', () => (list ? close() : open()));
    input.addEventListener('focus', () => {
      if (!list) open();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  function attachAll(scope) {
    scope.querySelectorAll('input.folder').forEach(attach);
  }

  root.RavenFolderPicker = { attach, attachAll, knownFolders, sanitizeFolder };
})(typeof self !== 'undefined' ? self : globalThis);
