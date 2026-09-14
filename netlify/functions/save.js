// Saves (creates or updates) a recipe by committing recipes/<slug>.json to GitHub.
// Netlify redeploys on the commit; the browser polls until the file is live.
const { isValidSlug, githubClient } = require('../lib/github.js');

function createHandler({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
  return async (event) => {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method not allowed' };
    }

    let payload;
    try { payload = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, body: 'Bad JSON' }; }
    const { password, ...recipe } = payload;
    if (!env.SITE_PASSWORD || password !== env.SITE_PASSWORD) {
      return { statusCode: 401, body: 'Wrong password' };
    }

    const { slug } = recipe;
    if (!slug) return { statusCode: 400, body: 'Missing slug' };
    if (!isValidSlug(slug)) return { statusCode: 400, body: 'Invalid slug' };

    const gh = githubClient({ fetchImpl, repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN });
    const content = Buffer.from(JSON.stringify(recipe, null, 2)).toString('base64');

    try {
      const sha = await gh.getSha(slug);
      await gh.put(slug, {
        message: sha ? `Update recipe: ${recipe.title}` : `Add recipe: ${recipe.title}`,
        content,
        ...(sha && { sha }),
      });
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, slug }),
      };
    } catch (e) {
      console.error(e);
      return { statusCode: 500, body: `Save failed: ${e.message}` };
    }
  };
}

let defaultHandler;
exports.handler = (event) => {
  if (!defaultHandler) defaultHandler = createHandler();
  return defaultHandler(event);
};
exports.createHandler = createHandler;
