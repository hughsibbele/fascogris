(() => {
  const listEl = document.getElementById('recipe-list');
  const searchEl = document.getElementById('search');
  let recipes = [];
  let fuse;

  function render(items) {
    if (!items.length) {
      listEl.innerHTML = '<li class="no-results">No recipes found.</li>';
      return;
    }
    listEl.innerHTML = items.map(r => {
      const meta = [r.yield, r.time].filter(Boolean).join(' · ');
      return `<li><a href="recipe.html?r=${r.slug}">
        <span class="title">${r.title}</span>
        ${meta ? `<span class="meta">${meta}</span>` : ''}
      </a></li>`;
    }).join('');
  }

  fetch('recipes-index.json')
    .then(res => res.json())
    .then(data => {
      recipes = data;
      fuse = new Fuse(recipes, { keys: ['title'], threshold: 0.35 });
      render(recipes);
    });

  searchEl.addEventListener('input', () => {
    const q = searchEl.value.trim();
    if (!q) return render(recipes);
    const results = fuse.search(q).map(r => r.item);
    render(results);
  });
})();
