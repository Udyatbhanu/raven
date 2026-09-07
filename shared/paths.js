// Shared helpers: folder path sanitization, filename helpers, download starter.
// Loaded via <script> in pages and importScripts() in the service worker.
(function (root) {
  'use strict';

  // Characters Chrome does not allow in file system segments, plus controls.
  const ILLEGAL = /[<>:"|?*\u0000-\u001f]/g;

  // Chrome can only write inside the user's Downloads directory. A "folder"
  // here is a relative path such as "work/invoices" under that directory.
  // Returns '' for input that contains no usable segments.
  function sanitizeFolder(input) {
    if (!input) return '';
    return String(input)
      .split(/[\\/]+/)
      .map((seg) =>
        seg
          .replace(ILLEGAL, '')
          .replace(/^[. ]+|[. ]+$/g, '')
          .trim()
      )
      .filter((seg) => seg && seg !== '.' && seg !== '..')
      .join('/');
  }

  function basename(path) {
    return String(path).split(/[\\/]/).pop() || 'download';
  }

  function joinPath(folder, name) {
    return folder ? `${folder}/${name}` : name;
  }

  function normalizeUrl(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return value;
    return `https://${value}`;
  }

  function isDownloadableUrl(url) {
    try {
      const { protocol } = new URL(url);
      return protocol === 'http:' || protocol === 'https:' || protocol === 'ftp:';
    } catch {
      return false;
    }
  }

  // Ask the service worker to start a download routed to `folder` (a path
  // relative to the Downloads directory). Resolves with { id } or { error }.
  function requestDownload(url, folder) {
    return chrome.runtime
      .sendMessage({ type: 'raven:download', url, folder: sanitizeFolder(folder) })
      .catch((err) => ({ error: err.message || String(err) }));
  }

  const api = {
    sanitizeFolder,
    basename,
    joinPath,
    normalizeUrl,
    isDownloadableUrl,
    requestDownload,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RavenPaths = api;
})(typeof self !== 'undefined' ? self : globalThis);
