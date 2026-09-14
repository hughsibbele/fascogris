# fascogris

Family recipe site at [fascogris.com](https://fascogris.com). Static HTML and vanilla JS,
with recipes stored as JSON files in git and two small serverless functions for adding,
editing, and deleting recipes from the browser.

## How it fits together

| Piece | Where | Notes |
|---|---|---|
| Recipes | `recipes/<slug>.json` | One file per recipe. Git history is the audit trail. |
| Browse page | `index.html`, `js/browse.js` | Reads `recipes-index.json`, fuzzy search via Fuse.js, tag filters. |
| Recipe page | `recipe.html`, `js/recipe.js` | Reads `recipes/<slug>.json`. Cook mode keeps the screen awake. Edit and delete live here. |
| Add page | `add.html`, `js/add.js` | Photo, URL, or typed entry. Photo and URL go through Claude. |
| Shared helpers | `js/shared.js` | Tag list, slugify, HTML escaping, group parsing, publish polling. Loaded by every page and required by the functions. |
| Index | `recipes-index.json` | Generated at build time by `scripts/build-index.js`. Not committed. |
| Functions | `netlify/functions/` | `process` (Claude extraction), `save` (commit to GitHub), `delete` (remove from GitHub). |
| Hosting | Netlify | Builds on every push to `main`. Node 22, esbuild bundler for functions. |
| DNS, TLS, bot filtering | Cloudflare | Proxied. Blocks scanners and AI crawlers. See TLS note below. |

## Adding and editing recipes

1. The browser asks for the family password once per tab session.
2. Photo or URL input is sent to the `process` function, which asks Claude for a recipe in
   a fixed JSON schema (structured output, so no parsing surprises). Typed input skips Claude.
3. The preview form lets you fix anything, then `save` commits `recipes/<slug>.json` to
   GitHub as you. Netlify picks up the commit and redeploys in about a minute.
4. The page polls the site until the new file is live, then opens it. Edits work the same
   way. Delete removes the file and polls until it is gone.

The slug is derived from the title. Saving a recipe whose title matches an existing slug
updates that recipe rather than creating a second one.

## Environment variables (Netlify)

| Name | Purpose |
|---|---|
| `SITE_PASSWORD` | Family password checked by all three functions. |
| `ANTHROPIC_API_KEY` | Used by `process`. |
| `GITHUB_REPO` | `owner/repo` that `save` and `delete` commit to. |
| `GITHUB_TOKEN` | Token with contents write access to that repo. |

## Caching

Cloudflare caches everything except `/.netlify/functions/` at the edge for two minutes and
tells browsers to revalidate on every load (Netlify serves ETags, so that is cheap). A new or
edited recipe is therefore visible everywhere within two minutes with no cache purge. The
publish polling uses cache-busting query strings, so the person who saved sees it immediately.

## TLS

Netlify cannot renew Let's Encrypt certificates behind the Cloudflare proxy. The site uses a
Cloudflare Origin CA certificate uploaded to Netlify as a custom certificate, valid until
September 2041, with Cloudflare in Full (strict) mode. If Cloudflare ever returns a 526,
check `netlify api showSiteTLSCertificate` first. Do not un-proxy the DNS records without
first removing the custom certificate, or browsers will reject the origin cert.

## Local development

```bash
npm install
npm run build        # generates recipes-index.json
npm test             # unit tests for the functions and shared helpers
npx serve .          # or any static server, for the pages
netlify dev          # pages plus functions, needs the env vars above in .env
```

`scripts/add-tags.js` is a one-off helper that asks Claude to tag any untagged recipe
files. Run it with `npm run tag` and `ANTHROPIC_API_KEY` set, then commit the changes.
