exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const { password, ...recipe } = JSON.parse(event.body);
  if (!password || password !== process.env.SITE_PASSWORD) {
    return { statusCode: 401, body: 'Wrong password' };
  }

  const { slug } = recipe;
  if (!slug) return { statusCode: 400, body: 'Missing slug' };

  const repo = process.env.GITHUB_REPO; // e.g. "username/fascogris"
  const token = process.env.GITHUB_TOKEN;
  const path = `recipes/${slug}.json`;
  const content = Buffer.from(JSON.stringify(recipe, null, 2)).toString('base64');

  try {
    // Check if file already exists (to get sha for update)
    let sha;
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: { Authorization: `token ${token}`, 'User-Agent': 'fascogris' },
    });
    if (getRes.ok) {
      const existing = await getRes.json();
      sha = existing.sha;
    }

    const body = {
      message: sha ? `Update recipe: ${recipe.title}` : `Add recipe: ${recipe.title}`,
      content,
      ...(sha && { sha }),
    };

    const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        'User-Agent': 'fascogris',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(err);
    }

    // Best-effort Cloudflare cache purge so the new recipe shows up without
    // waiting for the 4-hour edge TTL. Failures are logged but don't fail the save.
    const cfToken = process.env.CLOUDFLARE_API_TOKEN;
    const cfZone = process.env.CLOUDFLARE_ZONE_ID;
    if (cfToken && cfZone) {
      try {
        const purgeRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${cfZone}/purge_cache`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ purge_everything: true }),
        });
        if (!purgeRes.ok) {
          console.error('CF purge failed:', purgeRes.status, await purgeRes.text());
        }
      } catch (e) {
        console.error('CF purge threw:', e.message);
      }
    }

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
