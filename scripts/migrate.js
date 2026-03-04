const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const html = fs.readFileSync(path.join(__dirname, '..', 'AOK', 'AOK.html'), 'utf-8');
const $ = cheerio.load(html);

const recipesDir = path.join(__dirname, '..', 'recipes');
if (!fs.existsSync(recipesDir)) fs.mkdirSync(recipesDir, { recursive: true });

// Find all recipe sections (they have IDs matching the TOC anchors)
const skipIds = new Set(['page']);
let count = 0;

$('section[id]').each((_, el) => {
  const section = $(el);
  const id = section.attr('id');
  if (skipIds.has(id)) return;

  const slug = id;
  const title = section.find('h2').first().text().trim();
  if (!title) return;

  // Parse metadata line — could be "Yield: X | Prep time: Y" or just a description
  let yield_ = '';
  let time = '';
  let description = '';

  const paragraphs = section.find('> p, > p');
  const allParagraphs = [];
  section.children('p').each((_, p) => allParagraphs.push($(p)));

  // First paragraph might be metadata (italic) or description
  if (allParagraphs.length > 0) {
    const firstP = allParagraphs[0];
    const firstText = firstP.text().trim();

    if (firstText.includes('Yield:') || firstText.includes('Preparation time:') || firstText.includes('Prep time:')) {
      // Parse yield and time
      const parts = firstText.split('|').map(s => s.trim());
      for (const part of parts) {
        if (part.startsWith('Yield:')) {
          yield_ = part.replace('Yield:', '').trim();
        } else if (part.startsWith('Preparation time:') || part.startsWith('Prep time:')) {
          time = part.replace(/Prep(aration)? time:/, '').trim();
        } else if (!yield_ && !time) {
          // Sometimes it's just "Yield: 10+ portions" with no pipe
          yield_ = part.replace('Yield:', '').trim();
        }
      }
      // Description is next paragraph(s)
      if (allParagraphs.length > 1) {
        description = allParagraphs[1].text().trim();
      }
    } else {
      // First paragraph is the description (or metadata without standard format)
      // Check if it looks like metadata (short, italic)
      const isItalic = firstP.find('i, em').length > 0 && firstP.find('i, em').text().trim() === firstText;
      if (isItalic && firstText.length < 200) {
        // Treat as metadata/description combo
        description = firstText;
        // Try to extract yield/time if present
        if (firstText.includes('|')) {
          const parts = firstText.split('|').map(s => s.trim());
          for (const part of parts) {
            if (part.toLowerCase().includes('yield') || part.toLowerCase().includes('serv')) {
              yield_ = part.replace(/yield:?\s*/i, '').trim();
            } else if (part.toLowerCase().includes('time') || part.toLowerCase().includes('minute') || part.toLowerCase().includes('hour')) {
              time = part.replace(/prep(aration)?\s*time:?\s*/i, '').trim();
            }
          }
        }
      } else {
        description = firstText;
      }
      // Check for a second description paragraph
      if (allParagraphs.length > 1 && !description) {
        description = allParagraphs[1].text().trim();
      }
    }
  }

  // Parse ingredients — may have h4 subgroups
  const ingredients = [];
  let currentGroup = null;
  let currentItems = [];
  let inIngredients = false;
  let inInstructions = false;

  section.children().each((_, child) => {
    const el = $(child);
    const tag = child.tagName?.toLowerCase() || child.name?.toLowerCase();

    if (tag === 'h3') {
      const text = el.text().trim();
      if (text === 'Ingredients') {
        // Flush any previous state
        inIngredients = true;
        inInstructions = false;
        return;
      }
      if (text === 'Instructions') {
        // Flush current ingredient group
        if (inIngredients && currentItems.length > 0) {
          ingredients.push({ group: currentGroup, items: currentItems });
          currentGroup = null;
          currentItems = [];
        }
        inIngredients = false;
        inInstructions = true;
        return;
      }
    }

    if (inIngredients) {
      if (tag === 'h4') {
        // Flush previous group
        if (currentItems.length > 0) {
          ingredients.push({ group: currentGroup, items: currentItems });
          currentItems = [];
        }
        currentGroup = el.text().trim().replace(/:$/, '');
        return;
      }
      if (tag === 'ul') {
        el.find('li').each((_, li) => {
          currentItems.push($(li).text().trim());
        });
        return;
      }
    }
  });

  // Flush remaining ingredients
  if (currentItems.length > 0 && inIngredients) {
    ingredients.push({ group: currentGroup, items: currentItems });
  }

  // Parse instructions — may have h4 subgroups too (rare but possible)
  const instructions = [];
  currentGroup = null;
  currentItems = [];
  inInstructions = false;

  section.children().each((_, child) => {
    const el = $(child);
    const tag = child.tagName?.toLowerCase() || child.name?.toLowerCase();

    if (tag === 'h3' && el.text().trim() === 'Instructions') {
      inInstructions = true;
      return;
    }
    if (tag === 'h3' && inInstructions) {
      inInstructions = false; // hit next section
      return;
    }

    if (inInstructions) {
      if (tag === 'h4') {
        if (currentItems.length > 0) {
          instructions.push({ group: currentGroup, items: currentItems });
          currentItems = [];
        }
        currentGroup = el.text().trim().replace(/:$/, '');
        return;
      }
      if (tag === 'ol') {
        el.find('li').each((_, li) => {
          currentItems.push($(li).text().trim());
        });
        return;
      }
    }
  });

  // Flush remaining instructions
  if (currentItems.length > 0) {
    instructions.push({ group: currentGroup, items: currentItems });
  }

  const recipe = {
    slug,
    title,
    yield: yield_,
    time,
    description,
    ingredients: ingredients.length > 0 ? ingredients : [{ group: null, items: [] }],
    instructions: instructions.length > 0 ? instructions : [{ group: null, items: [] }],
    source: '',
    dateAdded: '2026-03-04'
  };

  const outPath = path.join(recipesDir, `${slug}.json`);
  fs.writeFileSync(outPath, JSON.stringify(recipe, null, 2));
  count++;
  console.log(`✓ ${title}`);
});

console.log(`\nMigrated ${count} recipes.`);
