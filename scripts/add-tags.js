const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const TAGS = [
  'vegetarian', 'quick', 'one-pot', 'sheet-pan', 'instant-pot',
  'slow-cook', 'soup/stew', 'pasta', 'rice', 'curry', 'casserole',
  'crowd-pleaser'
];

const recipesDir = path.join(__dirname, '..', 'recipes');

async function main() {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const files = fs.readdirSync(recipesDir).filter(f => f.endsWith('.json'));

  console.log(`Tagging ${files.length} recipes...`);

  for (const file of files) {
    const filePath = path.join(recipesDir, file);
    const recipe = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    if (recipe.tags && recipe.tags.length > 0) {
      console.log(`  ${recipe.title} — already tagged, skipping`);
      continue;
    }

    const ingredients = recipe.ingredients
      .flatMap(g => g.items)
      .join(', ');

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Given this recipe, pick ALL tags that apply from this exact list: ${TAGS.join(', ')}

Title: ${recipe.title}
Yield: ${recipe.yield || 'not specified'}
Time: ${recipe.time || 'not specified'}
Ingredients: ${ingredients}

Return ONLY a JSON array of matching tag strings, e.g. ["vegetarian","quick"]. No explanation.`
      }],
    });

    const text = msg.content[0].text.trim();
    try {
      const tags = JSON.parse(text.replace(/^```json?\n?/, '').replace(/\n?```$/, ''));
      // Validate tags against vocabulary
      recipe.tags = tags.filter(t => TAGS.includes(t));
    } catch {
      console.error(`  ${recipe.title} — failed to parse: ${text}`);
      recipe.tags = [];
    }

    fs.writeFileSync(filePath, JSON.stringify(recipe, null, 2) + '\n');
    console.log(`  ${recipe.title} → [${recipe.tags.join(', ')}]`);
  }

  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
