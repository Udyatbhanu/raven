'use strict';

const { sanitizeFolder } = self.RavenPaths;

const rulesEl = document.getElementById('rules');
const statusEl = document.getElementById('status');
const enabledEl = document.getElementById('routing-enabled');

const MATCH_TYPES = [
  ['ext', 'File extension is'],
  ['contains', 'URL or filename contains'],
  ['mime', 'MIME type starts with'],
];

let ruleSeq = 0;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function addRule(rule = { match: 'ext', value: '', folder: '' }) {
  const tr = document.createElement('tr');
  tr.dataset.id = rule.id || `r${Date.now()}-${ruleSeq++}`;
  tr.innerHTML = `
    <td style="width:210px">
      <select class="match">
        ${MATCH_TYPES.map(
          ([v, label]) =>
            `<option value="${v}" ${rule.match === v ? 'selected' : ''}>${label}</option>`
        ).join('')}
      </select>
    </td>
    <td><input type="text" class="value" placeholder="pdf, github.com, image/…" value="${escapeHtml(rule.value || '')}"></td>
    <td><input type="text" class="folder" placeholder="folder path" value="${escapeHtml(rule.folder || '')}"></td>
    <td style="width:30px"><button class="remove" title="Remove rule">&times;</button></td>`;
  tr.querySelector('.remove').addEventListener('click', () => tr.remove());
  rulesEl.appendChild(tr);
}

function collectRules() {
  return [...rulesEl.querySelectorAll('tr')]
    .map((tr) => ({
      id: tr.dataset.id,
      match: tr.querySelector('.match').value,
      value: tr.querySelector('.value').value.trim(),
      folder: sanitizeFolder(tr.querySelector('.folder').value),
      enabled: true,
    }))
    .filter((r) => r.value && r.folder);
}

async function save() {
  const rules = collectRules();
  await chrome.storage.local.set({
    rules,
    routingEnabled: enabledEl.checked,
  });
  statusEl.textContent = 'Saved.';
  setTimeout(() => (statusEl.textContent = ''), 2000);
}

async function load() {
  const { rules = [], routingEnabled = true } = await chrome.storage.local.get({
    rules: [],
    routingEnabled: true,
  });
  enabledEl.checked = routingEnabled;
  rulesEl.innerHTML = '';
  for (const rule of rules) addRule(rule);
  if (!rules.length) addRule();
}

document.getElementById('add-rule').addEventListener('click', () => addRule());
document.getElementById('save').addEventListener('click', save);

load();
