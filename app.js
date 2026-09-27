// ---- capture the pristine, unmodified document before any rendering happens ----
    const PRISTINE_HTML = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    const ORIGINAL_DATA_TEXT = document.getElementById('app-data').textContent;

    let state = JSON.parse(ORIGINAL_DATA_TEXT);
    let saveTimer = null;
    let artifactApi = null;
    let sampleApi = null;
    let assetsApi = null;
    let tagFilter = '';

    const DEFAULT_BOOKMARKS = [
      { id: 'plants_seeds', label: 'Plants & Seeds', links: [
        { label: 'Premier Seeds Direct', url: 'https://premierseedsdirect.com/' },
        { label: 'Budget Seeds', url: 'https://budgetseeds.co.uk/' },
        { label: 'Tamar Organics', url: 'https://tamarorganics.co.uk/my-account' },
        { label: 'David Austin Roses', url: 'https://www.davidaustinroses.co.uk/' },
        { label: 'South Eastern Horticultural (Plug Plants)', url: 'https://southeasternhorticultural.co.uk/shop/plug-plants/' },
        { label: 'Frank P Matthews', url: 'https://www.frankpmatthews.com/' }
      ]},
      { id: 'garden_centres', label: 'Garden Centres', links: [
        { label: 'Russells Garden Centre', url: 'https://www.russellsgardencentre.co.uk/' },
        { label: 'Avondale Nursery', url: 'https://avondalenursery.co.uk/' },
        { label: 'Hampton in Arden RG Plants', url: 'https://www.rgplants.co.uk/index.asp' },
        { label: 'Hilltop Garden Centre Coventry', url: 'https://hilltopgardencentre.co.uk/' },
        { label: 'Dobbies Garden Atherstone', url: 'https://www.dobbies.com/atherstone' }
      ]},
      { id: 'plant_finders', label: 'Plant Finders', links: [
        { label: 'RHS Plant Finder', url: 'https://www.rhs.org.uk/plants/search-form' },
        { label: 'Gardenia — Find Plants by Type', url: 'https://www.gardenia.net/plants/plant-types' }
      ]}
    ];
    if (!Array.isArray(state.bookmarks)) state.bookmarks = DEFAULT_BOOKMARKS;
    const DEFAULT_CATEGORIES = ['Perennials', 'Trees', 'Shrubs', 'Tender plants', 'Vegetables', 'Grasses', 'Tubers'];
    if (!Array.isArray(state.categories)) state.categories = DEFAULT_CATEGORIES.slice();

    // migrate old comma-string tags (from an earlier version) into arrays,
    // and normalize all tags to one consistent format so "full sun" and "full-sun" can't both exist
    state.records.forEach(r => {
      if (typeof r.tags === 'string') {
        r.tags = r.tags.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (!Array.isArray(r.tags)) r.tags = [];
      const seen = [];
      r.tags.forEach(t => {
        const norm = normalizeTag(t);
        if (norm && !seen.includes(norm)) seen.push(norm);
      });
      r.tags = seen;
    });

    const FIELD_KEYS = ['description','siteSoil','watering','pruning','propagation','floweringTime','hardiness','pestsDiseases'];
    const FIELD_LABELS = {
      description: 'Description', siteSoil: 'Site &amp; Soil', watering: 'Watering', pruning: 'Pruning',
      propagation: 'Propagation', floweringTime: 'Flowering Time', hardiness: 'Hardiness', pestsDiseases: 'Pests &amp; Diseases'
    };

    function esc(str) {
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function normalizeTag(str) {
      return String(str || '').trim().toLowerCase().replace(/\s+/g, '-');
    }

    // ---- named hyperlinks: stored one per line as "Name | https://..." (or a bare URL / plain note) ----
    function parseLinkLine(line) {
      const t = line.trim();
      let m = t.match(/^(.*?)\s*\|\s*(https?:\/\/\S+)$/);
      if (m) return { name: m[1].trim(), url: m[2] };
      m = t.match(/^(https?:\/\/\S+)$/);
      if (m) return { name: '', url: m[1] };
      return { name: t, url: '' };
    }
    function linkLines(raw) { return String(raw || '').split('\n').map(l => l.trim()).filter(Boolean); }
    function defaultLinkName(url) {
      try {
        const u = new URL(url); const h = u.hostname.replace(/^www\./, '');
        if (/youtube\.com|youtu\.be/.test(h)) return 'YouTube video';
        return h;
      } catch (e) { return url; }
    }
    function linksListHtml(raw) {
      const lines = linkLines(raw);
      if (!lines.length) return '<div class="lk-empty">No links yet — press “+ Add link”.</div>';
      return lines.map((line, i) => {
        const L = parseLinkLine(line);
        const main = L.url
          ? '<a href="' + esc(L.url) + '" target="_blank" rel="noopener" title="' + esc(L.url) + '">' + esc(L.name || defaultLinkName(L.url)) + '</a>'
          : '<span class="lk-text">' + esc(L.name) + '</span>';
        return '<div class="lk-row">' + main +
          '<button type="button" class="lk-btn" data-lk-edit="' + i + '" title="Rename or change this link">✎ Rename</button>' +
          '<button type="button" class="lk-btn" data-lk-del="' + i + '" title="Remove this link">×</button></div>';
      }).join('');
    }
    function showLinkModal(existing, onSave) {
      const box = document.getElementById('modal-box');
      box.style.width = '440px'; box.style.maxWidth = '92vw';
      box.innerHTML = '<h3>' + (existing ? 'Rename link' : 'Add a link') + '</h3>' +
        '<label for="lk-url">Web address</label>' +
        '<div class="lk-urlrow"><input type="text" id="lk-url" placeholder="Paste the link here (Ctrl+V)" value="' + esc(existing ? existing.url : '') + '">' +
        '<button type="button" class="modal-cancel" id="lk-paste">📋 Paste</button></div>' +
        '<label for="lk-name">Name to show (what the video or page is about)</label>' +
        '<input type="text" id="lk-name" placeholder="e.g. How to prune in spring" value="' + esc(existing ? existing.name : '') + '">' +
        '<div class="bk-msg" id="lk-msg"></div>' +
        '<div class="modal-actions"><button class="modal-cancel" id="modal-cancel">Cancel</button>' +
        '<button class="modal-confirm" id="modal-confirm">Save link</button></div>';
      document.getElementById('modal-overlay').classList.remove('hidden');
      const urlIn = document.getElementById('lk-url'), nameIn = document.getElementById('lk-name'), msg = document.getElementById('lk-msg');
      (existing ? nameIn : urlIn).focus();
      document.getElementById('lk-paste').addEventListener('click', async () => {
        try {
          const t = (await navigator.clipboard.readText()).trim();
          if (t) { urlIn.value = t; nameIn.focus(); msg.textContent = ''; } else msg.textContent = 'The clipboard is empty — copy the link first.';
        } catch (e) { urlIn.focus(); msg.textContent = 'The browser blocked the Paste button here. Click in the box above and press Ctrl+V instead.'; }
      });
      const submit = () => {
        let url = urlIn.value.trim(); const name = nameIn.value.replace(/\|/g, '/').trim();
        if (url && !/^https?:\/\//i.test(url) && /^[\w-]+(\.[\w-]+)+/.test(url)) url = 'https://' + url;
        if (!url && !name) { msg.textContent = 'Paste a web address first.'; return; }
        if (url && !/^https?:\/\/\S+$/i.test(url)) { msg.textContent = 'That doesn\'t look like a web address — it should start with https://'; return; }
        closeModal(); onSave({ url: url, name: name });
      };
      document.getElementById('modal-confirm').addEventListener('click', submit);
      document.getElementById('modal-cancel').addEventListener('click', closeModal);
      [urlIn, nameIn].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') closeModal(); }));
    }
    function saveLinkLines(lines) {
      syncActiveFromDom();
      getActive().links = lines.join('\n');
      document.getElementById('lk-list').innerHTML = linksListHtml(getActive().links);
      persist();
    }
    function linkLineFrom(L) { return L.url ? (L.name ? L.name + ' | ' + L.url : L.url) : L.name; }

    function linkify(raw) {
      const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
      const parts = String(raw || '').split(urlRegex);
      return parts.map((part, i) => {
        if (i % 2 === 1) {
          const safeUrl = esc(part);
          return '<a href="' + safeUrl + '" target="_blank" rel="noopener">' + safeUrl + '</a>';
        }
        return esc(part).replace(/\n/g, '<br>');
      }).join('');
    }

    // ---- top-bar colours (season / plant type) ----
    const COLOUR_PALETTE = [
      { key: 'spring',  label: 'Spring',     bg: '#CFE8B8' },
      { key: 'summer',  label: 'Summer',     bg: '#FAE29B' },
      { key: 'autumn',  label: 'Autumn',     bg: '#F3C29B' },
      { key: 'winter',  label: 'Winter',     bg: '#C4DAEE' },
      { key: 'fruit',   label: 'Fruit',      bg: '#F1B5B5' },
      { key: 'veg',     label: 'Vegetables', bg: '#A8D8C0' },
      { key: 'grass',   label: 'Grasses',    bg: '#E1E4A8' },
      { key: 'tree',    label: 'Trees',      bg: '#D8C3A0' },
      { key: 'shrub',   label: 'Shrubs',     bg: '#BFD3BE' },
      { key: 'tender',  label: 'Tender',     bg: '#DCC8EC' },
      { key: 'tuber',   label: 'Tubers',     bg: '#E6CFC0' },
      { key: 'flower',  label: 'Flowers',    bg: '#F4C4DA' }
    ];
    if (!state.tagColors || typeof state.tagColors !== 'object' || Array.isArray(state.tagColors)) state.tagColors = {};

    function colourByKey(k) { return COLOUR_PALETTE.find(c => c.key === k) || null; }
    function tagColour(t) { return colourByKey(state.tagColors[t]); }
    // a colour picked for this plant wins; otherwise the first of its tags that has a colour
    function recordColour(r) {
      if (!r) return null;
      if (r.headerColor === 'none') return null;
      if (r.headerColor) return colourByKey(r.headerColor);
      for (const t of (r.tags || [])) { const c = tagColour(t); if (c) return c; }
      return null;
    }
    function applyTint() {
      const c = recordColour(getActive());
      const b = document.body;
      if (c) { b.style.setProperty('--top-bg', c.bg); b.classList.add('tinted'); }
      else { b.style.removeProperty('--top-bg'); b.classList.remove('tinted'); }
    }
    function colourOptionsHtml(cur) {
      return COLOUR_PALETTE.map(c => '<option value="' + c.key + '"' + (c.key === cur ? ' selected' : '') + ' style="background:' + c.bg + ';color:#2B2A22">' + c.label + '</option>').join('');
    }
    function colourSelectHtml(r) {
      const cur = r.headerColor || '';
      const c = recordColour(r);
      const style = c ? ' style="background:' + c.bg + ';color:#2B2A22;border-color:rgba(0,0,0,0.3)"' : '';
      return '<select class="cat-select" id="colour-select" title="Top-bar colour for this plant"' + style + '>' +
        '<option value="">🎨 Auto (from tags)</option>' +
        '<option value="none"' + (cur === 'none' ? ' selected' : '') + '>🎨 No colour</option>' +
        colourOptionsHtml(cur) + '</select>';
    }

    function renderTagChips(r) {
      return (r.tags || []).map(t => {
        const c = tagColour(t);
        return '<span class="tag-chip' + (c ? ' coloured' : '') + '"' + (c ? ' style="background:' + c.bg + '"' : '') + '>' + esc(t) +
          '<button class="tag-remove" data-tag="' + esc(t) + '" title="Remove tag">×</button></span>';
      }).join('');
    }

    function renderBookmarkDropdowns() {
      return state.bookmarks.map(cat => {
        const linksHtml = cat.links.map(l =>
          '<div class="bm-link-row"><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a>' +
          '<button class="bm-remove" data-cat="' + esc(cat.id) + '" data-url="' + esc(l.url) + '" title="Remove">×</button></div>'
        ).join('') || '<div class="bm-empty">No links yet</div>';
        return '<div class="bm-dropdown" data-cat="' + esc(cat.id) + '">' +
          '<button class="tool-box bm-toggle" type="button">' + esc(cat.label) + ' ▾</button>' +
          '<div class="bm-panel">' +
            linksHtml +
            '<div class="bm-add-row">' +
              '<input class="bm-add-label" placeholder="Name">' +
              '<input class="bm-add-url" placeholder="https://…">' +
              '<button class="bm-add-btn" data-cat="' + esc(cat.id) + '">+ Add</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function getActive() {
      return state.records.find(r => r.id === state.activeId) || state.records[0] || null;
    }

    function setStatus(text) {
      document.getElementById('status').textContent = text;
    }

    function allTags() {
      const set = new Set();
      state.records.forEach(r => (r.tags || []).forEach(t => set.add(t)));
      return Array.from(set).sort((a, b) => a.localeCompare(b));
    }

    function renderTabs() {
      const inp = document.getElementById('finder-input');
      if (!inp || document.activeElement === inp) return;
      const r = getActive();
      inp.value = r ? plantLabel(r) : '';
    }

    function renderRecord() {
      const app = document.getElementById('app');
      const r = getActive();
      if (!r) {
        app.innerHTML = '<div class="empty-state"><div>No plants yet.</div><div>Click "+ New plant" to add your first one.</div></div>';
        applyTint();
        return;
      }
      const fieldsHtml = FIELD_KEYS.map(key => {
        const val = r[key] || '';
        const missingClass = (val.trim() === '' || /^(MISSING|Not sure\.?$)/i.test(val.trim())) ? ' missing' : '';
        return '<div class="field">' +
          '<div class="label">' + FIELD_LABELS[key] + '</div>' +
          '<div class="value' + missingClass + '" contenteditable="true" data-field="' + key + '">' + esc(val) + '</div>' +
          '</div>';
      }).join('');

      app.innerHTML =
        '<header>' +
          '<div class="title-block">' +
            '<h1 contenteditable="true" data-field="commonName">' + esc(r.commonName) + '</h1>' +
            '<div class="botanical" contenteditable="true" data-field="botanicalName">' + esc(r.botanicalName) + '</div>' +
          '</div>' +
          '<div class="tools-row">' +
            '<a class="tool-box" id="img-search-link" target="_blank" rel="noopener" href="' +
              'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(((r.commonName || '') + ' ' + (r.botanicalName || '') + ' plant').trim()) +
            '">🔍 Search by pictures</a>' +
            '<a class="tool-box" id="yt-search-link" target="_blank" rel="noopener" href="' +
              'https://www.youtube.com/results?search_query=' + encodeURIComponent(((r.commonName || '') + ' plant').trim()) +
            '">▶ Videos</a>' +
            renderBookmarkDropdowns() +
            '<a class="tool-box" href="https://lens.google.com/" target="_blank" rel="noopener" title="On Google Lens\' page, paste (Ctrl+V) or drag in your screenshot">🔎 Identify with Google Lens</a>' +
          '</div>' +
          '<div class="chips" id="chips-row">' +
            categorySelectHtml(r) +
            colourSelectHtml(r) +
            '<button class="check-btn' + (r.checked ? ' done' : '') + '" id="check-btn" type="button" title="Mark this record as checked once you have verified the facts">' + (r.checked ? '✓ Checked' : '☐ Draft — mark as checked') + '</button>' +
            growSelectHtml(r) +
            renderTagChips(r) +
            '<input class="tag-add-input" id="tag-add-input" list="tag-options" placeholder="add a tag">' +
            '<button class="autotag-btn" id="tag-add-btn" type="button">+ Add tag</button>' +
            '<datalist id="tag-options">' + allTags().map(t => '<option value="' + esc(t) + '">').join('') + '</datalist>' +
            '<button class="autotag-btn" id="autotag-btn">✨ Auto-tag</button>' +
            '<button class="autotag-btn" id="tag-manage-btn" type="button">⚙ Manage tags</button>' +
            '<button class="compact-toggle" id="compact-btn">Smaller text</button>' +
          '</div>' +
        '</header>' +
        '<div class="flag">' +
          '<div class="col-left">' + fieldsHtml + '</div>' +
          '<div class="col-mid">' +
            '<div class="sources">' +
              '<div class="panel-title">Hyperlinks</div>' +
              '<div class="lk-list" id="lk-list">' + linksListHtml(r.links) + '</div>' +
              '<button type="button" class="lk-add" id="lk-add">+ Add link</button>' +
            '</div>' +
            '<div class="notes" contenteditable="true" data-field="notes" data-multiline="1">' + esc(r.notes) + '</div>' +
          '</div>' +
          '<div class="col-right">' +
            '<div class="photo-block">' +
              '<div class="photo-slot" tabindex="0" contenteditable="true" spellcheck="false" data-slot="1" title="Click to upload a photo. To paste: use the Paste button, or right-click here and choose Paste">' +
                (r.photo1AssetId ? '<img src="_blob/' + esc(r.photo1AssetId) + '" alt="">' : '<div class="plus">+</div>') +
              '</div>' +
              '<input type="file" accept="image/*" class="photo-file-input" data-slot="1" style="display:none">' +
              '<div class="photo-actions"><button type="button" class="photo-act" data-act="paste" data-slot="1">📋 Paste</button><button type="button" class="photo-act" data-act="upload" data-slot="1">⬆ Upload</button></div>' +
              '<div class="photo-descriptor" contenteditable="true" data-field="photo1Desc">' + esc(r.photo1Desc) + '</div>' +
              (r.photo1AssetId ? '<button class="identify-btn" data-slot="1">🔍 Identify this plant</button>' : '') +
            '</div>' +
            '<div class="photo-block">' +
              '<div class="photo-slot" tabindex="0" contenteditable="true" spellcheck="false" data-slot="2" title="Click to upload a photo. To paste: use the Paste button, or right-click here and choose Paste">' +
                (r.photo2AssetId ? '<img src="_blob/' + esc(r.photo2AssetId) + '" alt="">' : '<div class="plus">+</div>') +
              '</div>' +
              '<input type="file" accept="image/*" class="photo-file-input" data-slot="2" style="display:none">' +
              '<div class="photo-actions"><button type="button" class="photo-act" data-act="paste" data-slot="2">📋 Paste</button><button type="button" class="photo-act" data-act="upload" data-slot="2">⬆ Upload</button></div>' +
              '<div class="photo-descriptor" contenteditable="true" data-field="photo2Desc">' + esc(r.photo2Desc) + '</div>' +
              (r.photo2AssetId ? '<button class="identify-btn" data-slot="2">🔍 Identify this plant</button>' : '') +
            '</div>' +
          '</div>' +
        '</div>';

      document.getElementById('compact-btn').addEventListener('click', () => {
        document.body.classList.toggle('compact');
      });

      document.querySelectorAll('.tag-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          const tag = btn.getAttribute('data-tag');
          syncActiveFromDom();
          const rec = getActive();
          rec.tags = (rec.tags || []).filter(t => t !== tag);
          renderRecord();
          renderTabs();
          scheduleSave();
        });
      });

      const tagInput = document.getElementById('tag-add-input');
      const addTagFromInput = () => {
        const val = normalizeTag(tagInput.value);
        if (!val) return;
        syncActiveFromDom();
        const rec = getActive();
        if (!(rec.tags || []).includes(val)) {
          rec.tags = (rec.tags || []).concat(val);
        }
        renderRecord();
        renderTabs();
        scheduleSave();
      };
      tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addTagFromInput(); }
      });
      document.getElementById('tag-add-btn').addEventListener('click', addTagFromInput);
      document.getElementById('tag-manage-btn').addEventListener('click', showTagManager);

      document.getElementById('cat-select').addEventListener('change', (e) => {
        const v = e.target.value;
        syncActiveFromDom();
        if (v === '__new') {
          renderRecord();
          showPromptModal('New category', 'e.g. Climbers', (name) => {
            const nm = name.trim();
            if (!nm) return;
            if (!categoryList().some(c => c.toLowerCase() === nm.toLowerCase())) state.categories.push(nm);
            getActive().category = nm;
            renderRecord();
            persist();
          });
          return;
        }
        getActive().category = v;
        renderRecord();
        persist();
      });

      document.getElementById('colour-select').addEventListener('change', (e) => {
        syncActiveFromDom();
        getActive().headerColor = e.target.value;
        renderRecord();
        persist();
      });

      document.getElementById('autotag-btn').addEventListener('click', autoTag);
      document.getElementById('lk-add').addEventListener('click', () => {
        showLinkModal(null, (L) => { saveLinkLines(linkLines(getActive().links).concat(linkLineFrom(L))); });
      });
      document.getElementById('lk-list').addEventListener('click', (e) => {
        const ed = e.target.closest('[data-lk-edit]'), del = e.target.closest('[data-lk-del]');
        if (!ed && !del) return;
        const lines = linkLines(getActive().links);
        if (ed) {
          const i = Number(ed.getAttribute('data-lk-edit'));
          showLinkModal(parseLinkLine(lines[i]), (L) => { lines[i] = linkLineFrom(L); saveLinkLines(lines); });
        } else {
          const i = Number(del.getAttribute('data-lk-del'));
          showConfirmModal('Remove this link?', () => { lines.splice(i, 1); saveLinkLines(lines); });
        }
      });
      document.getElementById('grow-select').addEventListener('change', (e) => {
        syncActiveFromDom();
        const rec = getActive();
        rec.growStatus = e.target.value;
        renderRecord();
        persist();
      });
      document.getElementById('check-btn').addEventListener('click', () => {
        syncActiveFromDom();
        const rec = getActive();
        rec.checked = !rec.checked;
        renderRecord();
        persist();
      });
      applyTint();

      document.querySelectorAll('.bm-panel').forEach(panel => {
        panel.addEventListener('click', (e) => e.stopPropagation());
      });

      document.querySelectorAll('.bm-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const panel = btn.nextElementSibling;
          const isOpen = panel.classList.contains('open');
          document.querySelectorAll('.bm-panel.open').forEach(p => p.classList.remove('open'));
          if (!isOpen) panel.classList.add('open');
        });
      });

      document.querySelectorAll('.bm-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          const catId = btn.getAttribute('data-cat');
          const url = btn.getAttribute('data-url');
          const cat = state.bookmarks.find(c => c.id === catId);
          if (cat) cat.links = cat.links.filter(l => l.url !== url);
          renderRecord();
          persist();
        });
      });

      document.querySelectorAll('.bm-add-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const catId = btn.getAttribute('data-cat');
          const panel = btn.closest('.bm-panel');
          const labelInput = panel.querySelector('.bm-add-label');
          const urlInput = panel.querySelector('.bm-add-url');
          let url = urlInput.value.trim();
          let label = labelInput.value.trim();
          if (!url) return;
          if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
          if (!label) {
            try { label = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { label = url; }
          }
          const cat = state.bookmarks.find(c => c.id === catId);
          if (cat) cat.links.push({ label: label, url: url });
          renderRecord();
          persist();
        });
      });

      document.querySelectorAll('.photo-slot').forEach(slot => {
        const slotNum = slot.getAttribute('data-slot');
        slot.addEventListener('click', () => {
          const input = app.querySelector('.photo-file-input[data-slot="' + slotNum + '"]');
          if (input) input.click();
        });
        slot.addEventListener('paste', (e) => {
          const items = (e.clipboardData || window.clipboardData).items;
          let imageItem = null;
          for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file' && items[i].type.indexOf('image/') === 0) { imageItem = items[i]; break; }
          }
          e.preventDefault();
          if (!imageItem) return;
          const file = imageItem.getAsFile();
          handlePhotoFile(file, slotNum);
        });
        slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('dragover'); });
        slot.addEventListener('dragleave', () => slot.classList.remove('dragover'));
        slot.addEventListener('beforeinput', (e) => e.preventDefault());
        slot.addEventListener('keydown', (e) => { if (!(e.ctrlKey || e.metaKey) && e.key !== 'Tab') e.preventDefault(); });
        slot.addEventListener('drop', (e) => {
          e.preventDefault();
          slot.classList.remove('dragover');
          const file = e.dataTransfer.files && e.dataTransfer.files[0];
          if (file && file.type.indexOf('image/') === 0) handlePhotoFile(file, slotNum);
        });
      });

      document.querySelectorAll('.photo-file-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          const slotNum = input.getAttribute('data-slot');
          if (file) handlePhotoFile(file, slotNum);
          input.value = '';
        });
      });

      document.querySelectorAll('.photo-act').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const slotNum = btn.getAttribute('data-slot');
          if (btn.getAttribute('data-act') === 'upload') {
            const input = app.querySelector('.photo-file-input[data-slot="' + slotNum + '"]');
            if (input) input.click();
          } else {
            pastePhoto(slotNum);
          }
        });
      });

      document.querySelectorAll('.identify-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          identifyPlant(btn.getAttribute('data-slot'), btn);
        });
      });

      app.querySelectorAll('[data-field]').forEach(el => {
        el.addEventListener('input', () => {
          setStatus('Unsaved changes…');
          scheduleSave();
        });
        el.addEventListener('paste', (e) => {
          e.preventDefault();
          const text = (e.clipboardData || window.clipboardData).getData('text/plain');
          if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
            document.execCommand('insertText', false, text);
          } else {
            const sel = window.getSelection();
            if (sel && sel.rangeCount) {
              const range = sel.getRangeAt(0);
              range.deleteContents();
              range.insertNode(document.createTextNode(text));
              range.collapse(false);
            }
          }
          setStatus('Unsaved changes…');
          scheduleSave();
        });
        el.addEventListener('blur', () => {
          if (el.getAttribute('data-field') === 'links') {
            syncActiveFromDom();
            el.innerHTML = linkify(getActive().links);
          }
          if (el.getAttribute('data-field') === 'commonName' || el.getAttribute('data-field') === 'botanicalName') {
            syncActiveFromDom();
            const rec = getActive();
            const link = document.getElementById('img-search-link');
            if (link && rec) {
              link.href = 'https://www.google.com/search?tbm=isch&q=' +
                encodeURIComponent(((rec.commonName || '') + ' ' + (rec.botanicalName || '') + ' plant').trim());
            }
            const ytLink = document.getElementById('yt-search-link');
            if (ytLink && rec) {
              ytLink.href = 'https://www.youtube.com/results?search_query=' +
                encodeURIComponent(((rec.commonName || '') + ' plant').trim());
            }
          }
        });
      });
    }

    function syncActiveFromDom() {
      const r = getActive();
      if (!r) return;
      document.querySelectorAll('#app [data-field]').forEach(el => {
        const key = el.getAttribute('data-field');
        const val = el.hasAttribute('data-multiline') ? (el.innerText || '') : (el.textContent || '');
        r[key] = val.trim();
      });
    }

    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 1500);
    }

    async function persist() {
      clearTimeout(saveTimer);
      syncActiveFromDom();
      setStatus('Saving…');
      try {
        if (!artifactApi) artifactApi = await claude.use('artifact');
        if (!artifactApi) {
          setStatus('Autosave unavailable here');
          return;
        }
        await artifactApi.publish(JSON.stringify(state));
        setStatus('All changes saved · ' + new Date().toLocaleTimeString());
      } catch (e) {
        setStatus('Could not save — try again');
      }
    }

    async function autoTag() {
      const rec = getActive();
      if (!rec) return;
      syncActiveFromDom();
      const btn = document.getElementById('autotag-btn');
      btn.disabled = true;
      btn.textContent = '✨ Thinking…';
      try {
        if (!sampleApi) sampleApi = await claude.use('sample');
        if (!sampleApi) {
          setStatus('Auto-tag unavailable here');
          btn.disabled = false;
          btn.textContent = '✨ Auto-tag';
          return;
        }
        const prompt = 'Suggest 3 to 6 short tags for a personal garden record about this plant. ' +
          'Tags should be lowercase, hyphenated if more than one word (e.g. "full-sun", "summer-flowering", "pollinator-friendly"). ' +
          'Base them only on the information given below — do not invent facts. ' +
          'Respond with ONLY a JSON array of strings, nothing else.\n\n' +
          'Common name: ' + rec.commonName + '\n' +
          'Botanical name: ' + rec.botanicalName + '\n' +
          'Category: ' + rec.category + '\n' +
          'Description: ' + rec.description + '\n' +
          'Site & Soil: ' + rec.siteSoil + '\n' +
          'Watering: ' + rec.watering + '\n' +
          'Flowering Time: ' + rec.floweringTime + '\n' +
          'Hardiness: ' + rec.hardiness + '\n' +
          'Pests & Diseases: ' + rec.pestsDiseases;

        const suggestions = await sampleApi.json(prompt);
        if (Array.isArray(suggestions)) {
          const existing = rec.tags || [];
          const merged = existing.slice();
          suggestions.forEach(t => {
            const clean = normalizeTag(t);
            if (clean && !merged.includes(clean)) merged.push(clean);
          });
          rec.tags = merged;
          renderRecord();
          renderTabs();
          persist();
        }
      } catch (e) {
        setStatus('Could not get suggestions — try again');
      } finally {
        btn.disabled = false;
        btn.textContent = '✨ Auto-tag';
      }
    }

    function resizeImage(fileOrBlob, maxDim) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(fileOrBlob);
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob); else reject(new Error('resize failed'));
          }, 'image/jpeg', 0.85);
        };
        img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
        img.src = url;
      });
    }

    async function handlePhotoFile(file, slotNum) {
      const rec = getActive();
      if (!rec || !file) return;
      setStatus('Uploading photo…');
      try {
        if (!assetsApi) assetsApi = await claude.use('assets');
        if (!assetsApi) {
          setStatus('Photo upload unavailable here');
          return;
        }
        const resizedBlob = await resizeImage(file, 900);
        const result = await assetsApi.upload(resizedBlob);
        if (slotNum === '1') rec.photo1AssetId = result.id;
        else rec.photo2AssetId = result.id;
        renderRecord();
        renderTabs();
        persist();
      } catch (e) {
        setStatus('Could not upload photo — try again');
      }
    }

    function showCandidatesModal(candidates, onPick) {
      const box = document.getElementById('modal-box');
      box.innerHTML =
        '<h3>Possible matches</h3>' +
        '<p>Based on the photo — pick the right one, or none if none fit.</p>' +
        '<div class="id-candidate-list">' +
        candidates.map((c, i) =>
          '<button class="id-candidate-btn" data-i="' + i + '">' + esc(c.commonName || 'Unknown') +
          (c.botanicalName ? ' <em>(' + esc(c.botanicalName) + ')</em>' : '') + '</button>'
        ).join('') +
        '</div>' +
        '<div class="modal-actions">' +
          '<button class="modal-cancel" id="modal-cancel">None of these</button>' +
        '</div>';
      document.getElementById('modal-overlay').classList.remove('hidden');
      box.querySelectorAll('.id-candidate-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-i'), 10);
          closeModal();
          onPick(candidates[idx]);
        });
      });
      document.getElementById('modal-cancel').addEventListener('click', closeModal);
    }

    async function identifyPlant(slotNum, btn) {
      const rec = getActive();
      if (!rec) return;
      const assetId = slotNum === '1' ? rec.photo1AssetId : rec.photo2AssetId;
      if (!assetId) return;
      if (btn) { btn.disabled = true; btn.textContent = '🔍 Identifying…'; }
      setStatus('Identifying…');
      try {
        if (!sampleApi) sampleApi = await claude.use('sample');
        if (!sampleApi) {
          setStatus('Identify unavailable here');
          return;
        }
        const imgResp = await fetch('_blob/' + assetId);
        const blob = await imgResp.blob();
        const prompt = 'Identify the plant in this photo. Give 3 to 5 plausible candidate ' +
          'identifications, most likely first, based only on visible features -- do not guess ' +
          'wildly if the photo is unclear. For each candidate give a common name and, where ' +
          'reasonably confident, a botanical name (Genus + species, or just Genus if you cannot ' +
          'narrow it further). Respond with ONLY a JSON array, nothing else, in this exact shape: ' +
          '[{"commonName": "...", "botanicalName": "..."}]';
        const candidates = await sampleApi.json(prompt, { images: [blob] });
        if (Array.isArray(candidates) && candidates.length) {
          showCandidatesModal(candidates, (choice) => {
            if (choice.commonName) rec.commonName = choice.commonName;
            if (choice.botanicalName) rec.botanicalName = choice.botanicalName;
            renderRecord();
            renderTabs();
            persist();
          });
          setStatus('All changes saved');
        } else {
          setStatus('No matches found');
        }
      } catch (e) {
        if (e && e.code === 'images_unavailable') setStatus('Photo identify not supported here');
        else if (e && e.code === 'not_granted') setStatus('Identify permission declined');
        else setStatus('Could not identify — try again');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔍 Identify this plant'; }
      }
    }

    function closeModal() {
      document.getElementById('modal-overlay').classList.add('hidden');
      const mb = document.getElementById('modal-box');
      mb.style.width = ''; mb.style.maxWidth = '';
    }

    function showPromptModal(title, placeholder, onConfirm, confirmLabel) {
      const box = document.getElementById('modal-box');
      box.innerHTML =
        '<h3>' + esc(title) + '</h3>' +
        '<input type="text" id="modal-input" placeholder="' + esc(placeholder) + '">' +
        '<div class="modal-actions">' +
          '<button class="modal-cancel" id="modal-cancel">Cancel</button>' +
          '<button class="modal-confirm" id="modal-confirm">' + esc(confirmLabel || 'Add') + '</button>' +
        '</div>';
      document.getElementById('modal-overlay').classList.remove('hidden');
      const input = document.getElementById('modal-input');
      input.focus();
      const submit = () => {
        const val = input.value.trim();
        closeModal();
        if (val) onConfirm(val);
      };
      document.getElementById('modal-confirm').addEventListener('click', submit);
      document.getElementById('modal-cancel').addEventListener('click', closeModal);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') closeModal();
      });
    }

    function showConfirmModal(message, onConfirm) {
      const box = document.getElementById('modal-box');
      box.innerHTML =
        '<h3>Are you sure?</h3>' +
        '<p>' + esc(message) + '</p>' +
        '<div class="modal-actions">' +
          '<button class="modal-cancel" id="modal-cancel">Cancel</button>' +
          '<button class="modal-confirm danger" id="modal-confirm">Delete</button>' +
        '</div>';
      document.getElementById('modal-overlay').classList.remove('hidden');
      document.getElementById('modal-confirm').addEventListener('click', () => { closeModal(); onConfirm(); });
      document.getElementById('modal-cancel').addEventListener('click', closeModal);
    }

    document.getElementById('modal-box').addEventListener('click', (e) => e.stopPropagation());
    document.getElementById('modal-overlay').addEventListener('click', () => { if (document.getElementById('gp-rows') || gpBusy) return; closeModal(); });

    function switchTo(id) {
      syncActiveFromDom();
      state.activeId = id;
      renderTabs();
      renderRecord();
      persist();
    }

    // ---- growing status: growing (default) / gone (not growing now) / wish (want to grow) ----
    const GROW_LABELS = { growing: 'Growing', gone: 'Not growing now', wish: 'Want to grow' };
    function growStatus(r) { return GROW_LABELS[r.growStatus] ? r.growStatus : 'growing'; }
    function growSelectHtml(r) {
      const g = growStatus(r);
      return '<select class="grow-select ' + g + '" id="grow-select" title="Is this plant in your garden now?">' +
        '<option value="growing"' + (g === 'growing' ? ' selected' : '') + '>🌱 Growing</option>' +
        '<option value="gone"' + (g === 'gone' ? ' selected' : '') + '>○ Not growing now</option>' +
        '<option value="wish"' + (g === 'wish' ? ' selected' : '') + '>☆ Want to grow</option></select>';
    }
    function growRing(r) {
      const g = growStatus(r);
      return g === 'growing' ? '' : '<span class="gs-ring ' + g + '" title="' + GROW_LABELS[g] + '"></span>';
    }

    function blankRecord(name) {
      return {
        id: 'p_' + Date.now(),
        commonName: name, botanicalName: '', category: '', tags: [],
        description: '', siteSoil: '', watering: '', pruning: '', propagation: '',
        floweringTime: '', hardiness: '', pestsDiseases: '',
        links: '', notes: '', photo1Desc: 'Whole plant', photo2Desc: 'Close-up — flower, leaf, or fruit',
        photo1AssetId: null, photo2AssetId: null
      };
    }

    document.getElementById('btn-add').addEventListener('click', () => {
      syncActiveFromDom();
      const rec = blankRecord('Untitled plant');
      state.records.push(rec);
      state.activeId = rec.id;
      renderTabs();
      renderRecord();
      persist();
    });

    document.getElementById('btn-delete').addEventListener('click', () => {
      const r = getActive();
      if (!r) return;
      showConfirmModal('Delete "' + (r.commonName || 'this plant') + '"? This cannot be undone.', () => {
        state.records = state.records.filter(x => x.id !== r.id);
        state.activeId = state.records.length ? state.records[0].id : null;
        renderTabs();
        renderRecord();
        persist();
      });
    });

    // ---- built-in manual ----
    function openHelp() {
      syncActiveFromDom();
      document.getElementById('help-overlay').classList.remove('hidden');
    }
    function closeHelp() { document.getElementById('help-overlay').classList.add('hidden'); }
    document.getElementById('btn-help').addEventListener('click', openHelp);
    document.getElementById('help-close').addEventListener('click', closeHelp);
    document.getElementById('help-toc').addEventListener('click', e => {
      const a = e.target.closest('a[href^="#h-"]');
      if (!a) return;
      e.preventDefault();
      const t = document.getElementById(a.getAttribute('href').slice(1));
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !document.getElementById('help-overlay').classList.contains('hidden')) { e.stopImmediatePropagation(); closeHelp(); }
    }, true);

    document.getElementById('btn-save').addEventListener('click', () => {
      persist();
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.bm-panel.open').forEach(p => p.classList.remove('open'));
    });

    // ---- import plants from pasted text / text file ----
    const IMPORT_HEADINGS = {
      'description': 'description', 'site & soil': 'siteSoil', 'site and soil': 'siteSoil',
      'watering': 'watering', 'pruning': 'pruning', 'propagation': 'propagation',
      'flowering time': 'floweringTime', 'hardiness': 'hardiness',
      'pests & diseases': 'pestsDiseases', 'pests and diseases': 'pestsDiseases'
    };

    // Extracts the 8 body fields from a block's remaining lines. Prefers explicit headings
    // ("Description", "Site & Soil", ...) when present; if a block has none at all (e.g. an
    // AI reply that just gives one line per field, in template order, with no labels), falls
    // back to reading the lines positionally in the template's own field order.
    const HEADING_STRIP_RE = /^\s*(description|site\s*&?\s*soil|site and soil|watering|pruning|propagation|flowering time|hardiness|pests?\s*&?\s*diseases|pests and diseases)\s*:\s*/i;
    function extractFieldsFromLines(lines) {
      const parts = {};
      let current = null, anyHeading = false;
      lines.forEach(line => {
        const key = IMPORT_HEADINGS[line.trim().toLowerCase()];
        if (key) { current = key; parts[key] = []; anyHeading = true; }
        else if (current) parts[current].push(line);
      });
      if (anyHeading) {
        const fields = {};
        FIELD_KEYS.forEach(k => { fields[k] = (parts[k] || []).join('\n').trim(); });
        return fields;
      }
      const contentLines = lines.map(l => l.trim()).filter(Boolean).map(l => l.replace(HEADING_STRIP_RE, ''));
      const fields = {};
      FIELD_KEYS.forEach((k, i) => { fields[k] = (contentLines[i] || '').trim(); });
      return fields;
    }

    function parsePlantText(text) {
      const blocks = String(text || '').replace(/\r\n?/g, '\n').split(/^[ \t]*={3,}[ \t]*$/m);
      const found = [];
      blocks.forEach(block => {
        const lines = block.split('\n').map(l => l.replace(/\s+$/, ''));
        while (lines.length && !lines[0].trim()) lines.shift();
        if (!lines.length) return;
        const stripMd = s => (s || '').replace(/^\*+|\*+$/g, '').trim();
        const line1 = stripMd(lines.shift().trim());
        while (lines.length && !lines[0].trim()) lines.shift();
        let line2 = '';
        if (lines.length && !IMPORT_HEADINGS[lines[0].trim().toLowerCase()]) line2 = stripMd(lines.shift().trim());
        // work out which of the two name lines is the Latin name, regardless of paste order
        const l1Latin = isLikelyLatinName(line1), l2Latin = isLikelyLatinName(line2);
        let latin, common;
        if (l1Latin && !l2Latin) { latin = line1; common = line2; }
        else if (l2Latin && !l1Latin) { latin = line2; common = line1; }
        else { latin = line1; common = line2; } // ambiguous: keep pasted order
        if (/^not sure\.?$/i.test(common)) common = '';
        const rec = blankRecord(common || latin);
        rec.botanicalName = latin;
        const fields = extractFieldsFromLines(lines);
        FIELD_KEYS.forEach(k => { rec[k] = fields[k]; });
        found.push(rec);
      });
      return found;
    }

    // A plant counts as a duplicate if its Latin name matches an existing record,
    // or — when there's no Latin name to go on — its common name matches instead.
    function dupKey(rec) {
      const latin = (rec.botanicalName || '').trim().toLowerCase();
      if (latin) return 'latin:' + latin;
      const common = (rec.commonName || '').trim().toLowerCase();
      return common ? 'common:' + common : '';
    }

    function findImportDuplicates(text) {
      const parsed = parsePlantText(text);
      const have = new Set(state.records.map(dupKey).filter(Boolean));
      const seenInBatch = new Set();
      const dupes = [], fresh = [];
      parsed.forEach(rec => {
        const key = dupKey(rec);
        if (key && (have.has(key) || seenInBatch.has(key))) dupes.push(rec);
        else { fresh.push(rec); if (key) seenInBatch.add(key); }
      });
      return { parsed, dupes, fresh };
    }

    function importPlants(records) {
      syncActiveFromDom();
      let firstId = null;
      records.forEach((rec, i) => {
        rec.id = 'p_' + Date.now() + '_' + i;
        state.records.push(rec);
        if (!firstId) firstId = rec.id;
      });
      if (firstId) state.activeId = firstId;
      return records.length;
    }

    function showImportModal() {
      const box = document.getElementById('modal-box');
      box.style.width = '520px'; box.style.maxWidth = '92vw';
      box.innerHTML =
        '<h3>Import plants</h3>' +
        '<p>Choose your text file, or paste the plants below. Each plant is separated by a line of =====.</p>' +
        '<input type="file" id="import-file" accept=".txt,.md,text/plain">' +
        '<textarea id="import-text" placeholder="Or paste here…"></textarea>' +
        '<p id="import-msg"></p>' +
        '<div class="modal-actions">' +
          '<button class="modal-cancel" id="modal-cancel">Cancel</button>' +
          '<button class="modal-confirm" id="modal-confirm">Check for duplicates</button>' +
        '</div>';
      document.getElementById('modal-overlay').classList.remove('hidden');
      const msg = document.getElementById('import-msg');
      const textEl = document.getElementById('import-text');
      const goBtn = document.getElementById('modal-confirm');
      let stage = 'check'; // 'check' -> 'confirm' -> 'done'
      let pending = null;
      document.getElementById('import-file').addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => { textEl.value = String(reader.result || ''); msg.textContent = 'File loaded. Press Check for duplicates.'; };
        reader.readAsText(f);
      });
      document.getElementById('modal-cancel').addEventListener('click', closeModal);

      function doImport(records, note) {
        const count = importPlants(records);
        stage = 'done';
        renderTabs();
        renderRecord();
        persist();
        msg.innerHTML = 'Imported ' + count + ' plant' + (count === 1 ? '' : 's') + '.' + (note ? '<br>' + note : '');
        goBtn.textContent = 'Close';
      }

      goBtn.addEventListener('click', () => {
        if (stage === 'done') { closeModal(); return; }
        if (stage === 'check') {
          const result = findImportDuplicates(textEl.value);
          if (!result.parsed.length) { msg.textContent = 'No plants found. Check the text has the plant name on the first line.'; return; }
          pending = result;
          if (!result.dupes.length) { doImport(result.fresh, null); return; }
          const names = result.dupes.map(r => esc(r.commonName || r.botanicalName || 'Untitled')).join(', ');
          msg.innerHTML = '<strong style="color:#b45309">These already exist in the app.</strong> If you\'re trying to fill in ' +
            'missing details for plants you already have, cancel this and use <strong>Update existing</strong> instead — Import ' +
            'only adds brand-new plants, it never fills in an existing one.<br><br>' +
            '<strong>' + result.dupes.length + ' possible duplicate' + (result.dupes.length === 1 ? '' : 's') +
            '</strong> (already in the app, or repeated in this file): ' + names +
            '.<br>' + result.fresh.length + ' new plant' + (result.fresh.length === 1 ? '' : 's') + ' will be imported.';
          stage = 'confirm';
          goBtn.textContent = 'Import new only';
          const skipBtn = document.createElement('button');
          skipBtn.className = 'modal-confirm';
          skipBtn.id = 'modal-confirm-all';
          skipBtn.textContent = 'Import all anyway';
          goBtn.parentNode.insertBefore(skipBtn, goBtn);
          skipBtn.addEventListener('click', () => doImport(pending.fresh.concat(pending.dupes), 'Included the possible duplicates too.'));
          return;
        }
        if (stage === 'confirm') { doImport(pending.fresh, pending.dupes.length ? (pending.dupes.length + ' duplicate' + (pending.dupes.length === 1 ? '' : 's') + ' skipped.') : null); }
      });
    }

    document.getElementById('btn-import').addEventListener('click', showImportModal);
    document.getElementById('btn-backup').addEventListener('click', showBackupModal);

    // ---- update existing plants from pasted text: fills blank/"Not sure" fields only ----
    function isLikelyLatinName(s) {
      s = (s || '').trim();
      if (!s) return false;
      // Genus + lowercase species (optionally with × hybrid marker or 'cultivar' / var. / subsp.)
      return /^[A-Z][a-zà-ÿ]+(\s*[×x]\s*|\s+)[a-zà-ÿ'’.-]/.test(s);
    }

    function parseUpdateBlocks(text) {
      const blocks = String(text || '').replace(/\r\n?/g, '\n').split(/^[ \t]*={3,}[ \t]*$/m);
      const stripMd = s => (s || '').replace(/^\*+|\*+$/g, '').trim();
      const found = [];
      blocks.forEach(block => {
        const lines = block.split('\n').map(l => l.replace(/\s+$/, ''));
        while (lines.length && !lines[0].trim()) lines.shift();
        if (!lines.length) return;
        const line1 = stripMd(lines.shift().trim());
        while (lines.length && !lines[0].trim()) lines.shift();
        let line2 = '';
        if (lines.length && !IMPORT_HEADINGS[lines[0].trim().toLowerCase()]) line2 = stripMd(lines.shift().trim());
        const fields = extractFieldsFromLines(lines);
        // work out which of the two name lines is the Latin name, regardless of paste order
        const l1Latin = isLikelyLatinName(line1), l2Latin = isLikelyLatinName(line2);
        let latin, common;
        if (l1Latin && !l2Latin) { latin = line1; common = line2; }
        else if (l2Latin && !l1Latin) { latin = line2; common = line1; }
        else { latin = line1; common = line2; } // ambiguous: keep pasted order
        if (/^not sure\.?$/i.test(common)) common = '';
        if (/^not sure\.?$/i.test(latin)) latin = '';
        found.push({ line1, line2, latin, common, fields });
      });
      return found;
    }

    function isUnsetField(v) {
      v = (v || '').trim();
      return !v || /^not sure\.?$/i.test(v);
    }

    function findExistingForUpdate(block) {
      const l = block.latin.toLowerCase(), c = block.common.toLowerCase();
      const l1 = block.line1.toLowerCase(), l2 = block.line2.toLowerCase();
      // match either name line against either stored name field, so paste order never matters
      return state.records.find(r => {
        const rl = (r.botanicalName || '').trim().toLowerCase();
        const rc = (r.commonName || '').trim().toLowerCase();
        if (!rl && !rc) return false;
        return (l && (l === rl || l === rc)) || (c && (c === rl || c === rc)) ||
               (l1 && (l1 === rl || l1 === rc)) || (l2 && (l2 === rl || l2 === rc));
      }) || null;
    }

    function planUpdates(text) {
      const blocks = parseUpdateBlocks(text);
      const matched = [], unmatched = [];
      blocks.forEach(block => {
        const rec = findExistingForUpdate(block);
        if (!rec) { unmatched.push(block); return; }
        const changes = {};
        if (isUnsetField(rec.botanicalName) && block.latin) changes.botanicalName = block.latin;
        if (isUnsetField(rec.commonName) && block.common) changes.commonName = block.common;
        FIELD_KEYS.forEach(k => {
          if (isUnsetField(rec[k]) && block.fields[k]) changes[k] = block.fields[k];
        });
        matched.push({ rec, changes, changeCount: Object.keys(changes).length });
      });
      return { matched, unmatched };
    }

    function applyUpdates(matched) {
      let filled = 0;
      matched.forEach(({ rec, changes }) => {
        Object.keys(changes).forEach(k => { rec[k] = changes[k]; filled++; });
      });
      return filled;
    }

    function showUpdateModal() {
      syncActiveFromDom();
      const box = document.getElementById('modal-box');
      box.style.width = '560px'; box.style.maxWidth = '92vw';
      box.innerHTML =
        '<h3>Update existing plants</h3>' +
        '<p>Paste plant text in the same layout as Import. Each pasted plant is matched to an existing plant by name, and only its blank or "Not sure" fields are filled in — anything you\'ve already written is left alone.</p>' +
        '<input type="file" id="update-file" accept=".txt,.md,text/plain">' +
        '<textarea id="update-text" placeholder="Paste here…"></textarea>' +
        '<p id="update-msg"></p>' +
        '<div class="modal-actions">' +
          '<button class="modal-cancel" id="modal-cancel">Cancel</button>' +
          '<button class="modal-confirm" id="modal-confirm">Preview updates</button>' +
        '</div>';
      document.getElementById('modal-overlay').classList.remove('hidden');
      const msg = document.getElementById('update-msg');
      const textEl = document.getElementById('update-text');
      const goBtn = document.getElementById('modal-confirm');
      let stage = 'check'; // 'check' -> 'done'
      let pending = null;
      document.getElementById('update-file').addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => { textEl.value = String(reader.result || ''); msg.textContent = 'File loaded. Press Preview updates.'; };
        reader.readAsText(f);
      });
      document.getElementById('modal-cancel').addEventListener('click', closeModal);
      goBtn.addEventListener('click', () => {
        if (stage === 'done') { closeModal(); return; }
        if (stage === 'check') {
          const result = planUpdates(textEl.value);
          if (!result.matched.length && !result.unmatched.length) {
            msg.textContent = 'No plants found. Check the text has the plant name on the first line.';
            return;
          }
          pending = result;
          const withChanges = result.matched.filter(m => m.changeCount > 0);
          const noChanges = result.matched.length - withChanges.length;
          let html = '';
          if (withChanges.length) {
            html += '<strong>' + withChanges.length + ' plant' + (withChanges.length === 1 ? '' : 's') + ' will be updated:</strong><br>' +
              withChanges.map(m => esc(m.rec.commonName || m.rec.botanicalName || 'Untitled') + ' — ' + m.changeCount + ' field' + (m.changeCount === 1 ? '' : 's')).join('<br>');
          }
          if (noChanges) html += '<br>' + noChanges + ' matched plant' + (noChanges === 1 ? '' : 's') + ' already fully filled in — nothing to add.';
          if (result.unmatched.length) {
            html += '<br><strong>' + result.unmatched.length + ' not matched to an existing plant</strong> (skipped): ' +
              result.unmatched.map(b => esc(b.common || b.latin || 'Untitled')).join(', ');
          }
          msg.innerHTML = html || 'Nothing to update.';
          if (withChanges.length) { goBtn.textContent = 'Apply updates'; stage = 'apply'; }
          else { goBtn.textContent = 'Close'; stage = 'done'; }
          return;
        }
        if (stage === 'apply') {
          const withChanges = pending.matched.filter(m => m.changeCount > 0);
          const filled = applyUpdates(withChanges);
          renderTabs();
          renderRecord();
          persist();
          msg.innerHTML = 'Updated ' + withChanges.length + ' plant' + (withChanges.length === 1 ? '' : 's') + ' (' + filled + ' field' + (filled === 1 ? '' : 's') + ' filled in).';
          goBtn.textContent = 'Close';
          stage = 'done';
        }
      });
    }

    document.getElementById('btn-import').insertAdjacentHTML('afterend', '<button class="btn" id="btn-update">Update existing</button>');
    document.getElementById('btn-update').addEventListener('click', showUpdateModal);

    // ---- browse view: cards + photos, filter by name / tag / flowering season ----
    const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];
    const MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const MONTH_SEASON = [3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3];
    const MONTH_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/g;
    const escA = s => esc(s).replace(/"/g, '&quot;');

    function normText(s) {
      return String(s || '').toLowerCase().replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u2018\u2019]/g, "'");
    }

    function rangeIndexes(hits, text, size) {
      if (!hits.length) return [];
      const set = new Set(hits.map(h => h.i));
      if (hits.length >= 2) {
        const first = hits[0], last = hits[hits.length - 1];
        const between = text.slice(first.end, last.start);
        if (/\bto\b|-|\bthrough\b|\buntil\b/.test(between)) {
          set.clear();
          let i = first.i; set.add(i);
          for (let n = 0; n < size && i !== last.i; n++) { i = (i + 1) % size; set.add(i); }
        }
      }
      return Array.from(set);
    }

    // Works out which seasons (0 spring, 1 summer, 2 autumn, 3 winter) a Flowering Time text covers.
    function seasonsOf(raw) {
      const t = normText(raw);
      if (!t.trim()) return [];
      if (/year-?round|all year|all seasons|throughout the year|every season/.test(t)) return [0, 1, 2, 3];
      const months = [];
      const mre = new RegExp(MONTH_RE.source, 'g');
      let m;
      while ((m = mre.exec(t))) {
        if (m[1] === 'may' && !/[A-Z]/.test(String(raw)[m.index])) continue;   // "may" the verb
        months.push({ i: MONTH_KEYS.findIndex(k => m[1].startsWith(k)), start: m.index, end: m.index + m[0].length });
      }
      if (months.length) {
        return Array.from(new Set(rangeIndexes(months, t, 12).map(mi => MONTH_SEASON[mi]))).sort((a, b) => a - b);
      }
      const seasons = [];
      const sre = /(spring|summer|autumn|fall|winter)/g;
      while ((m = sre.exec(t))) {
        seasons.push({ i: m[1] === 'fall' ? 2 : ['spring', 'summer', 'autumn', 'winter'].indexOf(m[1]), start: m.index, end: m.index + m[0].length });
      }
      return rangeIndexes(seasons, t, 4).sort((a, b) => a - b);
    }

    const bState = { q: '', tag: '', cat: '', season: '', status: '', grow: 'growing', sort: 'common', view: 'cards' };
    let bPhotos = [];
    let lbIndex = 0;

    function browseList() {
      const q = normText(bState.q).trim();
      const list = state.records.filter(r => {
        if (bState.tag && !(r.tags || []).includes(bState.tag)) return false;
        if (bState.cat === '__none') { if ((r.category || '').trim()) return false; }
        else if (bState.cat && (r.category || '').trim().toLowerCase() !== bState.cat.toLowerCase()) return false;
        if (bState.status === 'checked' && !r.checked) return false;
        if (bState.status === 'draft' && r.checked) return false;
        if (bState.grow && growStatus(r) !== bState.grow) return false;
        if (bState.season) {
          const ss = seasonsOf(r.floweringTime);
          if (bState.season === 'none') { if (ss.length) return false; }
          else if (!ss.includes(Number(bState.season))) return false;
        }
        if (q) {
          const hay = normText([r.commonName, r.botanicalName, r.category, (r.tags || []).join(' ')].join(' '));
          if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
        }
        return true;
      });
      const key = bState.sort === 'latin' ? 'botanicalName' : 'commonName';
      list.sort((a, b) => String(a[key] || a.commonName || '').localeCompare(String(b[key] || b.commonName || ''), 'en', { sensitivity: 'base', ignorePunctuation: true }));
      return list;
    }

    // ---- completeness traffic light (uses only the 8 template information fields) ----
    function fieldFilled(v) {
      const t = String(v || '').trim();
      return t !== '' && !/^(MISSING|Not sure\.?$)/i.test(t);
    }
    function completeness(r) {
      const filled = FIELD_KEYS.filter(k => fieldFilled(r[k])).length;
      const total = FIELD_KEYS.length;
      const level = filled === total ? 'green' : (filled >= 5 ? 'orange' : 'red');
      return { filled: filled, total: total, level: level };
    }
    function trafficDot(r) {
      const c = completeness(r);
      const word = c.level === 'green' ? 'Complete' : (c.level === 'orange' ? 'Mostly complete' : 'A lot to do');
      return '<span class="tl-dot ' + c.level + '" title="' + word + ' — ' + c.filled + ' of ' + c.total + ' fields filled"></span>';
    }

    function renderBrowseResults() {
      const list = browseList();
      document.getElementById('b-count').textContent = list.length + ' of ' + state.records.length + ' plants';
      const gn = { '': state.records.length, growing: 0, gone: 0, wish: 0 };
      state.records.forEach(r => { gn[growStatus(r)]++; });
      document.querySelectorAll('#b-grow [data-grow]').forEach(b => {
        const k = b.getAttribute('data-grow');
        b.classList.toggle('on', k === bState.grow);
        b.querySelector('[data-grow-n]').textContent = '(' + gn[k] + ')';
      });
      const box = document.getElementById('b-results');
      bPhotos = [];
      if (!list.length) { box.innerHTML = '<div class="b-empty">No plants match.</div>'; return; }
      if (bState.view === 'photos') {
        list.forEach(r => [1, 2].forEach(n => {
          const id = r['photo' + n + 'AssetId'];
          if (id) bPhotos.push({ rec: r, src: '_blob/' + id, caption: r['photo' + n + 'Desc'] || '' });
        }));
        box.innerHTML = bPhotos.length
          ? '<div class="card-grid">' + bPhotos.map((p, i) =>
              '<button class="plant-card' + (growStatus(p.rec) === 'gone' ? ' is-gone' : '') + '" data-photo="' + i + '">' + trafficDot(p.rec) + growRing(p.rec) + '<div class="thumb"><img loading="lazy" src="' + escA(p.src) + '" alt=""></div>' +
              '<div class="info"><div class="pc-name">' + esc(p.rec.commonName || 'Untitled') + '</div>' +
              '<div class="pc-latin">' + esc(p.rec.botanicalName) + '</div>' +
              '<div class="pc-when">' + esc(p.caption) + '</div></div></button>').join('') + '</div>'
          : '<div class="b-empty">No photos for these plants yet.</div>';
        return;
      }
      const tally = { green: 0, orange: 0, red: 0 };
      list.forEach(r => { tally[completeness(r).level]++; });
      const legend = '<div class="tl-legend">' +
        '<span><span class="tl-dot green"></span>Complete (all 8 fields): ' + tally.green + '</span>' +
        '<span><span class="tl-dot orange"></span>Mostly complete (5–7): ' + tally.orange + '</span>' +
        '<span><span class="tl-dot red"></span>A lot to do (0–4): ' + tally.red + '</span>' +
        (bState.grow === 'growing' ? '' : '<span><span class="gs-ring gone"></span>Not growing now</span><span><span class="gs-ring wish"></span>Want to grow</span>') + '</div>';
      box.innerHTML = legend + '<div class="card-grid">' + list.map(r => {
        const pid = r.photo1AssetId || r.photo2AssetId;
        const when = (r.floweringTime || '').trim();
        const col = recordColour(r);
        return '<button class="plant-card' + (growStatus(r) === 'gone' ? ' is-gone' : '') + '" data-rec="' + escA(r.id) + '">' +
          (col ? '<div class="pc-strip" style="background:' + col.bg + '" title="' + escA(col.label) + '"></div>' : '') +
          (r.checked ? '<span class="pc-check" title="Facts checked">✓ Checked</span>' : '') + trafficDot(r) + growRing(r) +
          '<div class="thumb">' + (pid ? '<img loading="lazy" src="_blob/' + escA(pid) + '" alt="">' : '✿') + '</div>' +
          '<div class="info">' + ((r.category || '').trim() ? '<div class="pc-cat">' + esc(r.category) + '</div>' : '') + '<div class="pc-name">' + esc(r.commonName || 'Untitled') + '</div>' +
          '<div class="pc-latin">' + esc(r.botanicalName) + '</div>' +
          (when ? '<div class="pc-when">' + esc(when.length > 60 ? when.slice(0, 57) + '…' : when) + '</div>' : '') +
          ((r.tags || []).length ? '<div class="pc-tags">' + r.tags.slice(0, 3).map(t => '<span>' + esc(t) + '</span>').join('') + '</div>' : '') +
          '</div></button>';
      }).join('') + '</div>';
    }

    function setBrowseView(v) {
      bState.view = v;
      document.getElementById('b-cards').classList.toggle('on', v === 'cards');
      document.getElementById('b-photos').classList.toggle('on', v === 'photos');
      renderBrowseResults();
    }

    function openBrowse() {
      syncActiveFromDom();
      const ov = document.getElementById('browse-overlay');
      const counts = {};
      state.records.forEach(r => (r.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
      ov.innerHTML =
        '<div class="browse-bar">' +
          '<h2>Browse plants</h2>' +
          '<input type="search" id="b-q" placeholder="Search name or tag…" value="' + escA(bState.q) + '">' +
          '<select id="b-tag"><option value="">Any tag</option>' +
            allTags().map(t => '<option value="' + escA(t) + '"' + (t === bState.tag ? ' selected' : '') + '>' + esc(t) + ' (' + counts[t] + ')</option>').join('') + '</select>' +
          '<select id="b-cat"><option value="">Any category</option>' +
            categoryList().map(c => '<option value="' + escA(c) + '"' + (c === bState.cat ? ' selected' : '') + '>' + esc(c) + '</option>').join('') +
            '<option value="__none"' + (bState.cat === '__none' ? ' selected' : '') + '>No category set</option></select>' +
          '<select id="b-season"><option value="">Any flowering season</option>' +
            SEASON_NAMES.map((n, i) => '<option value="' + i + '"' + (String(i) === bState.season ? ' selected' : '') + '>Flowers in ' + n.toLowerCase() + '</option>').join('') +
            '<option value="none"' + (bState.season === 'none' ? ' selected' : '') + '>No flowering season listed</option></select>' +
          '<select id="b-status"><option value="">Draft &amp; checked</option>' +
            '<option value="draft"' + (bState.status === 'draft' ? ' selected' : '') + '>Drafts only</option>' +
            '<option value="checked"' + (bState.status === 'checked' ? ' selected' : '') + '>Checked only</option></select>' +
          '<select id="b-sort"><option value="common"' + (bState.sort === 'common' ? ' selected' : '') + '>Sort by common name</option>' +
            '<option value="latin"' + (bState.sort === 'latin' ? ' selected' : '') + '>Sort by Latin name</option></select>' +
          '<span class="b-toggle"><button class="btn" id="b-cards">Cards</button><button class="btn" id="b-photos">Photos</button></span>' +
          '<button class="btn" id="b-close">Close</button>' +
        '</div>' +
        '<div class="browse-body"><div class="gs-row">Show: <span class="b-toggle" id="b-grow">' +
          [['', 'All'], ['growing', '🌱 Growing'], ['gone', '○ Not growing now'], ['wish', '☆ Want to grow']].map(o =>
            '<button class="btn" data-grow="' + o[0] + '">' + o[1] + ' <span data-grow-n="' + o[0] + '"></span></button>').join('') +
          '</span></div><div class="browse-count" id="b-count"></div><div id="b-results"></div></div>';
      ov.classList.remove('hidden');
      document.getElementById('b-q').addEventListener('input', e => { bState.q = e.target.value; renderBrowseResults(); });
      document.getElementById('b-tag').addEventListener('change', e => { bState.tag = e.target.value; renderBrowseResults(); });
      document.getElementById('b-cat').addEventListener('change', e => { bState.cat = e.target.value; renderBrowseResults(); });
      document.getElementById('b-season').addEventListener('change', e => { bState.season = e.target.value; renderBrowseResults(); });
      document.getElementById('b-status').addEventListener('change', e => { bState.status = e.target.value; renderBrowseResults(); });
      document.getElementById('b-sort').addEventListener('change', e => { bState.sort = e.target.value; renderBrowseResults(); });
      document.getElementById('b-grow').addEventListener('click', e => {
        const b = e.target.closest('[data-grow]');
        if (!b) return;
        bState.grow = b.getAttribute('data-grow');
        renderBrowseResults();
      });
      document.getElementById('b-cards').addEventListener('click', () => setBrowseView('cards'));
      document.getElementById('b-photos').addEventListener('click', () => setBrowseView('photos'));
      document.getElementById('b-close').addEventListener('click', closeBrowse);
      document.getElementById('b-results').addEventListener('click', e => {
        const photo = e.target.closest('[data-photo]');
        if (photo) { showLightbox(Number(photo.getAttribute('data-photo'))); return; }
        const card = e.target.closest('[data-rec]');
        if (card) openPlantFromBrowse(card.getAttribute('data-rec'));
      });
      setBrowseView(bState.view);
    }

    function closeBrowse() {
      document.getElementById('browse-overlay').classList.add('hidden');
    }

    // ---- Add garden photos: pick many photos, choose the plant + spot for each ----
    let gpRows = [];
    let gpBusy = false;
    function gpRowHtml(row, i) {
      return '<div class="gp-row" data-gp="' + i + '">' +
        '<img class="gp-thumb" src="' + row.url + '" alt="" title="Click to see bigger">' +
        '<div class="gp-main">' +
          '<div class="gp-file">' + esc(row.file.name) + '</div>' +
          '<div class="gp-bad" hidden>Can\'t read this photo type — it will be skipped. (Phone HEIC photos need converting to JPG first.)</div>' +
          '<div class="gp-pick"><input type="text" class="gp-input" placeholder="Type the plant name…" autocomplete="off">' +
          '<div class="finder-list hidden gp-list"></div></div>' +
          '<div class="gp-chosen"></div>' +
          '<div class="gp-slots">' +
            '<label><input type="radio" name="gp-slot-' + i + '" value="1"> Whole plant</label>' +
            '<label><input type="radio" name="gp-slot-' + i + '" value="2"> Close-up</label>' +
            '<label><input type="radio" name="gp-slot-' + i + '" value="" checked> Skip</label>' +
          '</div>' +
          '<div class="gp-warn"></div>' +
        '</div></div>';
    }
    function gpTarget(row) {
      if (row.bad || !row.slot) return null;
      if (row.recId) return 'id:' + row.recId + ':' + row.slot;
      if (row.newName) return 'new:' + row.newName.toLowerCase() + ':' + row.slot;
      return null;
    }
    function gpRefresh() {
      const counts = {};
      gpRows.forEach(r => { const t = gpTarget(r); if (t) counts[t] = (counts[t] || 0) + 1; });
      let ready = 0;
      gpRows.forEach((row, i) => {
        const el = document.querySelector('.gp-row[data-gp="' + i + '"]');
        if (!el) return;
        const rec = row.recId ? state.records.find(x => x.id === row.recId) : null;
        el.querySelector('.gp-chosen').innerHTML = rec ? '✓ ' + esc(plantLabel(rec)) :
          (row.newName ? '✓ <strong>New plant:</strong> ' + esc(row.newName) : '');
        el.querySelector('.gp-bad').hidden = !row.bad;
        el.classList.toggle('gp-done', !!gpTarget(row));
        el.querySelectorAll('.gp-slots input').forEach(r => { r.checked = (r.value === (row.slot || '')); });
        const warns = [];
        const t = gpTarget(row);
        if (t) {
          ready++;
          if (rec && rec['photo' + row.slot + 'AssetId']) warns.push('Will replace the ' + (row.slot === '1' ? 'whole plant' : 'close-up') + ' photo it already has.');
          if (counts[t] > 1) warns.push('Another photo is going to the same spot — only the last one will be kept.');
        } else if ((row.recId || row.newName) && !row.slot && !row.bad) warns.push('Choose Whole plant or Close-up, or it will be skipped.');
        el.querySelector('.gp-warn').textContent = warns.join(' ');
      });
      document.getElementById('gp-count').textContent = ready + ' of ' + gpRows.length + ' photos ready to add';
      document.getElementById('gp-go').disabled = !ready;
      document.getElementById('gp-go').textContent = ready ? 'Add ' + ready + ' photo' + (ready === 1 ? '' : 's') : 'Add photos';
    }
    function gpChoose(i, rec, newName) {
      const row = gpRows[i];
      row.recId = rec ? rec.id : null;
      row.newName = rec ? '' : (newName || '');
      if (!row.slot) {
        // pick a sensible spot: fill an empty one first, otherwise Whole plant
        if (rec && !rec.photo1AssetId) row.slot = '1';
        else if (rec && !rec.photo2AssetId) row.slot = '2';
        else row.slot = '1';
      }
      const el = document.querySelector('.gp-row[data-gp="' + i + '"]');
      el.querySelector('.gp-input').value = rec ? plantLabel(rec) : row.newName;
      el.querySelector('.gp-list').classList.add('hidden');
      gpRefresh();
    }
    function gpRenderList(i) {
      const el = document.querySelector('.gp-row[data-gp="' + i + '"]');
      const inp = el.querySelector('.gp-input'), list = el.querySelector('.gp-list');
      const q = inp.value.trim();
      if (!q) { list.classList.add('hidden'); return; }
      const matches = findPlants(q);
      list.innerHTML = matches.map(r =>
          '<div class="finder-item" data-pick="' + escA(r.id) + '">' +
          ((r.category || '').trim() ? '<span class="fi-cat">' + esc(r.category) + '</span>' : '') +
          '<span class="fi-name">' + esc(r.commonName || 'Untitled') + '</span>' +
          (r.botanicalName ? '<span class="fi-latin">' + esc(r.botanicalName) + '</span>' : '') + '</div>').join('') +
        '<div class="finder-item" data-new="1">➕ New plant called “' + esc(q) + '”</div>';
      list.classList.remove('hidden');
    }
    function gpAddFiles(files) {
      const start = gpRows.length;
      Array.from(files || []).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name)).forEach(f => {
        gpRows.push({ file: f, url: URL.createObjectURL(f), recId: null, newName: '', slot: '', bad: false });
      });
      const listEl = document.getElementById('gp-rows');
      listEl.insertAdjacentHTML('beforeend', gpRows.slice(start).map((r, k) => gpRowHtml(r, start + k)).join(''));
      document.getElementById('gp-empty').hidden = gpRows.length > 0;
      gpRows.slice(start).forEach((r, k) => {
        const img = document.querySelector('.gp-row[data-gp="' + (start + k) + '"] .gp-thumb');
        img.addEventListener('error', () => { r.bad = true; gpRefresh(); });
      });
      gpRefresh();
    }
    function gpClose() {
      if (gpBusy) return;
      gpRows.forEach(r => URL.revokeObjectURL(r.url));
      gpRows = [];
      closeModal();
    }
    function showGardenPhotosModal() {
      syncActiveFromDom();
      gpRows = [];
      const box = document.getElementById('modal-box');
      box.style.width = '860px'; box.style.maxWidth = '96vw';
      box.innerHTML =
        '<h3>Add garden photos</h3>' +
        '<p>Choose several photos at once. For each one, type the plant name and pick <strong>Whole plant</strong> or <strong>Close-up</strong>. Photos left on <em>Skip</em> are ignored.</p>' +
        '<div class="gp-top"><label class="modal-confirm gp-choose">📂 Choose photos…<input type="file" id="gp-file" accept="image/*" multiple hidden></label>' +
        '<span class="gp-hint">or drag photos into this window</span></div>' +
        '<div class="gp-empty" id="gp-empty">No photos chosen yet.</div>' +
        '<div id="gp-rows" class="gp-rows"></div>' +
        '<div class="bk-msg" id="gp-msg"></div>' +
        '<div class="gp-foot"><span id="gp-count"></span><div class="modal-actions">' +
        '<button class="modal-cancel" id="gp-cancel">Cancel</button>' +
        '<button class="modal-confirm" id="gp-go" disabled>Add photos</button></div></div>';
      document.getElementById('modal-overlay').classList.remove('hidden');
      gpRefresh();
      document.getElementById('gp-file').addEventListener('change', e => { gpAddFiles(e.target.files); e.target.value = ''; });
      document.getElementById('gp-cancel').addEventListener('click', gpClose);
      box.addEventListener('dragover', gpDragOver);
      box.addEventListener('drop', gpDrop);
      const rowsEl = document.getElementById('gp-rows');
      rowsEl.addEventListener('input', e => {
        const row = e.target.closest('.gp-row'); if (!row || !e.target.classList.contains('gp-input')) return;
        const i = Number(row.getAttribute('data-gp'));
        gpRows[i].recId = null; gpRows[i].newName = '';
        gpRenderList(i); gpRefresh();
      });
      rowsEl.addEventListener('keydown', e => {
        if (!e.target.classList.contains('gp-input')) return;
        const i = Number(e.target.closest('.gp-row').getAttribute('data-gp'));
        if (e.key === 'Enter') {
          e.preventDefault();
          const m = findPlants(e.target.value);
          if (m.length) gpChoose(i, m[0]);
        } else if (e.key === 'Escape') { e.stopPropagation(); e.target.closest('.gp-row').querySelector('.gp-list').classList.add('hidden'); }
      });
      rowsEl.addEventListener('focusout', e => {
        if (!e.target.classList.contains('gp-input')) return;
        const list = e.target.closest('.gp-row').querySelector('.gp-list');
        setTimeout(() => list.classList.add('hidden'), 150);
      });
      rowsEl.addEventListener('mousedown', e => {
        const item = e.target.closest('.gp-list .finder-item');
        if (!item) return;
        e.preventDefault();
        const i = Number(item.closest('.gp-row').getAttribute('data-gp'));
        if (item.hasAttribute('data-pick')) gpChoose(i, state.records.find(r => r.id === item.getAttribute('data-pick')));
        else {
          const nm = item.closest('.gp-row').querySelector('.gp-input').value.trim();
          const existing = state.records.find(r => (r.commonName || '').trim().toLowerCase() === nm.toLowerCase());
          if (existing) gpChoose(i, existing); else gpChoose(i, null, nm);
        }
      });
      rowsEl.addEventListener('change', e => {
        if (e.target.type !== 'radio') return;
        const i = Number(e.target.closest('.gp-row').getAttribute('data-gp'));
        gpRows[i].slot = e.target.value;
        gpRefresh();
      });
      rowsEl.addEventListener('click', e => {
        if (e.target.classList.contains('gp-thumb')) e.target.classList.toggle('big');
      });
      document.getElementById('gp-go').addEventListener('click', gpApply);
    }
    function gpDragOver(e) { e.preventDefault(); }
    function gpDrop(e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) gpAddFiles(e.dataTransfer.files);
    }
    async function gpApply() {
      const todo = gpRows.filter(r => gpTarget(r));
      if (!todo.length) return;
      const msg = document.getElementById('gp-msg');
      const go = document.getElementById('gp-go'), cancel = document.getElementById('gp-cancel');
      try { if (!assetsApi) assetsApi = await claude.use('assets'); } catch (e) {}
      if (!assetsApi) { msg.textContent = 'Photo upload is not available here.'; return; }
      gpBusy = true; go.disabled = true; cancel.disabled = true;
      const created = {};
      const failed = [];
      let done = 0, newPlants = 0, lastId = null;
      for (const row of todo) {
        msg.textContent = 'Adding photo ' + (done + failed.length + 1) + ' of ' + todo.length + '… please wait.';
        try {
          let rec = row.recId ? state.records.find(x => x.id === row.recId) : null;
          if (!rec && row.newName) {
            const key = row.newName.toLowerCase();
            rec = created[key];
            if (!rec) {
              rec = blankRecord(row.newName);
              rec.id = 'p_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
              state.records.push(rec);
              created[key] = rec; newPlants++;
            }
          }
          if (!rec) throw new Error('no plant');
          const blob = await resizeImage(row.file, 1200);
          const result = await assetsApi.upload(blob);
          rec['photo' + row.slot + 'AssetId'] = result.id;
          lastId = rec.id;
          done++;
        } catch (e) {
          failed.push(row.file.name);
        }
      }
      gpBusy = false;
      if (done) {
        if (lastId) state.activeId = lastId;
        renderTabs(); renderRecord();
        persist();
      }
      let out = '✓ Added ' + done + ' photo' + (done === 1 ? '' : 's') + '.';
      if (newPlants) out += ' Created ' + newPlants + ' new plant' + (newPlants === 1 ? '' : 's') + ' (their facts still need filling in).';
      if (failed.length) out += ' Could not add: ' + failed.join(', ') + '.';
      document.getElementById('modal-box').innerHTML = '<h3>Add garden photos</h3><p>' + esc(out) + '</p>' +
        '<div class="modal-actions"><button class="modal-confirm" id="gp-ok">OK</button></div>';
      gpRows.forEach(r => URL.revokeObjectURL(r.url));
      gpRows = [];
      document.getElementById('gp-ok').addEventListener('click', closeModal);
    }
    document.getElementById('btn-photos').addEventListener('click', showGardenPhotosModal);

    // ---- Back button: return to the search or Browse view you came from ----
    let backTarget = null;
    function setBack(t) {
      backTarget = t;
      document.getElementById('btn-back').hidden = !t;
      // remember where Back goes (and the Browse filters) inside the saved data,
      // so it survives the page reloading after an autosave
      state.nav = t ? { back: t, at: Date.now(), browse: Object.assign({}, bState) } : null;
    }
    function goBack() {
      const t = backTarget;
      if (!t) return;
      if (t.type === 'browse') {
        openBrowse();
        const body = document.querySelector('#browse-overlay .browse-body');
        if (body) requestAnimationFrame(() => { body.scrollTop = t.scroll || 0; });
      } else if (t.type === 'search') {
        const inp = document.getElementById('finder-input');
        inp.focus();
        inp.value = t.q;
        finderIdx = -1;
        renderFinderList();
      }
    }
    document.getElementById('btn-back').addEventListener('click', goBack);

    function openPlantFromBrowse(id) {
      const body = document.querySelector('#browse-overlay .browse-body');
      setBack({ type: 'browse', scroll: body ? body.scrollTop : 0 });
      hideLightbox();
      closeBrowse();
      tagFilter = '';
      switchTo(id);
    }

    function showLightbox(i) {
      if (!bPhotos.length) return;
      lbIndex = (i + bPhotos.length) % bPhotos.length;
      const p = bPhotos[lbIndex];
      document.getElementById('lb-img').src = p.src;
      document.getElementById('lb-cap').innerHTML =
        '<div class="lb-title">' + esc(p.rec.commonName || 'Untitled') + (p.rec.botanicalName ? ' <em>' + esc(p.rec.botanicalName) + '</em>' : '') + '</div>' +
        (p.caption ? '<div class="lb-desc">' + esc(p.caption) + '</div>' : '') +
        '<div class="lb-count">' + (lbIndex + 1) + ' / ' + bPhotos.length + '</div>' +
        '<button class="btn" id="lb-open">Open this plant</button>';
      document.getElementById('lb-open').addEventListener('click', () => openPlantFromBrowse(p.rec.id));
      document.getElementById('lightbox').classList.remove('hidden');
    }

    function hideLightbox() {
      document.getElementById('lightbox').classList.add('hidden');
    }

    document.getElementById('btn-browse').addEventListener('click', openBrowse);
    document.getElementById('lb-close').addEventListener('click', hideLightbox);
    document.getElementById('lb-prev').addEventListener('click', () => showLightbox(lbIndex - 1));
    document.getElementById('lb-next').addEventListener('click', () => showLightbox(lbIndex + 1));
    document.getElementById('lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') hideLightbox(); });
    document.addEventListener('keydown', e => {
      const lbOpen = !document.getElementById('lightbox').classList.contains('hidden');
      const brOpen = !document.getElementById('browse-overlay').classList.contains('hidden');
      if (lbOpen) {
        if (e.key === 'Escape') hideLightbox();
        else if (e.key === 'ArrowLeft') showLightbox(lbIndex - 1);
        else if (e.key === 'ArrowRight') showLightbox(lbIndex + 1);
      } else if (brOpen && e.key === 'Escape') closeBrowse();
    });

    // ---- categories ----
    function categoryList() {
      const list = state.categories.slice();
      state.records.forEach(r => {
        const c = (r.category || '').trim();
        if (c && !list.some(x => x.toLowerCase() === c.toLowerCase())) list.push(c);
      });
      return list;
    }

    function categorySelectHtml(r) {
      const cur = (r.category || '').trim();
      return '<select class="cat-select' + (cur ? '' : ' unset') + '" id="cat-select" title="Category">' +
        '<option value="">Category…</option>' +
        categoryList().map(c => '<option value="' + escA(c) + '"' + (c.toLowerCase() === cur.toLowerCase() ? ' selected' : '') + '>' + esc(c) + '</option>').join('') +
        '<option value="__new">＋ Add new category…</option></select>';
    }

    // ---- photo paste button ----
    function showInfoModal(title, message) {
      const box = document.getElementById('modal-box');
      box.innerHTML = '<h3>' + esc(title) + '</h3><p>' + esc(message) + '</p>' +
        '<div class="modal-actions"><button class="modal-confirm" id="modal-confirm">OK</button></div>';
      document.getElementById('modal-overlay').classList.remove('hidden');
      document.getElementById('modal-confirm').addEventListener('click', closeModal);
    }

    async function pastePhoto(slotNum) {
      const slot = document.querySelector('.photo-slot[data-slot="' + slotNum + '"]');
      try {
        if (!navigator.clipboard || !navigator.clipboard.read) throw new Error('clipboard not available');
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const type = item.types.find(t => t.indexOf('image/') === 0);
          if (type) {
            const blob = await item.getType(type);
            handlePhotoFile(new File([blob], 'pasted.' + type.split('/')[1], { type: type }), slotNum);
            return;
          }
        }
        showInfoModal('No picture found', 'There is no picture on the clipboard. Copy an image first (right-click it, then Copy image), then press Paste again.');
      } catch (err) {
        if (slot) slot.focus();
        showInfoModal('Paste the photo yourself', 'This browser will not let the button read the clipboard here. Right-click inside the photo box and choose Paste, or click the box and press Ctrl+V. The photo box is now selected.');
      }
    }

    // ---- backup (saves a .json file to the user's computer) ----
    function photoIds() {
      const ids = [];
      state.records.forEach(r => [r.photo1AssetId, r.photo2AssetId].forEach(id => { if (id && !ids.includes(id)) ids.push(id); }));
      return ids;
    }
    function blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
    }
    function showBackupModal() {
      syncActiveFromDom();
      let last = '';
      try { last = localStorage.getItem('plantBackupLast') || ''; } catch (e) {}
      const box = document.getElementById('modal-box');
      box.style.width = '440px'; box.style.maxWidth = '92vw';
      box.innerHTML =
        '<h3>Back up your plants</h3>' +
        '<p>Saves a file to your computer containing every plant record, tags, tag colours, categories and bookmarks. ' +
        (last ? 'Last backup made on this device: ' + esc(last) + '.' : 'No backup has been made on this device yet.') + '</p>' +
        '<div class="bk-row"><button class="modal-confirm" id="bk-data">Records only</button><span>' + state.records.length + ' plants. Small and quick. Photos are not included.</span></div>' +
        '<div class="bk-row"><button class="modal-confirm" id="bk-all">Records + photos</button><span>' + photoIds().length + ' photos included. A larger file that can take a minute or two.</span></div>' +
        '<div class="bk-msg" id="bk-msg"></div>' +
        '<div class="rs-sec"><h4>Restore from a backup</h4>' +
          '<p>Bring back plants from a backup file saved earlier.</p>' +
          '<input type="file" id="rs-file" accept=".json,application/json" style="display:none">' +
          '<button class="modal-cancel rs-choose" id="rs-choose">📂 Choose backup file…</button>' +
          '<div class="rs-info" id="rs-info"></div>' +
          '<div class="bk-row" id="rs-actions" style="display:none"></div>' +
        '</div>' +
        '<div class="modal-actions"><button class="modal-cancel" id="modal-cancel">Close</button></div>';
      document.getElementById('modal-overlay').classList.remove('hidden');
      document.getElementById('modal-cancel').addEventListener('click', closeModal);
      document.getElementById('bk-data').addEventListener('click', () => doBackup(false));
      document.getElementById('bk-all').addEventListener('click', () => doBackup(true));
      document.getElementById('rs-choose').addEventListener('click', () => document.getElementById('rs-file').click());
      document.getElementById('rs-file').addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (f) readBackupFile(f);
      });
    }

    // ---- restore from a backup file ----
    let rsBusy = false;
    async function readBackupFile(file) {
      const info = document.getElementById('rs-info');
      const acts = document.getElementById('rs-actions');
      acts.style.display = 'none'; acts.innerHTML = '';
      let payload = null;
      try { payload = JSON.parse(await file.text()); } catch (e) { payload = null; }
      if (!payload || payload.app !== 'plant-records' || !payload.data || !Array.isArray(payload.data.records)) {
        info.textContent = '⚠ That file is not a Plant Records backup. Choose a file whose name starts with "plant-records-backup".';
        return;
      }
      const recs = payload.data.records.filter(r => r && r.id);
      const have = new Set(state.records.map(r => r.id));
      const missing = recs.filter(r => !have.has(r.id));
      const when = payload.exportedAt ? new Date(payload.exportedAt).toLocaleString() : 'unknown date';
      const hasPhotos = payload.photos && Object.keys(payload.photos).length > 0;
      info.innerHTML = '<strong>' + esc(file.name) + '</strong><br>Made on ' + esc(when) + ' · ' + recs.length + ' plants · ' +
        (hasPhotos ? 'photos included' : 'no photos in this file') + '<br>' +
        (missing.length ? missing.length + ' plant' + (missing.length === 1 ? ' is' : 's are') + ' in the backup but not in the app now.'
                        : 'Every plant in this backup is already in the app.');
      acts.innerHTML =
        (missing.length ? '<button class="modal-confirm" id="rs-missing">Add back missing plants (' + missing.length + ')</button>' +
          '<span>Safe: only adds plants that aren\'t in the app. Nothing else changes.</span>' : '') +
        '<button class="modal-confirm danger" id="rs-all" style="margin-top:8px">Replace everything with this backup</button>' +
        '<span>Only if the app has gone badly wrong. Changes made since ' + esc(when) + ' will be lost.</span>';
      acts.style.display = '';
      if (missing.length) document.getElementById('rs-missing').addEventListener('click', () => doRestore(payload, missing, false));
      document.getElementById('rs-all').addEventListener('click', () => {
        if (!confirmStep('rs-all', 'Click again to confirm: replace all ' + state.records.length + ' plants with the ' + recs.length + ' from the backup')) return;
        doRestore(payload, recs, true);
      });
    }
    function confirmStep(id, text) {
      const b = document.getElementById(id);
      if (b.dataset.armed) return true;
      b.dataset.armed = '1'; b.textContent = text;
      return false;
    }
    async function blobExists(id) {
      try { const r = await fetch('_blob/' + id, { method: 'HEAD' }); if (r.ok) return true; if (r.status !== 405) return false; } catch (e) {}
      try { const r = await fetch('_blob/' + id); return r.ok; } catch (e) { return false; }
    }
    async function doRestore(payload, recs, replaceAll) {
      if (rsBusy) return;
      rsBusy = true;
      const info = document.getElementById('rs-info');
      const acts = document.getElementById('rs-actions');
      const say = t => { if (info) info.textContent = t; };
      acts.querySelectorAll('button').forEach(b => { b.disabled = true; });
      try {
        syncActiveFromDom();
        const copy = JSON.parse(JSON.stringify(recs));
        const photos = payload.photos || {};
        let reup = 0, lost = 0, n = 0;
        const ids = [];
        copy.forEach(r => [r.photo1AssetId, r.photo2AssetId].forEach(id => { if (id && !ids.includes(id)) ids.push(id); }));
        const remap = {};
        for (const id of ids) {
          n++;
          say('Checking photos… ' + n + ' of ' + ids.length);
          if (await blobExists(id)) continue;
          if (photos[id]) {
            try {
              if (!assetsApi) assetsApi = await claude.use('assets');
              const blob = await (await fetch(photos[id])).blob();
              const res = await assetsApi.upload(blob);
              remap[id] = res.id; reup++; continue;
            } catch (e) {}
          }
          remap[id] = null; lost++;
        }
        copy.forEach(r => ['photo1AssetId', 'photo2AssetId'].forEach(k => { if (r[k] && r[k] in remap) r[k] = remap[r[k]]; }));
        if (replaceAll) {
          const d = payload.data;
          state.records = copy;
          if (Array.isArray(d.bookmarks)) state.bookmarks = d.bookmarks;
          if (d.tagColors && typeof d.tagColors === 'object' && !Array.isArray(d.tagColors)) state.tagColors = d.tagColors;
          Object.keys(d).forEach(k => { if (!['records', 'bookmarks', 'tagColors', 'activeId', 'nav'].includes(k)) state[k] = d[k]; });
        } else {
          state.records = state.records.concat(copy);
        }
        state.activeId = copy.length ? copy[0].id : (state.records[0] ? state.records[0].id : null);
        renderTabs();
        renderRecord();
        await persist();
        say('✓ Done. ' + copy.length + ' plant' + (copy.length === 1 ? '' : 's') + ' restored' +
          (reup ? ', ' + reup + ' photo' + (reup === 1 ? '' : 's') + ' put back' : '') +
          (lost ? '. ' + lost + ' photo' + (lost === 1 ? ' was' : 's were') + ' not in the backup file' : '') + '.');
        acts.style.display = 'none';
      } catch (e) {
        say('Something went wrong, so nothing was changed. Please try again.');
        acts.querySelectorAll('button').forEach(b => { b.disabled = false; });
      }
      rsBusy = false;
    }
    async function doBackup(withPhotos) {
      const say = (t) => { const m = document.getElementById('bk-msg'); if (m) m.textContent = t; };
      const lock = (v) => ['bk-data', 'bk-all'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = v; });
      lock(true);
      let dl = null;
      try { dl = await claude.use('downloads'); } catch (e) { dl = null; }
      if (!dl) { say('Saving files is not available in this view.'); lock(false); return; }
      try {
        syncActiveFromDom();
        const payload = { app: 'plant-records', format: 1, exportedAt: new Date().toISOString(), data: state };
        let failed = 0;
        if (withPhotos) {
          payload.photos = {};
          const ids = photoIds();
          for (let i = 0; i < ids.length; i++) {
            say('Collecting photos… ' + (i + 1) + ' of ' + ids.length);
            try {
              const res = await fetch('_blob/' + ids[i]);
              if (!res.ok) throw new Error('bad response');
              payload.photos[ids[i]] = await blobToDataUrl(await res.blob());
            } catch (e) { failed++; }
          }
        }
        say('Preparing the file…');
        const stamp = new Date().toISOString().slice(0, 10);
        const name = 'plant-records-backup-' + stamp + (withPhotos ? '-with-photos' : '') + '.json';
        await dl.save({ filename: name, data: new Blob([JSON.stringify(payload)], { type: 'application/json' }) });
        try { localStorage.setItem('plantBackupLast', new Date().toLocaleString()); } catch (e) {}
        say('Backup saved.' + (failed ? ' ' + failed + ' photo' + (failed === 1 ? '' : 's') + ' could not be read and ' + (failed === 1 ? 'is' : 'are') + ' not in the file.' : ''));
      } catch (e) {
        say(e && e.code === 'declined' ? 'Cancelled — nothing was saved.' : 'Could not save the backup. Please try again.');
      }
      lock(false);
    }

    // ---- tag manager (rename / merge / delete a tag across all plants) ----
    function showTagManager() {
      syncActiveFromDom();
      const counts = {};
      state.records.forEach(r => (r.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
      const tags = Object.keys(counts).sort((a, b) => a.localeCompare(b));
      const box = document.getElementById('modal-box');
      box.style.width = '500px'; box.style.maxWidth = '94vw';
      box.innerHTML =
        '<h3>Manage tags</h3>' +
        '<p>Rename a tag to fix a spelling, or rename it to an existing tag to merge the two. Delete removes it from every plant. Pick a colour for a tag and any plant with that tag gets that top-bar colour (if a plant has several coloured tags, the first one wins).</p>' +
        '<div class="tm-list">' + (tags.length ? tags.map((t, i) =>
          '<div class="tm-row"><span class="tm-name">' + esc(t) + '</span><span class="tm-count">' + counts[t] + '</span>' +
          '<select class="tm-colour" data-col="' + i + '"' + (tagColour(t) ? ' style="background:' + tagColour(t).bg + ';color:#2B2A22"' : '') + '>' +
          '<option value="">No colour</option>' + colourOptionsHtml(state.tagColors[t]) + '</select>' +
          '<button class="tm-btn" data-ren="' + i + '">Rename</button><button class="tm-btn" data-del="' + i + '">Delete</button></div>'
        ).join('') : '<div class="bm-empty">No tags yet</div>') + '</div>' +
        '<div class="modal-actions"><button class="modal-cancel" id="modal-cancel">Close</button></div>';
      document.getElementById('modal-overlay').classList.remove('hidden');
      document.getElementById('modal-cancel').addEventListener('click', closeModal);
      const changed = () => { renderRecord(); renderTabs(); persist(); };
      box.querySelectorAll('[data-col]').forEach(sel => sel.addEventListener('change', () => {
        const t = tags[Number(sel.getAttribute('data-col'))];
        const c = colourByKey(sel.value);
        if (c) { state.tagColors[t] = c.key; sel.style.background = c.bg; sel.style.color = '#2B2A22'; }
        else { delete state.tagColors[t]; sel.style.background = ''; sel.style.color = ''; }
        changed();
      }));
      box.querySelectorAll('[data-ren]').forEach(b => b.addEventListener('click', () => {
        const old = tags[Number(b.getAttribute('data-ren'))];
        showPromptModal('Rename "' + old + '" to…', old, (name) => {
          const nu = normalizeTag(name);
          if (nu && nu !== old) {
            state.records.forEach(r => {
              if ((r.tags || []).includes(old)) r.tags = Array.from(new Set(r.tags.map(t => (t === old ? nu : t))));
            });
            if (state.tagColors[old]) {
              if (!state.tagColors[nu]) state.tagColors[nu] = state.tagColors[old];
              delete state.tagColors[old];
            }
            changed();
          }
          showTagManager();
        }, 'Rename');
      }));
      box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
        const old = tags[Number(b.getAttribute('data-del'))];
        showConfirmModal('Remove the tag "' + old + '" from ' + counts[old] + ' plant' + (counts[old] === 1 ? '' : 's') + '?', () => {
          state.records.forEach(r => { r.tags = (r.tags || []).filter(t => t !== old); });
          delete state.tagColors[old];
          changed();
          showTagManager();
        });
      }));
    }

    // ---- top-bar plant finder with predictive suggestions ----
    let finderMatches = [];
    let finderIdx = -1;

    function plantLabel(r) {
      const name = r.commonName || 'Untitled';
      const k = (r.commonName || '').trim().toLowerCase();
      const dup = state.records.filter(x => (x.commonName || '').trim().toLowerCase() === k).length > 1;
      return (dup && r.botanicalName) ? name + ' (' + r.botanicalName + ')' : name;
    }

    function findPlants(q) {
      const words = normText(q).trim().split(/\s+/).filter(Boolean);
      if (!words.length) return [];
      const first = words[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const startRe = new RegExp("(^|[\\s'(-])" + first);
      const scored = [];
      state.records.forEach(r => {
        const name = normText(r.commonName), latin = normText(r.botanicalName);
        const hay = name + ' ' + latin + ' ' + normText((r.tags || []).join(' ')) + ' ' + normText(r.category);
        if (!words.every(w => hay.includes(w))) return;
        let score = 3;
        if (name.startsWith(words[0]) || latin.startsWith(words[0])) score = 0;
        else if (startRe.test(name + ' ' + latin)) score = 1;
        else if ((name + ' ' + latin).includes(words[0])) score = 2;
        scored.push({ r: r, score: score });
      });
      scored.sort((a, b) => a.score - b.score || String(a.r.commonName).localeCompare(String(b.r.commonName)));
      return scored.slice(0, 10).map(x => x.r);
    }

    function renderFinderList() {
      const inp = document.getElementById('finder-input');
      const box = document.getElementById('finder-list');
      if (!inp.value.trim()) { box.classList.add('hidden'); finderMatches = []; return; }
      finderMatches = findPlants(inp.value);
      if (finderIdx >= finderMatches.length) finderIdx = finderMatches.length - 1;
      box.innerHTML = finderMatches.length
        ? finderMatches.map((r, i) =>
            '<div class="finder-item' + (i === finderIdx ? ' active' : '') + '" data-id="' + escA(r.id) + '">' +
            ((r.category || '').trim() ? '<span class="fi-cat">' + esc(r.category) + '</span>' : '') +
            '<span class="fi-name">' + esc(r.commonName || 'Untitled') + '</span>' +
            (r.botanicalName ? '<span class="fi-latin">' + esc(r.botanicalName) + '</span>' : '') +
            '</div>').join('')
        : '<div class="finder-item none">No plants match</div>';
      box.classList.remove('hidden');
    }

    function chooseFinderPlant(id) {
      const inp = document.getElementById('finder-input');
      if (inp.value.trim()) setBack({ type: 'search', q: inp.value });
      document.getElementById('finder-list').classList.add('hidden');
      inp.blur();
      switchTo(id);
    }

    (function wireFinder() {
      const inp = document.getElementById('finder-input');
      const box = document.getElementById('finder-list');
      inp.addEventListener('focus', () => inp.select());
      inp.addEventListener('input', () => { finderIdx = -1; renderFinderList(); });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (finderMatches.length) { finderIdx = (finderIdx + 1) % finderMatches.length; renderFinderList(); } }
        else if (e.key === 'ArrowUp') { e.preventDefault(); if (finderMatches.length) { finderIdx = (finderIdx - 1 + finderMatches.length) % finderMatches.length; renderFinderList(); } }
        else if (e.key === 'Enter') {
          e.preventDefault();
          const pick = finderMatches[finderIdx >= 0 ? finderIdx : 0];
          if (pick) chooseFinderPlant(pick.id);
        } else if (e.key === 'Escape') { box.classList.add('hidden'); inp.blur(); }
      });
      inp.addEventListener('blur', () => {
        setTimeout(() => { box.classList.add('hidden'); finderIdx = -1; renderTabs(); }, 150);
      });
      box.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const item = e.target.closest('.finder-item[data-id]');
        if (item) chooseFinderPlant(item.getAttribute('data-id'));
      });
    })();

    // restore the Back button after an autosave reload (only if recent)
    (function restoreBack() {
      const n = state.nav;
      if (!n || !n.back || Date.now() - (n.at || 0) > 3 * 60 * 60 * 1000) return;
      if (n.browse) Object.assign(bState, n.browse);
      backTarget = n.back;
      document.getElementById('btn-back').hidden = false;
    })();

    // initial load
    renderTabs();
    renderRecord();
    (async () => {
      artifactApi = await claude.use('artifact');
      setStatus(artifactApi ? 'All changes saved' : 'Saving is not available in this browser');
    })();
