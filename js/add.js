(() => {
  const { ALL_TAGS, slugify, groupsToText, textToGroups, waitForPublished } = FG;

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  const statusEl = document.getElementById('status');
  const previewEl = document.getElementById('preview');
  const previewForm = document.getElementById('preview-form');
  const previewTagsEl = document.getElementById('preview-tags');
  const photoInput = document.getElementById('photo-input');
  const photoSubmit = document.getElementById('photo-submit');

  photoInput.addEventListener('change', () => {
    photoSubmit.disabled = !photoInput.files.length;
  });

  function showStatus(html, type) {
    statusEl.innerHTML = html;
    statusEl.className = `status-msg ${type}`;
    statusEl.style.display = 'block';
  }
  function hideStatus() { statusEl.style.display = 'none'; }

  // The family password gates both AI processing and saving. Remembered per tab session.
  function getPassword() {
    let pw = sessionStorage.getItem('fg_pw');
    if (!pw) {
      pw = prompt('Family password:');
      if (pw) sessionStorage.setItem('fg_pw', pw);
    }
    return pw;
  }
  function forgetPassword() { sessionStorage.removeItem('fg_pw'); }

  // Render tag checkboxes
  function renderTagCheckboxes(selectedTags) {
    const selected = new Set(selectedTags || []);
    previewTagsEl.innerHTML = ALL_TAGS.map(tag =>
      `<label><input type="checkbox" name="tags" value="${tag}"${selected.has(tag) ? ' checked' : ''}>${tag}</label>`
    ).join('');
  }

  function getSelectedTags() {
    return Array.from(previewTagsEl.querySelectorAll('input:checked')).map(cb => cb.value);
  }

  // Resize image to max 1500px, return base64
  function resizeImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const max = 1500;
          let { width, height } = img;
          if (width > max || height > max) {
            const ratio = Math.min(max / width, max / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Send a photo or URL to the process function and show the result for editing.
  async function processWith(body, label) {
    const password = getPassword();
    if (!password) return;
    showStatus(label, 'loading');
    try {
      const res = await fetch('/.netlify/functions/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, password }),
      });
      if (res.status === 401) {
        forgetPassword();
        throw new Error('Wrong password');
      }
      if (!res.ok) throw new Error(await res.text());
      const recipe = await res.json();
      showPreview(recipe);
      hideStatus();
    } catch (e) {
      showStatus(`Error: ${e.message}`, 'error');
    }
  }

  photoSubmit.addEventListener('click', async () => {
    const file = photoInput.files[0];
    if (!file) return;
    showStatus('Resizing image…', 'loading');
    const dataUrl = await resizeImage(file);
    const base64 = dataUrl.split(',')[1];
    await processWith({ type: 'photo', data: base64 }, 'Reading the recipe from your photo… this takes about 20 seconds.');
  });

  document.getElementById('url-submit').addEventListener('click', async () => {
    const url = document.getElementById('url-input').value.trim();
    if (!url) return;
    await processWith({ type: 'url', data: url }, 'Reading the recipe from that page… this takes about 20 seconds.');
  });

  // Manual form
  document.getElementById('manual-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const recipe = {
      title: fd.get('title'),
      yield: fd.get('yield'),
      time: fd.get('time'),
      description: fd.get('description'),
      ingredients: [{ group: null, items: fd.get('ingredients').split('\n').map(s => s.trim()).filter(Boolean) }],
      instructions: [{ group: null, items: fd.get('instructions').split('\n').map(s => s.trim()).filter(Boolean) }],
      source: fd.get('source'),
      tags: [],
    };
    showPreview(recipe);
  });

  function showPreview(recipe) {
    previewEl.style.display = 'block';
    const f = previewForm;
    f.title.value = recipe.title || '';
    f.yield.value = recipe.yield || '';
    f.time.value = recipe.time || '';
    f.description.value = recipe.description || '';
    f.ingredients.value = groupsToText(recipe.ingredients || []);
    f.instructions.value = groupsToText(recipe.instructions || []);
    f.source.value = recipe.source || '';
    renderTagCheckboxes(recipe.tags);
    previewEl.scrollIntoView({ behavior: 'smooth' });
  }

  document.getElementById('cancel-preview').addEventListener('click', () => {
    previewEl.style.display = 'none';
  });

  // Save
  previewForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = getPassword();
    if (!password) return;

    const fd = new FormData(previewForm);
    const title = fd.get('title').trim();
    const slug = slugify(title);
    if (!slug) {
      showStatus('Error: the title needs at least one letter or number.', 'error');
      return;
    }

    const recipe = {
      slug,
      title,
      yield: fd.get('yield').trim(),
      time: fd.get('time').trim(),
      description: fd.get('description').trim(),
      ingredients: textToGroups(fd.get('ingredients')),
      instructions: textToGroups(fd.get('instructions')),
      source: fd.get('source').trim(),
      tags: getSelectedTags(),
      dateAdded: new Date().toISOString().slice(0, 10),
    };
    const expected = JSON.stringify(recipe);

    showStatus('Saving recipe…', 'loading');
    try {
      const res = await fetch('/.netlify/functions/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...recipe, password }),
      });
      if (res.status === 401) {
        forgetPassword();
        throw new Error('Wrong password');
      }
      if (!res.ok) throw new Error(await res.text());

      const recipeUrl = `recipe.html?r=${encodeURIComponent(slug)}`;
      showStatus('Saved! Publishing to the site… this usually takes about a minute.', 'loading');
      const published = await waitForPublished(fetch, `recipes/${slug}.json`, r => JSON.stringify(r) === expected);
      if (published) {
        showStatus('Published! Opening the recipe…', 'success');
        location.href = recipeUrl;
      } else {
        showStatus(`Saved, but publishing is taking longer than usual. It will appear shortly at <a href="${recipeUrl}">the recipe page</a>.`, 'success');
      }
    } catch (e) {
      showStatus(`Error saving: ${e.message}`, 'error');
    }
  });
})();
