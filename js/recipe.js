(() => {
  const slug = new URLSearchParams(location.search).get('r');
  if (!slug) { location.href = '/'; return; }

  const content = document.getElementById('recipe-content');
  const toggle = document.getElementById('cook-toggle');
  const editSection = document.getElementById('edit-section');
  const editGate = document.getElementById('edit-gate');
  const editFormWrap = document.getElementById('edit-form-wrap');
  const editForm = document.getElementById('edit-form');
  const editStatus = document.getElementById('edit-status');
  const editTagsEl = document.getElementById('edit-tags');
  let wakeLock = null;
  let currentRecipe = null;
  let savedPassword = '';

  const ALL_TAGS = [
    'vegetarian', 'quick', 'one-pot', 'sheet-pan', 'instant-pot',
    'slow-cook', 'soup/stew', 'pasta', 'rice', 'curry', 'casserole',
    'crowd-pleaser'
  ];

  function renderEditTags(selectedTags) {
    const selected = new Set(selectedTags || []);
    editTagsEl.innerHTML = ALL_TAGS.map(tag =>
      `<label><input type="checkbox" name="tags" value="${tag}"${selected.has(tag) ? ' checked' : ''}>${tag}</label>`
    ).join('');
  }

  function getEditTags() {
    return Array.from(editTagsEl.querySelectorAll('input:checked')).map(cb => cb.value);
  }

  fetch(`recipes/${slug}.json`)
    .then(res => { if (!res.ok) throw new Error(); return res.json(); })
    .then(r => { currentRecipe = r; render(r); })
    .catch(() => { content.innerHTML = '<p>Recipe not found.</p>'; });

  // --- Group helpers (shared with add.js) ---
  function groupsToText(groups) {
    return groups.map(g => {
      const lines = [];
      if (g.group) lines.push(`## ${g.group}`);
      lines.push(...g.items);
      return lines.join('\n');
    }).join('\n');
  }

  function textToGroups(text) {
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    const groups = [];
    let current = { group: null, items: [] };
    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (current.items.length || current.group) groups.push(current);
        current = { group: line.slice(3).trim(), items: [] };
      } else {
        current.items.push(line);
      }
    }
    if (current.items.length || current.group) groups.push(current);
    return groups.length ? groups : [{ group: null, items: [] }];
  }

  // --- Render recipe ---
  function render(r) {
    document.title = `${r.title} — fascogris`;

    const meta = [r.yield, r.time].filter(Boolean);
    const metaHtml = meta.length
      ? `<div class="recipe-meta">${meta.map(m => `<span>${m}</span>`).join('')}</div>`
      : '';
    const tagsHtml = r.tags && r.tags.length
      ? `<div class="recipe-tags">${r.tags.map(t => `<span class="tag-pill-sm">${t}</span>`).join('')}</div>`
      : '';
    const descHtml = r.description
      ? `<p class="recipe-description">${r.description}</p>`
      : '';

    const ingHtml = r.ingredients.map(g => {
      const label = g.group ? `<h4>${g.group}</h4>` : '';
      const items = g.items.map(i => `<li>${i}</li>`).join('');
      return `${label}<ul>${items}</ul>`;
    }).join('');

    const insHtml = r.instructions.map(g => {
      const label = g.group ? `<h4>${g.group}</h4>` : '';
      const items = g.items.map(i => `<li>${i}</li>`).join('');
      return `${label}<ol>${items}</ol>`;
    }).join('');

    const sourceHtml = r.source
      ? `<p class="recipe-source">Source: ${r.source}</p>`
      : '';

    content.innerHTML = `
      <div class="recipe-header">
        <h2>${r.title}</h2>
        ${metaHtml}
        ${tagsHtml}
      </div>
      ${descHtml}
      <div class="recipe-body">
        <div class="recipe-section">
          <h3>Ingredients</h3>
          ${ingHtml}
        </div>
        <div class="recipe-section">
          <h3>Instructions</h3>
          ${insHtml}
        </div>
      </div>
      ${sourceHtml}
      <button class="btn btn-secondary" id="edit-btn" style="margin-top:1rem">Edit Recipe</button>
    `;

    toggle.style.display = 'block';

    // Edit button handler
    document.getElementById('edit-btn').addEventListener('click', () => {
      editSection.style.display = 'block';
      if (savedPassword) {
        showEditForm();
      } else {
        editGate.style.display = 'block';
      }
      editSection.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // --- Edit flow ---
  document.getElementById('edit-unlock').addEventListener('click', () => {
    const pw = document.getElementById('edit-password').value;
    if (!pw) return;
    savedPassword = pw;
    showEditForm();
  });

  // Also allow Enter key in password field
  document.getElementById('edit-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('edit-unlock').click();
    }
  });

  function showEditForm() {
    editGate.style.display = 'none';
    editFormWrap.style.display = 'block';
    const r = currentRecipe;
    editForm.title.value = r.title || '';
    editForm.yield.value = r.yield || '';
    editForm.time.value = r.time || '';
    editForm.description.value = r.description || '';
    editForm.ingredients.value = groupsToText(r.ingredients || []);
    editForm.instructions.value = groupsToText(r.instructions || []);
    editForm.source.value = r.source || '';
    renderEditTags(r.tags);
  }

  document.getElementById('edit-cancel').addEventListener('click', () => {
    editSection.style.display = 'none';
    editFormWrap.style.display = 'none';
    editStatus.style.display = 'none';
  });

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(editForm);

    const recipe = {
      slug: currentRecipe.slug,
      title: fd.get('title').trim(),
      yield: fd.get('yield').trim(),
      time: fd.get('time').trim(),
      description: fd.get('description').trim(),
      ingredients: textToGroups(fd.get('ingredients')),
      instructions: textToGroups(fd.get('instructions')),
      source: fd.get('source').trim(),
      tags: getEditTags(),
      dateAdded: currentRecipe.dateAdded,
      password: savedPassword,
    };

    editStatus.textContent = 'Saving…';
    editStatus.className = 'status-msg loading';
    editStatus.style.display = 'block';

    try {
      const res = await fetch('/.netlify/functions/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe),
      });
      if (res.status === 401) {
        savedPassword = '';
        throw new Error('Wrong password');
      }
      if (!res.ok) throw new Error(await res.text());

      editStatus.textContent = 'Saved! Reloading…';
      editStatus.className = 'status-msg success';
      setTimeout(() => location.reload(), 1000);
    } catch (e) {
      editStatus.textContent = `Error: ${e.message}`;
      editStatus.className = 'status-msg error';
      if (e.message === 'Wrong password') {
        editGate.style.display = 'block';
        editFormWrap.style.display = 'none';
      }
    }
  });

  // --- Cook mode with Wake Lock ---
  let cookMode = false;

  toggle.addEventListener('click', async () => {
    cookMode = !cookMode;
    document.body.classList.toggle('cook-mode', cookMode);
    toggle.classList.toggle('active', cookMode);
    toggle.textContent = cookMode ? 'Cook Mode \u2713' : 'Cook Mode';

    if (cookMode) {
      await acquireWakeLock();
    } else {
      releaseWakeLock();
    }
  });

  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { /* browser denied */ }
  }

  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release(); wakeLock = null; }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && cookMode) {
      acquireWakeLock();
    }
  });
})();
