(() => {
  const ALL_TAGS = [
    'vegetarian', 'quick', 'one-pot', 'sheet-pan', 'instant-pot',
    'slow-cook', 'soup/stew', 'pasta', 'rice', 'curry', 'casserole',
    'crowd-pleaser'
  ];

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

  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = `status-msg ${type}`;
    statusEl.style.display = 'block';
  }
  function hideStatus() { statusEl.style.display = 'none'; }

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

  // Process photo
  photoSubmit.addEventListener('click', async () => {
    const file = photoInput.files[0];
    if (!file) return;
    showStatus('Resizing image…', 'loading');
    const dataUrl = await resizeImage(file);
    const base64 = dataUrl.split(',')[1];
    showStatus('Processing recipe from photo…', 'loading');
    try {
      const res = await fetch('/.netlify/functions/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'photo', data: base64 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const recipe = await res.json();
      showPreview(recipe);
      hideStatus();
    } catch (e) {
      showStatus(`Error: ${e.message}`, 'error');
    }
  });

  // Process URL
  document.getElementById('url-submit').addEventListener('click', async () => {
    const url = document.getElementById('url-input').value.trim();
    if (!url) return;
    showStatus('Processing recipe from URL…', 'loading');
    try {
      const res = await fetch('/.netlify/functions/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'url', data: url }),
      });
      if (!res.ok) throw new Error(await res.text());
      const recipe = await res.json();
      showPreview(recipe);
      hideStatus();
    } catch (e) {
      showStatus(`Error: ${e.message}`, 'error');
    }
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

  // Serialize grouped items to textarea: "## Group\nitem\nitem"
  function groupsToText(groups) {
    return groups.map(g => {
      const lines = [];
      if (g.group) lines.push(`## ${g.group}`);
      lines.push(...g.items);
      return lines.join('\n');
    }).join('\n');
  }

  // Parse textarea back to groups
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

    // Prompt for password if we don't have it
    let password = sessionStorage.getItem('fg_pw');
    if (!password) {
      password = prompt('Family password:');
      if (!password) return;
    }

    const fd = new FormData(previewForm);
    const title = fd.get('title').trim();
    const slug = title.toLowerCase()
      .replace(/['']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

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
      password,
    };

    showStatus('Saving recipe…', 'loading');
    try {
      const res = await fetch('/.netlify/functions/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe),
      });
      if (res.status === 401) {
        sessionStorage.removeItem('fg_pw');
        throw new Error('Wrong password');
      }
      if (!res.ok) throw new Error(await res.text());
      sessionStorage.setItem('fg_pw', password);
      showStatus('Saved! Redirecting…', 'success');
      setTimeout(() => { location.href = `recipe.html?r=${slug}`; }, 1000);
    } catch (e) {
      showStatus(`Error saving: ${e.message}`, 'error');
    }
  });
})();
