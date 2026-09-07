'use strict';

const { requestDownload, normalizeUrl, isDownloadableUrl } = self.RavenPaths;

const rowsEl = document.getElementById('rows');
const statusEl = document.getElementById('status');


function addRow(url = '', folder = '') {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <input class="url" type="url" placeholder="https://example.com/file.zip" value="">
    <div class="folder-wrap"><input class="folder" type="text" placeholder="folder"></div>
    <button class="remove" title="Remove row">&times;</button>`;
  const folderInput = row.querySelector('.folder');
  folderInput.value = folder;
  self.RavenFolderPicker.attach(folderInput);
  row.querySelector('.url').value = url;
  row.querySelector('.remove').addEventListener('click', () => row.remove());
  rowsEl.appendChild(row);
  return row;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function setStatus(html) {
  statusEl.innerHTML = html;
}

async function downloadAll() {
  setStatus('');
  const jobs = [...rowsEl.querySelectorAll('.row')]
    .map((row) => ({
      url: normalizeUrl(row.querySelector('.url').value),
      folder: row.querySelector('.folder').value,
    }))
    .filter((j) => j.url);

  if (!jobs.length) {
    setStatus('<span class="err">Add at least one URL.</span>');
    return;
  }
  const bad = jobs.find((j) => !isDownloadableUrl(j.url));
  if (bad) {
    setStatus(`<span class="err">Unsupported URL: ${escapeHtml(bad.url)}</span>`);
    return;
  }

  const results = await Promise.all(
    jobs.map((j) => requestDownload(j.url, j.folder, askEachEl.checked))
  );
  const failures = results.filter((r) => r && r.error);
  const started = results.length - failures.length;
  if (failures.length) {
    setStatus(
      `${started} started. <span class="err">${failures.length} failed: ` +
        `${escapeHtml(failures[0].error)}</span>`
    );
  } else {
    setStatus(`${started} download${started === 1 ? '' : 's'} started.`);
  }
}

const askEachEl = document.getElementById('ask-each');
chrome.storage.local.get({ askEachTime: false }).then(({ askEachTime }) => {
  askEachEl.checked = askEachTime;
});
askEachEl.addEventListener('change', () => {
  chrome.storage.local.set({ askEachTime: askEachEl.checked });
});

document.getElementById('add-row').addEventListener('click', () => addRow());
document.getElementById('download-all').addEventListener('click', downloadAll);

const bulkArea = document.getElementById('bulk-area');
const bulkText = document.getElementById('bulk-text');

function importBulkText() {
  const lines = bulkText.value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    // "url folder with spaces", "url<tab>folder", or just "url"
    const m = line.match(/^(\S+)(?:\s+(.*))?$/);
    if (m) addRow(m[1], m[2] || '');
  }
  if (lines.length) {
    bulkArea.hidden = true;
    bulkText.value = '';
  } else {
    setStatus('No URLs found in pasted text.');
  }
}

document.getElementById('paste-list').addEventListener('click', async () => {
  bulkArea.hidden = !bulkArea.hidden;
  if (bulkArea.hidden) return;
  bulkText.focus();
  try {
    const text = await navigator.clipboard.readText();
    if (text.trim()) bulkText.value = text;
  } catch {
    // Clipboard read unavailable — user pastes into the textarea manually.
  }
});

document.getElementById('bulk-import').addEventListener('click', importBulkText);

document.getElementById('open-manager').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('manager/manager.html') });
});

// Optional prefill when opened via context menu / manager page.
const params = new URLSearchParams(location.search);
addRow(params.get('url') || '', params.get('folder') || '');
addRow();
addRow();
