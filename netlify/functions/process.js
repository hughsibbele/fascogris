const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You extract recipes from images or web pages and return structured JSON.
Return ONLY valid JSON matching this schema (no markdown, no explanation):
{
  "title": "string",
  "yield": "string or empty",
  "time": "string or empty",
  "description": "string or empty",
  "ingredients": [{ "group": "string or null", "items": ["string"] }],
  "instructions": [{ "group": "string or null", "items": ["string"] }],
  "source": "string or empty"
}
Use null for group when there's no subgroup. Keep ingredient/instruction text clean and concise.`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const { type, data } = JSON.parse(event.body);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    let content;
    if (type === 'photo') {
      content = [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
        { type: 'text', text: 'Extract the recipe from this image. Return JSON only.' },
      ];
    } else if (type === 'url') {
      // Fetch the URL server-side
      const res = await fetch(data);
      const html = await res.text();
      // Send a trimmed version to Claude
      const trimmed = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 15000);
      content = [
        { type: 'text', text: `Extract the recipe from this web page content. Source URL: ${data}\n\n${trimmed}\n\nReturn JSON only.` },
      ];
    } else {
      return { statusCode: 400, body: 'Invalid type' };
    }

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    const text = msg.content[0].text.trim();
    // Extract JSON from possible markdown fences
    const jsonStr = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const recipe = JSON.parse(jsonStr);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recipe),
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: `Processing failed: ${e.message}` };
  }
};
