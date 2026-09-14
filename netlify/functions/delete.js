// Deletes a recipe by removing recipes/<slug>.json from GitHub.
const { isValidSlug, githubClient } = require('../lib/github.js');

function createHandler({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
  return async (event) => {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method not allowed' };
    }

    let payload;
    try { payload = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, body: 'Bad JSON' }; }
    const { password, slug } = payload;
    if (!env.SITE_PASSWORD || password !== env.SITE_PASSWORD) {
      return { statusCode: 401, body: 'Wrong password' };
    }
    if (!isValidSlug(slug)) return { statusCode: 400, body: 'Invalid slug' };

    const gh = githubClient({ fetchImpl, repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN });
    try {
      const sha = await gh.getSha(slug);
      if (!sha) return { statusCode: 404, body: 'Recipe not found' };
      await gh.delete(slug, { message: `Delete recipe: ${slug}`, sha });
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, slug }),
      };
    } catch (e) {
      console.error(e);
      return { statusCode: 500, body: `Delete failed: ${e.message}` };
    }
  };
}

let defaultHandler;
exports.handler = (event) => {
  if (!defaultHandler) defaultHandler = createHandler();
  return defaultHandler(event);
};
exports.createHandler = createHandler;
