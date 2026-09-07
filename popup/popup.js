'use strict';

const { requestDownload, normalizeUrl, isDownloadableUrl } = self.RavenPaths;

const rowsEl = document.getElementById('rows');
const statusEl = document.getElementById('status');
const datalistEl = document.getElementById('recent-folders');

function addRow(url = '', folder = '') {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <input class="url" type="url" placeholder="https://example.com/file.zip" value="">
    <input class="folder" type="text" placeholder="folder" list="recent-folders" value="">
    <button class="remove" title="Remove row">&times;</button>`;
  row.querySelector('.url').value = url;
  row.querySelector('.folder').value = folder;
  row.querySelector('.remove').addEventListener('click', () => row.remove());
  rowsEl.appendChild(row);
  return row;
}

async function loadRecentFolders() {
  const { recentFolders = [] } = await chrome.storage.local.get({ recentFolders: [] });
  datalistEl.innerHTML = recentFolders
    .map((f) => `<option value="${escapeHtml(f)}"></option>`)
    .join('');
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

  const results = await Promise.all(jobs.map((j) => requestDownload(j.url, j.folder)));
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

document.getElementById('add-row').addEventListener('click', () => addRow());
document.getElementById('download-all').addEventListener('click', downloadAll);

document.getElementById('paste-list').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      // "url folder" or "url<tab>folder" or just "url"
      const [url, folder = ''] = line.split(/[\t ]/, 2);
      addRow(url, folder);
    }
    if (!lines.length) setStatus('Clipboard has no URLs.');
  } catch {
    setStatus('<span class="err">Clipboard read blocked — paste into a row instead.</span>');
  }
});

document.getElementById('open-manager').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('manager/manager.html') });
});

// Optional prefill when opened via context menu / manager page.
const params = new URLSearchParams(location.search);
addRow(params.get('url') || '', params.get('folder') || '');
addRow();
addRow();
loadRecentFolders();
