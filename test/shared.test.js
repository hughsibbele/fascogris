const test = require('node:test');
const assert = require('node:assert/strict');
const shared = require('../js/shared.js');

test('ALL_TAGS is the canonical 12-tag list', () => {
  assert.deepEqual(shared.ALL_TAGS, [
    'vegetarian', 'quick', 'one-pot', 'sheet-pan', 'instant-pot',
    'slow-cook', 'soup/stew', 'pasta', 'rice', 'curry', 'casserole',
    'crowd-pleaser',
  ]);
});

test('slugify lowercases, strips apostrophes, and hyphenates', () => {
  assert.equal(shared.slugify("Hugh's Chili & Beans!"), 'hughs-chili-beans');
});

test('escapeHtml escapes the five HTML-significant characters', () => {
  assert.equal(shared.escapeHtml(`<b> & "q" 'a'`), '&lt;b&gt; &amp; &quot;q&quot; &#39;a&#39;');
});

test('escapeHtml treats null and undefined as empty string', () => {
  assert.equal(shared.escapeHtml(null), '');
  assert.equal(shared.escapeHtml(undefined), '');
});

test('textToGroups splits "## Heading" lines into groups', () => {
  assert.deepEqual(shared.textToGroups('flour\n## Sauce\ntomato\nbasil'), [
    { group: null, items: ['flour'] },
    { group: 'Sauce', items: ['tomato', 'basil'] },
  ]);
});

test('textToGroups of empty text yields one empty ungrouped list', () => {
  assert.deepEqual(shared.textToGroups(''), [{ group: null, items: [] }]);
});

test('groupsToText round-trips textToGroups', () => {
  const text = 'flour\n## Sauce\ntomato\nbasil';
  assert.equal(shared.groupsToText(shared.textToGroups(text)), text);
});

test('waitForPublished resolves once the fetched JSON satisfies the predicate', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls < 3) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => ({ title: 'New' }) };
  };
  const result = await shared.waitForPublished(fetchImpl, 'recipes/x.json', r => r.title === 'New', { tries: 5, intervalMs: 0 });
  assert.equal(result, true);
  assert.equal(calls, 3);
});

test('waitForPublished resolves false after exhausting tries', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404 });
  const result = await shared.waitForPublished(fetchImpl, 'recipes/x.json', () => true, { tries: 3, intervalMs: 0 });
  assert.equal(result, false);
});

test('waitForPublished busts caches with a unique query string per attempt', async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return { ok: false, status: 404 }; };
  await shared.waitForPublished(fetchImpl, 'recipes/x.json', () => true, { tries: 2, intervalMs: 0 });
  assert.equal(urls.length, 2);
  assert.notEqual(urls[0], urls[1]);
  assert.ok(urls.every(u => u.startsWith('recipes/x.json?')));
});

test('waitForGone resolves true once the URL returns 404', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return calls < 3 ? { ok: true, status: 200, json: async () => ({}) } : { ok: false, status: 404 }; };
  const result = await shared.waitForGone(fetchImpl, 'recipes/x.json', { tries: 5, intervalMs: 0 });
  assert.equal(result, true);
  assert.equal(calls, 3);
});

test('waitForGone resolves false if the file never disappears', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({}) });
  assert.equal(await shared.waitForGone(fetchImpl, 'recipes/x.json', { tries: 2, intervalMs: 0 }), false);
});
