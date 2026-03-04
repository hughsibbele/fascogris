const fs = require('fs');
const path = require('path');

const recipesDir = path.join(__dirname, '..', 'recipes');
const outPath = path.join(__dirname, '..', 'recipes-index.json');

const files = fs.readdirSync(recipesDir).filter(f => f.endsWith('.json'));
const index = files.map(f => {
  const recipe = JSON.parse(fs.readFileSync(path.join(recipesDir, f), 'utf-8'));
  return {
    slug: recipe.slug,
    title: recipe.title,
    yield: recipe.yield || '',
    time: recipe.time || '',
    tags: recipe.tags || [],
  };
}).sort((a, b) => a.title.localeCompare(b.title));

fs.writeFileSync(outPath, JSON.stringify(index, null, 2));
console.log(`Built index with ${index.length} recipes.`);
