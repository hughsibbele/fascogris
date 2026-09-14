const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../netlify/functions/save.js');

function post(body) { return { httpMethod: 'POST', body: JSON.stringify(body) }; }

function fakeGithub({ existingSha } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers });
    if ((opts.method || 'GET') === 'GET') {
      return existingSha ? { ok: true, json: async () => ({ sha: existingSha }) } : { ok: false, status: 404 };
    }
    return { ok: true, json: async () => ({}) };
  };
  return { calls, fetchImpl };
}

const ENV = { SITE_PASSWORD: 'pw', GITHUB_REPO: 'me/fascogris', GITHUB_TOKEN: 'tok' };

test('rejects wrong password with 401', async () => {
  const gh = fakeGithub();
  const res = await createHandler({ fetchImpl: gh.fetchImpl, env: ENV })(post({ password: 'x', slug: 'a', title: 'A' }));
  assert.equal(res.statusCode, 401);
  assert.equal(gh.calls.length, 0);
});

test('rejects missing slug with 400', async () => {
  const gh = fakeGithub();
  const res = await createHandler({ fetchImpl: gh.fetchImpl, env: ENV })(post({ password: 'pw', title: 'A' }));
  assert.equal(res.statusCode, 400);
});

test('creates a new recipe file via the GitHub contents API without a sha', async () => {
  const gh = fakeGithub();
  const res = await createHandler({ fetchImpl: gh.fetchImpl, env: ENV })(post({ password: 'pw', slug: 'new-dish', title: 'New Dish', tags: [] }));
  assert.equal(res.statusCode, 200);
  const put = gh.calls.find(c => c.method === 'PUT');
  assert.equal(put.url, 'https://api.github.com/repos/me/fascogris/contents/recipes/new-dish.json');
  assert.equal(put.body.message, 'Add recipe: New Dish');
  assert.equal(put.body.sha, undefined);
  const written = JSON.parse(Buffer.from(put.body.content, 'base64').toString());
  assert.equal(written.password, undefined, 'password must not be written to the repo');
  assert.equal(written.slug, 'new-dish');
});

test('updates an existing recipe with its current sha', async () => {
  const gh = fakeGithub({ existingSha: 'abc123' });
  const res = await createHandler({ fetchImpl: gh.fetchImpl, env: ENV })(post({ password: 'pw', slug: 'old', title: 'Old' }));
  assert.equal(res.statusCode, 200);
  const put = gh.calls.find(c => c.method === 'PUT');
  assert.equal(put.body.sha, 'abc123');
  assert.equal(put.body.message, 'Update recipe: Old');
});

test('does not call any Cloudflare purge endpoint', async () => {
  const gh = fakeGithub();
  await createHandler({ fetchImpl: gh.fetchImpl, env: { ...ENV, CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ZONE_ID: 'z' } })(post({ password: 'pw', slug: 'a', title: 'A' }));
  assert.ok(gh.calls.every(c => !c.url.includes('cloudflare')));
});
