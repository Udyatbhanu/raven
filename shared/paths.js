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

  // Given an absolute download path, return the folder relative to the
  // user's Downloads directory ('a/b', or '' for files directly in it or
  // paths that can't be recognized).
  function folderBelowDownloads(filename) {
    if (!filename) return '';
    const segs = String(filename).split(/[\\/]+/).filter(Boolean);
    for (let i = segs.length - 2; i >= 0; i--) {
      if (/^downloads?$/i.test(segs[i])) return segs.slice(i + 1, -1).join('/');
    }
    return '';
  }

  // Ask the service worker to start a download routed to `folder` (a path
  // relative to the Downloads directory). `saveAs` opens Chrome's native
  // Save As dialog prefilled with the routed name. Resolves { id } | { error }.
  function requestDownload(url, folder, saveAs) {
    return chrome.runtime
      .sendMessage({
        type: 'raven:download',
        url,
        folder: sanitizeFolder(folder),
        saveAs: !!saveAs,
      })
      .catch((err) => ({ error: err.message || String(err) }));
  }

  const api = {
    sanitizeFolder,
    basename,
    joinPath,
    normalizeUrl,
    isDownloadableUrl,
    requestDownload,
    folderBelowDownloads,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RavenPaths = api;
})(typeof self !== 'undefined' ? self : globalThis);
