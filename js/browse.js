(() => {
  const listEl = document.getElementById('recipe-list');
  const searchEl = document.getElementById('search');
  const tagBarEl = document.getElementById('tag-bar');
  let recipes = [];
  let fuse;
  let activeTags = new Set();

  const ALL_TAGS = [
    'vegetarian', 'quick', 'one-pot', 'sheet-pan', 'instant-pot',
    'slow-cook', 'soup/stew', 'pasta', 'rice', 'curry', 'casserole',
    'crowd-pleaser'
  ];

  function renderTagBar() {
    tagBarEl.innerHTML = ALL_TAGS.map(tag =>
      `<button class="tag-pill${activeTags.has(tag) ? ' active' : ''}" data-tag="${tag}">${tag}</button>`
    ).join('');
  }

  tagBarEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-pill');
    if (!btn) return;
    const tag = btn.dataset.tag;
    if (activeTags.has(tag)) {
      activeTags.delete(tag);
    } else {
      activeTags.add(tag);
    }
    renderTagBar();
    applyFilters();
  });

  function tagsHtml(tags) {
    if (!tags || !tags.length) return '';
    return `<div class="recipe-tags">${tags.map(t => `<span class="tag-pill-sm">${t}</span>`).join('')}</div>`;
  }

  function render(items) {
    if (!items.length) {
      listEl.innerHTML = '<li class="no-results">No recipes found.</li>';
      return;
    }
    listEl.innerHTML = items.map(r => {
      const meta = [r.yield, r.time].filter(Boolean).join(' · ');
      return `<li><a href="recipe.html?r=${r.slug}">
        <div class="title-row">
          <span class="title">${r.title}</span>
          ${meta ? `<span class="meta">${meta}</span>` : ''}
        </div>
        ${tagsHtml(r.tags)}
      </a></li>`;
    }).join('');
  }

  function applyFilters() {
    let items = recipes;

    // Tag filter (OR logic)
    if (activeTags.size > 0) {
      items = items.filter(r =>
        r.tags && r.tags.some(t => activeTags.has(t))
      );
    }

    // Search filter
    const q = searchEl.value.trim();
    if (q) {
      const searchFuse = new Fuse(items, { keys: ['title', 'tags'], threshold: 0.35 });
      items = searchFuse.search(q).map(r => r.item);
    }

    render(items);
  }

  fetch('recipes-index.json')
    .then(res => res.json())
    .then(data => {
      recipes = data;
      fuse = new Fuse(recipes, { keys: ['title', 'tags'], threshold: 0.35 });
      renderTagBar();
      render(recipes);
    });

  searchEl.addEventListener('input', () => applyFilters());
})();
