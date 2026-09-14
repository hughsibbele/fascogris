(() => {
  const { ALL_TAGS, escapeHtml, groupsToText, textToGroups, waitForPublished, waitForGone } = FG;

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
  const deleteBtn = document.getElementById('delete-btn');
  let wakeLock = null;
  let currentRecipe = null;
  let savedPassword = '';

  function renderEditTags(selectedTags) {
    const selected = new Set(selectedTags || []);
    editTagsEl.innerHTML = ALL_TAGS.map(tag =>
      `<label><input type="checkbox" name="tags" value="${tag}"${selected.has(tag) ? ' checked' : ''}>${tag}</label>`
    ).join('');
  }

  function getEditTags() {
    return Array.from(editTagsEl.querySelectorAll('input:checked')).map(cb => cb.value);
  }

  function setEditStatus(html, type) {
    editStatus.innerHTML = html;
    editStatus.className = `status-msg ${type}`;
    editStatus.style.display = 'block';
  }

  fetch(`recipes/${encodeURIComponent(slug)}.json`)
    .then(res => { if (!res.ok) throw new Error(); return res.json(); })
    .then(r => { currentRecipe = r; render(r); })
    .catch(() => { content.innerHTML = '<p>Recipe not found.</p>'; });

  // --- Render recipe ---
  function groupedList(groups, tag) {
    return (groups || []).map(g => {
      const label = g.group ? `<h4>${escapeHtml(g.group)}</h4>` : '';
      const items = (g.items || []).map(i => `<li>${escapeHtml(i)}</li>`).join('');
      return `${label}<${tag}>${items}</${tag}>`;
    }).join('');
  }

  function render(r) {
    document.title = `${r.title} — fascogris`;

    const meta = [r.yield, r.time].filter(Boolean);
    const metaHtml = meta.length
      ? `<div class="recipe-meta">${meta.map(m => `<span>${escapeHtml(m)}</span>`).join('')}</div>`
      : '';
    const tagsHtml = r.tags && r.tags.length
      ? `<div class="recipe-tags">${r.tags.map(t => `<span class="tag-pill-sm">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
    const descHtml = r.description
      ? `<p class="recipe-description">${escapeHtml(r.description)}</p>`
      : '';
    const sourceHtml = r.source
      ? `<p class="recipe-source">Source: ${escapeHtml(r.source)}</p>`
      : '';

    content.innerHTML = `
      <div class="recipe-header">
        <h2>${escapeHtml(r.title)}</h2>
        ${metaHtml}
        ${tagsHtml}
      </div>
      ${descHtml}
      <div class="recipe-body">
        <div class="recipe-section">
          <h3>Ingredients</h3>
          ${groupedList(r.ingredients, 'ul')}
        </div>
        <div class="recipe-section">
          <h3>Instructions</h3>
          ${groupedList(r.instructions, 'ol')}
        </div>
      </div>
      ${sourceHtml}
      <button class="btn btn-secondary" id="edit-btn" style="margin-top:1rem">Edit Recipe</button>
    `;

    toggle.style.display = 'block';

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
    resetDeleteButton();
  }

  function closeEditor() {
    editSection.style.display = 'none';
    editFormWrap.style.display = 'none';
    editStatus.style.display = 'none';
    resetDeleteButton();
  }

  document.getElementById('edit-cancel').addEventListener('click', closeEditor);

  function handleAuthFailure() {
    savedPassword = '';
    editGate.style.display = 'block';
    editFormWrap.style.display = 'none';
  }

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
    };
    const expected = JSON.stringify(recipe);

    setEditStatus('Saving…', 'loading');
    try {
      const res = await fetch('/.netlify/functions/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...recipe, password: savedPassword }),
      });
      if (res.status === 401) throw new Error('Wrong password');
      if (!res.ok) throw new Error(await res.text());

      setEditStatus('Saved! Publishing to the site… this usually takes about a minute.', 'loading');
      const published = await waitForPublished(fetch, `recipes/${encodeURIComponent(recipe.slug)}.json`, r => JSON.stringify(r) === expected);
      if (published) {
        currentRecipe = recipe;
        render(recipe);
        closeEditor();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setEditStatus('Saved, but publishing is taking longer than usual. Reload in a minute to see the changes.', 'success');
      }
    } catch (e) {
      setEditStatus(`Error: ${e.message}`, 'error');
      if (e.message === 'Wrong password') handleAuthFailure();
    }
  });

  // --- Delete flow: two clicks, no browser dialog ---
  let deleteArmed = false;
  let deleteTimer = null;

  function resetDeleteButton() {
    deleteArmed = false;
    clearTimeout(deleteTimer);
    deleteBtn.textContent = 'Delete Recipe';
    deleteBtn.classList.remove('btn-danger');
  }

  deleteBtn.addEventListener('click', async () => {
    if (!deleteArmed) {
      deleteArmed = true;
      deleteBtn.textContent = 'Really delete? Click again';
      deleteBtn.classList.add('btn-danger');
      deleteTimer = setTimeout(resetDeleteButton, 6000);
      return;
    }
    resetDeleteButton();
    setEditStatus('Deleting…', 'loading');
    try {
      const res = await fetch('/.netlify/functions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: currentRecipe.slug, password: savedPassword }),
      });
      if (res.status === 401) throw new Error('Wrong password');
      if (!res.ok) throw new Error(await res.text());

      setEditStatus('Deleted. Removing from the site… this usually takes about a minute.', 'loading');
      await waitForGone(fetch, `recipes/${encodeURIComponent(currentRecipe.slug)}.json`);
      location.href = '/';
    } catch (e) {
      setEditStatus(`Error: ${e.message}`, 'error');
      if (e.message === 'Wrong password') handleAuthFailure();
    }
  });

  // --- Cook mode with Wake Lock ---
  let cookMode = false;

  toggle.addEventListener('click', async () => {
    cookMode = !cookMode;
    document.body.classList.toggle('cook-mode', cookMode);
    toggle.classList.toggle('active', cookMode);
    toggle.textContent = cookMode ? 'Cook Mode ✓' : 'Cook Mode';

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
