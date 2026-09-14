const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../netlify/functions/delete.js');

function post(body) { return { httpMethod: 'POST', body: JSON.stringify(body) }; }
const ENV = { SITE_PASSWORD: 'pw', GITHUB_REPO: 'me/fascogris', GITHUB_TOKEN: 'tok' };

function fakeGithub({ existingSha } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    if ((opts.method || 'GET') === 'GET') {
      return existingSha ? { ok: true, json: async () => ({ sha: existingSha }) } : { ok: false, status: 404 };
    }
    return { ok: true, json: async () => ({}) };
  };
  return { calls, fetchImpl };
}

test('rejects wrong password with 401', async () => {
  const gh = fakeGithub({ existingSha: 's' });
  const res = await createHandler({ fetchImpl: gh.fetchImpl, env: ENV })(post({ password: 'x', slug: 'a' }));
  assert.equal(res.statusCode, 401);
  assert.equal(gh.calls.length, 0);
});

test('returns 404 when the recipe does not exist', async () => {
  const gh = fakeGithub();
  const res = await createHandler({ fetchImpl: gh.fetchImpl, env: ENV })(post({ password: 'pw', slug: 'ghost' }));
  assert.equal(res.statusCode, 404);
});

test('deletes the recipe file via the GitHub contents API using its sha', async () => {
  const gh = fakeGithub({ existingSha: 'sha9' });
  const res = await createHandler({ fetchImpl: gh.fetchImpl, env: ENV })(post({ password: 'pw', slug: 'lasagna' }));
  assert.equal(res.statusCode, 200);
  const del = gh.calls.find(c => c.method === 'DELETE');
  assert.equal(del.url, 'https://api.github.com/repos/me/fascogris/contents/recipes/lasagna.json');
  assert.equal(del.body.sha, 'sha9');
  assert.equal(del.body.message, 'Delete recipe: lasagna');
});

test('rejects a slug with path characters', async () => {
  const gh = fakeGithub({ existingSha: 's' });
  const res = await createHandler({ fetchImpl: gh.fetchImpl, env: ENV })(post({ password: 'pw', slug: '../netlify.toml' }));
  assert.equal(res.statusCode, 400);
  assert.equal(gh.calls.length, 0);
});
