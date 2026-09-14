const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../netlify/functions/process.js');

const RECIPE = { title: 'Shakshuka', yield: '4', time: '30 min', description: '', ingredients: [{ group: null, items: ['eggs'] }], instructions: [{ group: null, items: ['cook'] }], source: 'x', tags: ['vegetarian'] };

function fakeAnthropic(recordInto) {
  return {
    messages: {
      create: async (params) => {
        recordInto.push(params);
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(RECIPE) }] };
      },
    },
  };
}

function post(body) {
  return { httpMethod: 'POST', body: JSON.stringify(body) };
}

test('rejects non-POST with 405', async () => {
  const handler = createHandler({ anthropic: fakeAnthropic([]), password: 'pw' });
  const res = await handler({ httpMethod: 'GET' });
  assert.equal(res.statusCode, 405);
});

test('rejects a wrong password with 401 before calling Claude', async () => {
  const calls = [];
  const handler = createHandler({ anthropic: fakeAnthropic(calls), password: 'pw' });
  const res = await handler(post({ type: 'url', data: 'https://x.test', password: 'nope' }));
  assert.equal(res.statusCode, 401);
  assert.equal(calls.length, 0);
});

test('rejects a missing password with 401', async () => {
  const handler = createHandler({ anthropic: fakeAnthropic([]), password: 'pw' });
  const res = await handler(post({ type: 'photo', data: 'abc' }));
  assert.equal(res.statusCode, 401);
});

test('photo request sends the image to a current model and returns the recipe', async () => {
  const calls = [];
  const handler = createHandler({ anthropic: fakeAnthropic(calls), password: 'pw' });
  const res = await handler(post({ type: 'photo', data: 'BASE64', password: 'pw' }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), RECIPE);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'claude-opus-5');
  const image = calls[0].messages[0].content.find(b => b.type === 'image');
  assert.equal(image.source.data, 'BASE64');
});

test('url request fetches the page server-side and passes its text to Claude', async () => {
  const calls = [];
  const fetched = [];
  const fetchImpl = async (url) => { fetched.push(url); return { ok: true, text: async () => '<html><script>x</script><p>Eggs and tomatoes</p></html>' }; };
  const handler = createHandler({ anthropic: fakeAnthropic(calls), password: 'pw', fetchImpl });
  const res = await handler(post({ type: 'url', data: 'https://x.test/r', password: 'pw' }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(fetched, ['https://x.test/r']);
  const text = calls[0].messages[0].content.find(b => b.type === 'text').text;
  assert.ok(text.includes('Eggs and tomatoes'));
  assert.ok(!text.includes('<p>'));
});

test('asks for structured JSON output constrained to the recipe schema', async () => {
  const calls = [];
  const handler = createHandler({ anthropic: fakeAnthropic(calls), password: 'pw' });
  await handler(post({ type: 'photo', data: 'B', password: 'pw' }));
  const format = calls[0].output_config && calls[0].output_config.format;
  assert.ok(format, 'output_config.format missing');
  assert.equal(format.type, 'json_schema');
  assert.deepEqual(format.schema.properties.tags.items.enum, require('../js/shared.js').ALL_TAGS);
});

test('unknown type returns 400', async () => {
  const handler = createHandler({ anthropic: fakeAnthropic([]), password: 'pw' });
  const res = await handler(post({ type: 'carrier-pigeon', data: '', password: 'pw' }));
  assert.equal(res.statusCode, 400);
});
