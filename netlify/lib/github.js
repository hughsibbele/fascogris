// Small helper shared by save.js and delete.js for the GitHub Contents API.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

function githubClient({ fetchImpl, repo, token }) {
  const headers = {
    Authorization: `token ${token}`,
    'User-Agent': 'fascogris',
    'Content-Type': 'application/json',
  };
  const url = (slug) => `https://api.github.com/repos/${repo}/contents/recipes/${slug}.json`;

  return {
    async getSha(slug) {
      const res = await fetchImpl(url(slug), { headers });
      if (!res.ok) return null;
      const existing = await res.json();
      return existing.sha;
    },
    async put(slug, body) {
      const res = await fetchImpl(url(slug), { method: 'PUT', headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res;
    },
    async delete(slug, body) {
      const res = await fetchImpl(url(slug), { method: 'DELETE', headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res;
    },
  };
}

module.exports = { isValidSlug, githubClient };
