// Extracts a recipe from a photo or a web page using Claude.
// Requires the family password so the endpoint can't be used to run up API spend.
const { ALL_TAGS } = require('../../js/shared.js');

const MODEL = 'claude-opus-5';

const GROUPED_LIST = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      group: { type: ['string', 'null'], description: 'Sub-heading, or null when there is none' },
      items: { type: 'array', items: { type: 'string' } },
    },
    required: ['group', 'items'],
    additionalProperties: false,
  },
};

const RECIPE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    yield: { type: 'string', description: 'e.g. "6 servings"; empty string if unknown' },
    time: { type: 'string', description: 'e.g. "45 minutes"; empty string if unknown' },
    description: { type: 'string', description: 'One or two sentences; empty string if none' },
    ingredients: GROUPED_LIST,
    instructions: GROUPED_LIST,
    source: { type: 'string', description: 'Book, site, or person; empty string if unknown' },
    tags: { type: 'array', items: { type: 'string', enum: ALL_TAGS } },
  },
  required: ['title', 'yield', 'time', 'description', 'ingredients', 'instructions', 'source', 'tags'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You extract recipes from photos or web pages into structured data for a family recipe site.
Keep ingredient and instruction text clean and concise, one ingredient or step per item.
Use a group heading only when the source clearly has sub-sections (e.g. "For the sauce").
Pick every tag that genuinely applies from the allowed list; leave tags empty if none do.`;

function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30000);
}

function createHandler({ anthropic, password, fetchImpl = globalThis.fetch }) {
  return async (event) => {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method not allowed' };
    }

    let payload;
    try { payload = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, body: 'Bad JSON' }; }
    const { type, data, password: given } = payload;

    if (!password || given !== password) {
      return { statusCode: 401, body: 'Wrong password' };
    }

    let content;
    if (type === 'photo') {
      content = [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
        { type: 'text', text: 'Extract the recipe from this image.' },
      ];
    } else if (type === 'url') {
      const res = await fetchImpl(data);
      const html = await res.text();
      content = [
        { type: 'text', text: `Extract the recipe from this web page. Source URL: ${data}\n\n${stripHtml(html)}` },
      ];
    } else {
      return { statusCode: 400, body: 'Invalid type' };
    }

    try {
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
        output_config: { format: { type: 'json_schema', schema: RECIPE_SCHEMA } },
      });

      if (msg.stop_reason === 'refusal') {
        return { statusCode: 422, body: 'Claude declined to process this input' };
      }
      const textBlock = msg.content.find(b => b.type === 'text');
      if (!textBlock) throw new Error('No text in model response');
      const recipe = JSON.parse(textBlock.text);
      if (!recipe.source && type === 'url') recipe.source = data;

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
}

let defaultHandler;
exports.handler = (event) => {
  if (!defaultHandler) {
    const Anthropic = require('@anthropic-ai/sdk');
    defaultHandler = createHandler({
      anthropic: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
      password: process.env.SITE_PASSWORD,
    });
  }
  return defaultHandler(event);
};
exports.createHandler = createHandler;
exports.MODEL = MODEL;
