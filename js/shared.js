// Shared helpers used by the browser pages (as window.FG) and by the
// Netlify functions and tests (as a CommonJS module).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FG = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const ALL_TAGS = [
    'vegetarian', 'quick', 'one-pot', 'sheet-pan', 'instant-pot',
    'slow-cook', 'soup/stew', 'pasta', 'rice', 'curry', 'casserole',
    'crowd-pleaser',
  ];

  function slugify(title) {
    return String(title).toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Serialize grouped items to textarea text: "## Group\nitem\nitem"
  function groupsToText(groups) {
    return (groups || []).map(g => {
      const lines = [];
      if (g.group) lines.push(`## ${g.group}`);
      lines.push(...(g.items || []));
      return lines.join('\n');
    }).join('\n');
  }

  // Parse textarea text back into groups.
  function textToGroups(text) {
    const lines = String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
    const groups = [];
    let current = { group: null, items: [] };
    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (current.items.length || current.group) groups.push(current);
        current = { group: line.slice(3).trim(), items: [] };
      } else {
        current.items.push(line);
      }
    }
    if (current.items.length || current.group) groups.push(current);
    return groups.length ? groups : [{ group: null, items: [] }];
  }

  // Poll a JSON URL (cache-busted) until `isReady(json)` is true.
  // Resolves true when ready, false after `tries` attempts.
  async function waitForPublished(fetchImpl, url, isReady, { tries = 40, intervalMs = 3000 } = {}) {
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetchImpl(`${url}?t=${Date.now()}-${i}`, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (isReady(json)) return true;
        }
      } catch (e) { /* transient; keep polling */ }
      if (intervalMs > 0) await new Promise(r => setTimeout(r, intervalMs));
    }
    return false;
  }

  // Poll a URL (cache-busted) until it returns 404. Resolves true when gone.
  async function waitForGone(fetchImpl, url, { tries = 40, intervalMs = 3000 } = {}) {
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetchImpl(`${url}?t=${Date.now()}-${i}`, { cache: 'no-store' });
        if (res.status === 404) return true;
      } catch (e) { /* transient; keep polling */ }
      if (intervalMs > 0) await new Promise(r => setTimeout(r, intervalMs));
    }
    return false;
  }

  return { ALL_TAGS, slugify, escapeHtml, groupsToText, textToGroups, waitForPublished, waitForGone };
});
