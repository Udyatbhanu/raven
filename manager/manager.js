'use strict';

const { requestDownload, normalizeUrl, isDownloadableUrl, sanitizeFolder, basename } =
  self.RavenPaths;

const listEl = document.getElementById('download-list');
const emptyEl = document.getElementById('empty');
const rowsEl = document.getElementById('rows');
const addStatusEl = document.getElementById('add-status');
const datalistEl = document.getElementById('recent-folders');
const filterEl = document.getElementById('filter');

let items = [];
let refreshTimer = null;

// ---------- helpers ----------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

// Best-effort folder display: item.filename is an absolute path; show the
// part below the user's Downloads directory when recognizable.
function relativeFolder(filename) {
  if (!filename) return '';
  const segs = filename.split(/[\\/]+/).filter(Boolean);
  for (let i = segs.length - 2; i >= 0; i--) {
    if (/^downloads?$/i.test(segs[i])) {
      const sub = segs.slice(i + 1, -1);
      return sub.length ? `Downloads/${sub.join('/')}` : 'Downloads';
    }
  }
  const dir = segs.slice(0, -1);
  return dir.length ? dir.slice(-2).join('/') : '';
}

function stateLabel(item) {
  if (item.state === 'in_progress') return item.paused ? 'paused' : 'in progress';
  return item.state;
}

// ---------- add-download rows ----------

function addRow(url = '', folder = '') {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <input class="url" type="url" placeholder="https://example.com/file.zip">
    <input class="folder" type="text" placeholder="folder (e.g. work/reports)" list="recent-folders">
    <button class="remove" title="Remove row">&times;</button>`;
  row.querySelector('.url').value = url;
  row.querySelector('.folder').value = folder;
  row.querySelector('.remove').addEventListener('click', () => row.remove());
  rowsEl.appendChild(row);
  return row;
}

async function downloadAll() {
  addStatusEl.textContent = '';
  const jobs = [...rowsEl.querySelectorAll('.row')]
    .map((row) => ({
      url: normalizeUrl(row.querySelector('.url').value),
      folder: row.querySelector('.folder').value,
    }))
    .filter((j) => j.url);
  if (!jobs.length) {
    addStatusEl.innerHTML = '<span class="err">Add at least one URL.</span>';
    return;
  }
  const bad = jobs.find((j) => !isDownloadableUrl(j.url));
  if (bad) {
    addStatusEl.innerHTML = `<span class="err">Unsupported URL: ${escapeHtml(bad.url)}</span>`;
    return;
  }
  const results = await Promise.all(jobs.map((j) => requestDownload(j.url, j.folder)));
  const failures = results.filter((r) => r && r.error);
  const started = results.length - failures.length;
  addStatusEl.innerHTML = failures.length
    ? `${started} started. <span class="err">${failures.length} failed: ${escapeHtml(failures[0].error)}</span>`
    : `${started} download${started === 1 ? '' : 's'} started.`;
  if (started) {
    for (const row of [...rowsEl.querySelectorAll('.row')]) {
      if (!row.querySelector('.url').value.trim()) row.remove();
    }
    refresh();
  }
}

// ---------- download list ----------

async function refresh() {
  const query = filterEl.value.trim().toLowerCase();
  items = await chrome.downloads.search({ orderBy: ['-startTime'], limit: 300 });
  const shown = query
    ? items.filter(
        (i) =>
          (i.filename || '').toLowerCase().includes(query) ||
          (i.finalUrl || i.url || '').toLowerCase().includes(query)
      )
    : items;
  render(shown);
}

function render(list) {
  emptyEl.hidden = list.length > 0;
  listEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const item of list) {
    frag.appendChild(renderRow(item));
  }
  listEl.appendChild(frag);
}

function renderRow(item) {
  const tr = document.createElement('tr');
  tr.dataset.id = item.id;

  const name = basename(item.filename || item.url || 'download');
  const folder = relativeFolder(item.filename);
  const total = item.fileSize;
  const done = item.bytesReceived;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;
  const inProgress = item.state === 'in_progress';
  const barClass = item.paused
    ? 'paused'
    : item.state === 'complete'
      ? 'complete'
      : '';

  tr.innerHTML = `
    <td>
      <span class="file-name" title="${escapeHtml(item.filename || '')}">${escapeHtml(name)}</span>
      <span class="file-url" title="${escapeHtml(item.finalUrl || item.url || '')}">${escapeHtml(item.finalUrl || item.url || '')}</span>
    </td>
    <td><span class="folder-name">${escapeHtml(folder)}</span></td>
    <td>
      <div class="progress-track"><div class="progress-bar ${barClass}" style="width:${pct ?? (inProgress ? 15 : item.state === 'complete' ? 100 : 0)}%"></div></div>
      <div class="progress-meta">${pct !== null ? pct + '% · ' : ''}${formatBytes(done)}${total > 0 ? ' / ' + formatBytes(total) : ''}</div>
    </td>
    <td><span class="state ${item.state}">${stateLabel(item)}</span></td>
    <td class="col-actions"></td>`;

  const actions = tr.querySelector('.col-actions');
  const addBtn = (label, title, fn, cls = 'icon-btn') => {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', () => fn(item));
    actions.appendChild(b);
  };

  if (inProgress) {
    addBtn(item.paused ? '▶' : '⏸', item.paused ? 'Resume' : 'Pause', (i) =>
      i.paused ? chrome.downloads.resume(i.id) : chrome.downloads.pause(i.id)
    );
    addBtn('✕', 'Cancel', (i) => chrome.downloads.cancel(i.id));
  } else {
    if (item.state === 'complete' && item.exists) {
      addBtn('📂', 'Show in folder', (i) => chrome.downloads.show(i.id));
      addBtn('↗', 'Open file', (i) => chrome.downloads.open(i.id));
    }
    if (item.state === 'interrupted' && item.canResume) {
      addBtn('↻', 'Retry', (i) => chrome.downloads.resume(i.id));
    }
    addBtn('🗑', 'Remove from list', (i) => chrome.downloads.erase({ id: i.id }), 'icon-btn danger');
  }
  return tr;
}

function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refresh();
  }, 250);
}

// ---------- wiring ----------

chrome.downloads.onChanged.addListener(scheduleRefresh);
chrome.downloads.onCreated.addListener(scheduleRefresh);
chrome.downloads.onErased.addListener(scheduleRefresh);
setInterval(() => {
  if (items.some((i) => i.state === 'in_progress')) scheduleRefresh();
}, 500);

filterEl.addEventListener('input', scheduleRefresh);

document.getElementById('add-row').addEventListener('click', () => addRow());
document.getElementById('download-all').addEventListener('click', downloadAll);

document.getElementById('clear-finished').addEventListener('click', async () => {
  const done = await chrome.downloads.search({ state: 'complete' });
  await Promise.all(done.map((i) => chrome.downloads.erase({ id: i.id })));
  refresh();
});

document.getElementById('options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

const params = new URLSearchParams(location.search);
const prefill = params.get('add');
if (prefill) addRow(prefill, '');
addRow();
addRow();

chrome.storage.local.get({ recentFolders: [] }).then(({ recentFolders }) => {
  datalistEl.innerHTML = recentFolders
    .map((f) => `<option value="${escapeHtml(f)}"></option>`)
    .join('');
});

refresh();
