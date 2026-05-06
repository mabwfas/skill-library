/**
 * Skill Library — vanilla JS app
 * Sidebar nav + category chips + book carousel + slide-in editor + bulk import
 * Storage: window.DB (Supabase if configured, localStorage otherwise)
 */

// Sample skills removed — empty library starts empty.
// Use the bulk-import button (📥) or scripts/import-skills.mjs to populate.

const state = {
    skills: [],
    currentId: null,
    searchQuery: '',
    activeCategory: null, // null = All
    saveTimer: null,
    searchTimer: null,
    visibleBookCount: 36,   // lazy-render batch size (smaller = faster TTI)
    sidebarLimit: 150,      // cap nav rendering
    // Command Center
    view: 'library',        // 'library' | 'command'
    workflows: [],
    activeWorkflowId: null,
};

const BOOK_BATCH = 60;
let _loadMoreObserver = null;

// ==========================================
// Init
// ==========================================
async function init() {
    bindEvents();
    enableDragScroll();
    updateDbModeIndicator();
    loadWorkflows();
    bindCommandCenter();
    bindImportExport();
    // Browser back/forward → swap views
    window.addEventListener('popstate', () => syncViewToUrl());
    await loadSkills();
    render();
    subscribeToRealtime();
    // Restore view from URL on load (e.g., direct visit to /command)
    syncViewToUrl();
}

let _realtimeReloadTimer = null;
function subscribeToRealtime() {
    if (!window.DB.subscribe) return;
    window.DB.subscribe(() => {
        // Debounce — many writes may land in quick succession
        clearTimeout(_realtimeReloadTimer);
        _realtimeReloadTimer = setTimeout(async () => {
            try {
                const data = await window.DB.list();
                state.skills = data || [];
                render();
            } catch (e) { console.warn('Realtime refresh failed:', e); }
        }, 500);
    });
}

async function loadSkills() {
    try {
        const data = await window.DB.list();
        state.skills = data || [];
    } catch (err) {
        console.error('Load failed:', err);
        toast('Load failed: ' + err.message);
        state.skills = [];
    }
}

function updateDbModeIndicator() {
    const el = document.getElementById('dbMode');
    if (!el) return;
    el.textContent = '● Synced';
    el.classList.add('cloud');
}

// ==========================================
// Render
// ==========================================
function render() {
    renderCategoryChips();
    renderSidebar();
    renderCarousel();
    document.getElementById('skillCount').textContent =
        `${state.skills.length} skill${state.skills.length === 1 ? '' : 's'}`;
}

function getFilteredSkills() {
    const q = state.searchQuery.trim().toLowerCase();
    return state.skills.filter(s => {
        if (state.activeCategory && s.category !== state.activeCategory) return false;
        if (!q) return true;
        return s.name.toLowerCase().includes(q) ||
            (s.category || '').toLowerCase().includes(q) ||
            (s.tags || []).some(t => t.toLowerCase().includes(q)) ||
            (s.body || '').toLowerCase().includes(q);
    });
}

function getCategories() {
    const set = new Set();
    state.skills.forEach(s => { if (s.category) set.add(s.category); });
    return Array.from(set).sort();
}

function categoryColor(category) {
    if (!category) return 0;
    let h = 0;
    for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) | 0;
    return Math.abs(h) % 8;
}

function dotColor(idx) {
    const cols = ['#7c5cff','#ff5c7c','#4ade80','#fbbf24','#38bdf8','#f472b6','#a78bfa','#2dd4bf'];
    return cols[idx];
}

function renderCategoryChips() {
    const wrap = document.getElementById('categoryChips');
    const cats = getCategories();
    const chips = [
        `<button class="chip ${state.activeCategory === null ? 'active' : ''}" data-cat="">All</button>`,
        ...cats.map(c => `<button class="chip ${state.activeCategory === c ? 'active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`)
    ];
    wrap.innerHTML = chips.join('');
    wrap.querySelectorAll('.chip').forEach(el => {
        el.addEventListener('click', () => {
            const cat = el.dataset.cat || null;
            state.activeCategory = cat;
            resetVisibleCount();
            render();
        });
    });
}

function renderSidebar() {
    const nav = document.getElementById('skillNav');
    const filtered = getFilteredSkills();
    const cap = state.sidebarLimit;
    const shown = filtered.slice(0, cap);
    const overflow = Math.max(0, filtered.length - cap);

    nav.innerHTML = shown.map(s => `
        <div class="nav-item ${s.id === state.currentId ? 'active' : ''}" data-id="${s.id}">
            <span class="nav-dot" style="background: ${dotColor(categoryColor(s.category))};"></span>
            <span class="nav-name">${escapeHtml(s.name)}</span>
        </div>
    `).join('') + (overflow > 0
        ? `<div class="nav-overflow">+ ${overflow} more — refine search to see them</div>`
        : '');

    nav.querySelectorAll('.nav-item').forEach(el => {
        el.addEventListener('click', () => openSkill(el.dataset.id));
    });
    // Re-attach drag handlers for Command view
    attachSkillDragHandlers();
}

function renderCarousel() {
    const track = document.getElementById('carouselTrack');
    const empty = document.getElementById('emptyState');
    const filtered = getFilteredSkills();
    const visEl = document.getElementById('visibleCount');
    const titleEl = document.getElementById('categoryTitle');

    visEl.textContent = filtered.length.toLocaleString();
    titleEl.textContent = state.activeCategory || 'All Skills';

    if (filtered.length === 0) {
        track.innerHTML = '';
        empty.hidden = false;
        return;
    }
    empty.hidden = true;

    const visible = filtered.slice(0, state.visibleBookCount);
    const hasMore = filtered.length > visible.length;

    track.innerHTML = visible.map((s, i) => bookHTML(s, i)).join('') +
        (hasMore ? '<div id="loadMoreSentinel" class="load-sentinel" aria-hidden="true"></div>' : '');

    attachBookHandlers(track);
    if (hasMore) attachLoadMoreObserver(filtered.length);
}

function bookHTML(s, i) {
    const color = categoryColor(s.category);
    const num = String(i + 1).padStart(2, '0');
    const bullets = (s.summary && s.summary.length)
        ? s.summary.slice(0, 3)
        : [];
    const bulletsHTML = bullets.length
        ? `<ul class="book-bullets">${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
        : '<span class="book-foot-text">a study</span>';
    return `
        <article class="book ${s.id === state.currentId ? 'active' : ''}" data-id="${s.id}" data-color="${color}" tabindex="0" role="button" aria-label="Open ${escapeHtml(s.name)}">
            <div class="book-cover">
                <div class="book-spine"></div>
                <div class="book-actions">
                    <button class="book-action" data-copy="body" data-id="${s.id}" title="Copy full skill (markdown + frontmatter)" aria-label="Copy skill body">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                    <button class="book-action" data-copy="url" data-id="${s.id}" title="Copy auto-apply URL for Claude Code" aria-label="Copy skill URL">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    </button>
                </div>
                <div class="book-content">
                    <div class="book-meta">
                        <span class="book-num">№ ${num}</span>
                        <span class="book-cat">${escapeHtml(s.category || 'General')}</span>
                    </div>
                    <h3 class="book-name">${escapeHtml(s.name)}</h3>
                    <div class="book-rule"></div>
                    <div class="book-foot">
                        ${bulletsHTML}
                    </div>
                </div>
            </div>
        </article>
    `;
}

function attachBookHandlers(track) {
    track.querySelectorAll('.book').forEach(el => {
        if (el._bound) return;
        el._bound = true;
        el.addEventListener('click', () => openSkill(el.dataset.id));
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openSkill(el.dataset.id);
            }
        });
    });
}

function attachLoadMoreObserver(totalCount) {
    if (_loadMoreObserver) _loadMoreObserver.disconnect();
    const sentinel = document.getElementById('loadMoreSentinel');
    if (!sentinel) return;
    const root = document.getElementById('carouselTrack');
    _loadMoreObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && state.visibleBookCount < totalCount) {
            state.visibleBookCount = Math.min(totalCount, state.visibleBookCount + BOOK_BATCH);
            appendMoreBooks();
        }
    }, { root, rootMargin: '400px 0px' });
    _loadMoreObserver.observe(sentinel);
}

function appendMoreBooks() {
    const track = document.getElementById('carouselTrack');
    const filtered = getFilteredSkills();
    const currentCount = track.querySelectorAll('.book').length;
    const next = filtered.slice(currentCount, state.visibleBookCount);
    const sentinel = document.getElementById('loadMoreSentinel');
    const html = next.map((s, i) => bookHTML(s, currentCount + i)).join('');
    if (sentinel) {
        sentinel.insertAdjacentHTML('beforebegin', html);
    } else {
        track.insertAdjacentHTML('beforeend', html);
    }
    attachBookHandlers(track);
    if (state.visibleBookCount >= filtered.length && sentinel) {
        sentinel.remove();
        if (_loadMoreObserver) _loadMoreObserver.disconnect();
    }
}

// Reset pagination on search/category change
function resetVisibleCount() {
    state.visibleBookCount = BOOK_BATCH;
}

function snippet(text, n) {
    if (!text) return '';
    text = text.trim().replace(/\s+/g, ' ');
    return text.length > n ? text.slice(0, n - 1) + '…' : text;
}

// ==========================================
// Editor
// ==========================================
function openSkill(id) {
    const skill = state.skills.find(s => s.id === id);
    if (!skill) return;
    state.currentId = id;
    document.getElementById('editorTitle').value = skill.name;
    document.getElementById('editorCategory').value = skill.category || '';
    document.getElementById('editorTags').value = (skill.tags || []).join(', ');
    document.getElementById('editorSummary').value = (skill.summary || []).join('\n');
    document.getElementById('editorBody').value = skill.body || '';
    updateCharCount();
    setSaveStatus('saved');
    document.getElementById('app').classList.add('editor-open');
    document.getElementById('editor').setAttribute('aria-hidden', 'false');
    render();
    setTimeout(() => {
        const book = document.querySelector(`.book[data-id="${id}"]`);
        if (book) book.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, 80);
}

function closeEditor() {
    document.getElementById('app').classList.remove('editor-open');
    document.getElementById('editor').setAttribute('aria-hidden', 'true');
    state.currentId = null;
    render();
}

async function commitEdit() {
    if (!state.currentId) return;
    const skill = state.skills.find(s => s.id === state.currentId);
    if (!skill) return;
    skill.name = document.getElementById('editorTitle').value.trim() || 'Untitled';
    skill.category = document.getElementById('editorCategory').value.trim() || 'General';
    skill.tags = document.getElementById('editorTags').value
        .split(',').map(t => t.trim()).filter(Boolean);
    skill.summary = document.getElementById('editorSummary').value
        .split('\n').map(l => l.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);
    skill.body = document.getElementById('editorBody').value;
    try {
        await window.DB.upsert(skill);
        setSaveStatus('saved');
        render();
    } catch (err) {
        setSaveStatus('saved');
        toast('Save failed: ' + err.message);
    }
}

function debounceSave() {
    setSaveStatus('saving');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => commitEdit(), 400);
}

function setSaveStatus(s) {
    const el = document.getElementById('saveStatus');
    el.classList.remove('saving', 'saved');
    if (s === 'saving') {
        el.textContent = '● Saving…';
        el.classList.add('saving');
    } else {
        el.textContent = '● Saved';
        el.classList.add('saved');
    }
}

function updateCharCount() {
    const v = document.getElementById('editorBody').value;
    const chars = v.length;
    const words = v.trim() ? v.trim().split(/\s+/).length : 0;
    document.getElementById('charCount').textContent = `${chars} chars · ${words} words`;
}

async function addSkill() {
    const id = 's' + Date.now();
    const skill = {
        id,
        name: 'New Skill',
        category: state.activeCategory || 'General',
        tags: [],
        body: ''
    };
    state.skills.unshift(skill);
    try { await window.DB.upsert(skill); } catch (e) { toast('Save failed: ' + e.message); }
    render();
    openSkill(id);
    setTimeout(() => {
        const t = document.getElementById('editorTitle');
        t.focus(); t.select();
    }, 220);
    toast('New skill added');
}

async function duplicateCurrent() {
    if (!state.currentId) return;
    const orig = state.skills.find(s => s.id === state.currentId);
    if (!orig) return;
    const copy = { ...orig, id: 's' + Date.now(), name: orig.name + ' (copy)' };
    state.skills.unshift(copy);
    try { await window.DB.upsert(copy); } catch (e) { toast('Save failed: ' + e.message); }
    openSkill(copy.id);
    toast('Duplicated');
}

async function deleteCurrent() {
    if (!state.currentId) return;
    const skill = state.skills.find(s => s.id === state.currentId);
    if (!skill) return;
    if (!confirm(`Delete "${skill.name}"?`)) return;
    const id = state.currentId;
    state.skills = state.skills.filter(s => s.id !== id);
    try { await window.DB.remove(id); } catch (e) { toast('Delete failed: ' + e.message); }
    closeEditor();
    toast('Skill deleted');
}

// ==========================================
// Bulk Import
// ==========================================
function openBulkModal() {
    document.getElementById('bulkModal').hidden = false;
    setTimeout(() => {
        const active = document.querySelector('.tab-pane.active textarea');
        if (active) active.focus();
    }, 50);
}

function closeBulkModal() {
    document.getElementById('bulkModal').hidden = true;
    document.getElementById('bulkPaste').value = '';
    document.getElementById('bulkJson').value = '';
    document.getElementById('bulkFile').value = '';
    document.getElementById('fileChosen').textContent = '';
}

function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === name));
    setTimeout(() => {
        const ta = document.querySelector('.tab-pane.active textarea');
        if (ta) ta.focus();
    }, 50);
}

function parsePaste(text) {
    return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
        const parts = line.split('|').map(p => p.trim());
        return {
            id: 's' + Date.now() + Math.random().toString(36).slice(2, 6),
            name: parts[0] || 'Untitled',
            category: parts[1] || 'General',
            body: parts[2] || '',
            tags: []
        };
    });
}

function parseJson(text) {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('JSON must be an array');
    return data.map((s, i) => ({
        id: s.id || ('s' + Date.now() + '_' + i),
        name: s.name || s.title || 'Untitled',
        category: s.category || 'General',
        body: s.body || s.content || s.text || '',
        tags: Array.isArray(s.tags) ? s.tags : []
    }));
}

async function performBulkAdd() {
    const activeTab = document.querySelector('.tab.active').dataset.tab;
    let added = [];
    try {
        if (activeTab === 'paste') {
            const text = document.getElementById('bulkPaste').value;
            if (!text.trim()) { toast('Paste some skills first'); return; }
            added = parsePaste(text);
        } else if (activeTab === 'json') {
            const text = document.getElementById('bulkJson').value;
            if (!text.trim()) { toast('Paste JSON first'); return; }
            added = parseJson(text);
        } else if (activeTab === 'file') {
            const fileText = document.getElementById('fileChosen').dataset.content;
            if (!fileText) { toast('Choose a file first'); return; }
            try {
                added = parseJson(fileText);
            } catch {
                added = parsePaste(fileText);
            }
        }
    } catch (err) {
        toast('Parse error: ' + err.message);
        return;
    }
    if (added.length === 0) { toast('Nothing to add'); return; }
    try { await window.DB.insertMany(added); } catch (e) { toast('Save failed: ' + e.message); return; }
    state.skills = [...added, ...state.skills];
    render();
    closeBulkModal();
    toast(`Added ${added.length} skill${added.length === 1 ? '' : 's'}`);
}

function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const target = document.getElementById('fileChosen');
        target.textContent = `✓ ${file.name} (${file.size} bytes) — ready`;
        target.dataset.content = e.target.result;
    };
    reader.readAsText(file);
}

function exportAll() {
    const data = JSON.stringify(state.skills, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `skills-${new Date().toISOString().slice(0, 10)}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    toast(`Exported ${state.skills.length} skills`);
}

// ==========================================
// Carousel scroll + drag
// ==========================================
function scrollCarousel(dir) {
    const track = document.getElementById('carouselTrack');
    const book = track.querySelector('.book');
    const step = book ? (book.offsetWidth + 28) : 250;
    track.scrollBy({ left: dir * step, behavior: 'smooth' });
}

function enableDragScroll() {
    const track = document.getElementById('carouselTrack');
    let isDown = false, startX = 0, scrollLeft = 0, moved = false;

    track.addEventListener('mousedown', (e) => {
        isDown = true; moved = false;
        track.classList.add('dragging');
        startX = e.pageX;
        scrollLeft = track.scrollLeft;
    });
    ['mouseleave', 'mouseup'].forEach(ev => {
        track.addEventListener(ev, () => {
            isDown = false;
            track.classList.remove('dragging');
            if (moved) track.classList.add('was-dragging');
        });
    });
    track.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const walk = e.pageX - startX;
        if (Math.abs(walk) > 4) moved = true;
        track.scrollLeft = scrollLeft - walk;
    });
}

// ==========================================
// Bind events
// ==========================================
function bindEvents() {
    document.getElementById('addSkillBtn').addEventListener('click', addSkill);
    document.getElementById('emptyAddBtn').addEventListener('click', addSkill);
    document.getElementById('bulkAddBtn').addEventListener('click', openBulkModal);
    document.getElementById('exportBtn').addEventListener('click', exportAll);
    document.getElementById('searchInput').addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(() => {
            resetVisibleCount();
            render();
        }, 180);
    });
    document.getElementById('prevBtn').addEventListener('click', () => scrollCarousel(-1));
    document.getElementById('nextBtn').addEventListener('click', () => scrollCarousel(1));
    document.getElementById('closeBtn').addEventListener('click', closeEditor);
    document.getElementById('saveBtn').addEventListener('click', () => { commitEdit(); toast('Saved'); });
    document.getElementById('duplicateBtn').addEventListener('click', duplicateCurrent);
    document.getElementById('deleteBtn').addEventListener('click', deleteCurrent);
    document.getElementById('editorTitle').addEventListener('input', debounceSave);
    document.getElementById('editorCategory').addEventListener('input', debounceSave);
    document.getElementById('editorTags').addEventListener('input', debounceSave);
    document.getElementById('editorSummary').addEventListener('input', debounceSave);
    document.getElementById('editorBody').addEventListener('input', () => { updateCharCount(); debounceSave(); });

    // Bulk modal
    document.getElementById('bulkClose').addEventListener('click', closeBulkModal);
    document.getElementById('bulkCancel').addEventListener('click', closeBulkModal);
    document.getElementById('bulkAdd').addEventListener('click', performBulkAdd);
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
    document.getElementById('bulkFile').addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (f) handleFile(f);
    });
    document.getElementById('bulkModal').addEventListener('click', (e) => {
        if (e.target.id === 'bulkModal') closeBulkModal();
    });

    // Mobile menu
    document.getElementById('mobileMenu').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!document.getElementById('bulkModal').hidden) closeBulkModal();
            else if (state.currentId) closeEditor();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); commitEdit(); toast('Saved'); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('searchInput').focus();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            addSkill();
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
            e.preventDefault();
            openBulkModal();
        }
    });
}

// ==========================================
// IMPORT / EXPORT — .skill / .md / .phd / .markdown
// ==========================================
function bindImportExport() {
    const importBtn = document.getElementById('quickImportBtn');
    const exportBtn = document.getElementById('quickExportBtn');
    const fileInput = document.getElementById('quickImportInput');
    if (!importBtn || !exportBtn || !fileInput) return;

    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        await handleFileImport(files);
        fileInput.value = ''; // reset
    });

    exportBtn.addEventListener('click', exportAllSkills);
}

async function handleFileImport(files) {
    const imported = [];
    let skipped = 0;
    for (const f of files) {
        try {
            const text = await f.text();
            const skill = parseSkillFile(f.name, text);
            if (skill) imported.push(skill);
            else skipped++;
        } catch (e) {
            console.error('Import failed for', f.name, e);
            skipped++;
        }
    }
    if (imported.length === 0) {
        toast(`No valid skills found in ${files.length} file(s)`);
        return;
    }
    try {
        await window.DB.insertMany(imported);
        state.skills = [...imported, ...state.skills];
        render();
        toast(`Imported ${imported.length} skill${imported.length === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped` : ''}`);
    } catch (err) {
        toast('Cloud save failed: ' + err.message);
    }
}

/** Parse a single file into a skill object. Supports .skill / .md / .markdown / .phd / .txt */
function parseSkillFile(filename, content) {
    // Strip only NULL bytes and other Postgres-incompatible control chars.
    // Tabs (\x09), newlines (\x0A), carriage returns (\x0D) and the regular
    // space (\x20) are PRESERVED — earlier versions accidentally stripped spaces.
    const cleaned = String(content || '')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    // YAML frontmatter (used in our SKILL.md format)
    let meta = {};
    let body = cleaned;
    const fm = cleaned.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (fm) {
        meta = parseSimpleYaml(fm[1]);
        body = fm[2];
    }

    // Derive name
    let name = meta.name || meta.title;
    if (!name) {
        // First H1
        const h1 = body.match(/^#\s+(.+)$/m);
        if (h1) name = h1[1].trim();
    }
    if (!name) {
        // Filename without extension, humanized
        name = filename
            .replace(/\.(skill|md|markdown|phd|txt)$/i, '')
            .replace(/[-_]+/g, ' ')
            .trim();
        name = name.charAt(0).toUpperCase() + name.slice(1);
    }
    if (!name) return null;

    // Derive id
    const id = (meta.id ||
        filename
            .replace(/\.(skill|md|markdown|phd|txt)$/i, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
    ) + '-' + Math.random().toString(36).slice(2, 6);

    const tags = Array.isArray(meta.tags)
        ? meta.tags
        : (typeof meta.tags === 'string' ? meta.tags.split(',').map(t => t.trim()).filter(Boolean) : []);

    return {
        id,
        name: humanize(name),
        category: meta.category || 'Imported',
        tags,
        summary: [],
        body: body.trim(),
    };
}

function humanize(s) {
    return String(s).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseSimpleYaml(yaml) {
    const out = {};
    let key = null;
    for (const raw of String(yaml).split(/\r?\n/)) {
        if (!raw.trim()) continue;
        const m = raw.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
        if (m) {
            key = m[1];
            let val = m[2].trim();
            if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
            if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
            if (val === '') {
                out[key] = [];
            } else {
                out[key] = val;
            }
        } else if (key && raw.trim().startsWith('- ')) {
            if (!Array.isArray(out[key])) out[key] = [];
            let v = raw.trim().slice(2).trim();
            if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
            out[key].push(v);
        }
    }
    return out;
}

async function exportAllSkills() {
    if (!state.skills.length) { toast('No skills to export'); return; }
    if (state.skills.length === 1) {
        const s = state.skills[0];
        downloadFile(`${s.id}.skill`, skillToMarkdown(s));
        return;
    }
    // Many skills: export as a single combined .md file
    const combined = state.skills.map(s => skillToMarkdown(s)).join('\n\n---\n\n');
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(`skills-export-${date}.md`, combined);
    toast(`Exported ${state.skills.length} skills`);
}

function skillToMarkdown(s) {
    const fm = ['---'];
    fm.push(`id: ${s.id}`);
    fm.push(`name: ${s.name}`);
    fm.push(`category: ${s.category || 'General'}`);
    if (s.tags && s.tags.length) {
        fm.push('tags:');
        s.tags.forEach(t => fm.push(`  - ${t}`));
    }
    if (s.summary && s.summary.length) {
        fm.push('summary:');
        s.summary.forEach(t => fm.push(`  - "${t.replace(/"/g, '\\"')}"`));
    }
    fm.push('---');
    fm.push('');
    fm.push(s.body || '');
    return fm.join('\n');
}

function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ==========================================
// COMMAND CENTER — Workflows, terminal logs, Claude execution
// ==========================================
const CC_PASSWORD = 'Work';
const WORKFLOWS_KEY = 'skillLibrary.workflows';
const CC_UNLOCK_KEY = 'skillLibrary.ccUnlocked';

function newWorkflow(name = 'Untitled Workflow') {
    return {
        id: 'wf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name,
        nodes: [],
    };
}

function newNode() {
    return {
        id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        skillId: null,
        input: '',
        log: [],
        output: '',
        status: 'idle', // idle | running | done | error
    };
}

function loadWorkflows() {
    try {
        const raw = localStorage.getItem(WORKFLOWS_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            state.workflows = data.workflows || [];
            state.activeWorkflowId = data.activeId || null;
        } else {
            state.workflows = [];
            state.activeWorkflowId = null;
        }
    } catch {
        state.workflows = [];
        state.activeWorkflowId = null;
    }
    if (state.workflows.length === 0) {
        const wf = newWorkflow('My First Workflow');
        wf.nodes.push(newNode());
        state.workflows.push(wf);
        state.activeWorkflowId = wf.id;
        saveWorkflows();
    } else if (!state.activeWorkflowId || !state.workflows.find(w => w.id === state.activeWorkflowId)) {
        state.activeWorkflowId = state.workflows[0].id;
    }
}

function saveWorkflows() {
    localStorage.setItem(WORKFLOWS_KEY, JSON.stringify({
        workflows: state.workflows,
        activeId: state.activeWorkflowId,
    }));
}

function getActiveWorkflow() {
    return state.workflows.find(w => w.id === state.activeWorkflowId);
}

function bindCommandCenter() {
    // View tab toggling
    document.querySelectorAll('.view-seg').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Password gate
    const gateInput = document.getElementById('ccGatePassword');
    const gateErr = document.getElementById('ccGateError');
    document.getElementById('ccGateUnlock').addEventListener('click', tryUnlock);
    document.getElementById('ccGateCancel').addEventListener('click', () => {
        document.getElementById('ccGate').hidden = true;
        switchView('library', { force: true });
    });
    gateInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') tryUnlock();
        if (e.key === 'Escape') { document.getElementById('ccGate').hidden = true; switchView('library', { force: true }); }
    });

    function tryUnlock() {
        const v = gateInput.value;
        if (v === CC_PASSWORD) {
            sessionStorage.setItem(CC_UNLOCK_KEY, '1');
            document.getElementById('ccGate').hidden = true;
            gateErr.hidden = true;
            gateInput.value = '';
            // Now actually flip into command view (which re-checks unlock and renders)
            switchView('command');
        } else {
            gateErr.hidden = false;
            gateInput.value = '';
            gateInput.focus();
        }
    }

    // Workflow CRUD
    document.getElementById('newWorkflowBtn').addEventListener('click', () => {
        const name = prompt('Workflow name:', `Workflow ${state.workflows.length + 1}`);
        if (!name) return;
        const wf = newWorkflow(name.trim());
        wf.nodes.push(newNode());
        state.workflows.push(wf);
        state.activeWorkflowId = wf.id;
        saveWorkflows();
        renderCommandCenter();
    });

    // Add step / Empty add / Clear / Run / Copy
    document.getElementById('ccAddStep').addEventListener('click', addStepToActive);
    document.getElementById('ccEmptyAdd').addEventListener('click', addStepToActive);
    document.getElementById('ccClearBtn').addEventListener('click', clearActiveWorkflow);
    document.getElementById('ccCopyChainBtn').addEventListener('click', copyChainAsMarkdown);
    document.getElementById('ccRunBtn').addEventListener('click', runAllNodes);
}

function switchView(view, opts = {}) {
    const { force = false, fromHistory = false } = opts;
    if (view === 'command' && !force) {
        const unlocked = sessionStorage.getItem(CC_UNLOCK_KEY) === '1';
        if (!unlocked) {
            document.getElementById('ccGate').hidden = false;
            setTimeout(() => document.getElementById('ccGatePassword').focus(), 50);
            return;
        }
    }

    state.view = view;
    document.body.dataset.view = view;
    document.querySelectorAll('.view-seg').forEach(b => {
        b.classList.toggle('active', b.dataset.view === view);
        b.setAttribute('aria-selected', b.dataset.view === view ? 'true' : 'false');
    });

    // Hide / show library bits and CC bits
    const isCmd = view === 'command';
    document.querySelector('.carousel-area').hidden = isCmd;
    document.getElementById('commandCenter').hidden = !isCmd;
    document.getElementById('workflowsSection').hidden = !isCmd;
    document.getElementById('ccSkillsSection').hidden = !isCmd;

    // Hide Library-only sidebar bits in Command view
    document.querySelector('.search-wrap').hidden = isCmd;
    document.getElementById('categoryChips').hidden = isCmd;
    // Brand title swap
    const brand = document.getElementById('brandTitle');
    if (brand) brand.textContent = isCmd ? 'Command' : 'Library';

    // URL routing — push history state so Command Center has its own URL
    if (!fromHistory) {
        const targetPath = isCmd ? '/command' : '/';
        if (location.pathname !== targetPath) {
            history.pushState({ view }, '', targetPath);
        }
    }

    if (isCmd) renderCommandCenter();
    else render();
}

function syncViewToUrl() {
    const path = location.pathname;
    const isCmd = path === '/command' || path.endsWith('/command');
    if (isCmd && sessionStorage.getItem(CC_UNLOCK_KEY) !== '1') {
        // Need password before showing command — but render gate
        document.getElementById('ccGate').hidden = false;
        setTimeout(() => document.getElementById('ccGatePassword').focus(), 50);
        return;
    }
    switchView(isCmd ? 'command' : 'library', { force: true, fromHistory: true });
}

function renderCommandCenter() {
    renderWorkflowList();
    renderActiveWorkflow();
}

function renderWorkflowList() {
    const wrap = document.getElementById('workflowList');
    if (!wrap) return;
    if (state.workflows.length === 0) {
        wrap.innerHTML = '<div class="cc-wf-empty">No workflows yet</div>';
        return;
    }
    wrap.innerHTML = state.workflows.map(wf => `
        <div class="cc-wf-item ${wf.id === state.activeWorkflowId ? 'active' : ''}" data-id="${wf.id}">
            <span class="cc-wf-item-name">${escapeHtml(wf.name)}</span>
            <span class="cc-wf-item-count">${wf.nodes.length}</span>
        </div>
    `).join('');
    wrap.querySelectorAll('.cc-wf-item').forEach(el => {
        el.addEventListener('click', () => {
            state.activeWorkflowId = el.dataset.id;
            saveWorkflows();
            renderCommandCenter();
        });
    });
}

function renderActiveWorkflow() {
    const workflow = document.getElementById('workflow');
    const empty = document.getElementById('ccEmpty');
    const stepCount = document.getElementById('ccStepCount');
    const wf = getActiveWorkflow();

    if (!wf) {
        workflow.innerHTML = '';
        empty.hidden = false;
        stepCount.textContent = '0 steps';
        return;
    }

    stepCount.textContent = `${wf.nodes.length} step${wf.nodes.length === 1 ? '' : 's'}`;
    empty.hidden = wf.nodes.length > 0;

    // Inject active workflow header (rename + delete)
    let headerHtml = `
        <div class="cc-active-wf">
            <input type="text" class="cc-active-wf-name" id="activeWfName" value="${escapeHtml(wf.name)}">
            <button class="cc-wf-delete" id="deleteWfBtn" title="Delete this workflow">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            </button>
        </div>
    `;

    const nodesHtml = wf.nodes.map((node, idx) => renderNodeHtml(node, idx, wf.nodes.length)).join('');
    workflow.innerHTML = headerHtml + nodesHtml;

    // Bind
    const nameInput = document.getElementById('activeWfName');
    nameInput.addEventListener('input', (e) => {
        wf.name = e.target.value || 'Untitled';
        saveWorkflows();
        renderWorkflowList();
    });
    document.getElementById('deleteWfBtn').addEventListener('click', () => {
        if (!confirm(`Delete workflow "${wf.name}"?`)) return;
        state.workflows = state.workflows.filter(w => w.id !== wf.id);
        state.activeWorkflowId = state.workflows[0]?.id || null;
        if (!state.activeWorkflowId) {
            const newWf = newWorkflow('My First Workflow');
            newWf.nodes.push(newNode());
            state.workflows.push(newWf);
            state.activeWorkflowId = newWf.id;
        }
        saveWorkflows();
        renderCommandCenter();
    });

    bindNodeEvents();
}

function renderNodeHtml(node, idx, total) {
    const skill = node.skillId ? state.skills.find(s => s.id === node.skillId) : null;
    const skillSlot = skill
        ? `<div class="cc-skill-slot filled" data-node-id="${node.id}">
               <div class="cc-skill-icon">${escapeHtml(skill.name.charAt(0).toUpperCase())}</div>
               <div class="cc-skill-name">${escapeHtml(skill.name)}</div>
               <button class="cc-skill-clear" data-action="clear-skill" data-node-id="${node.id}" title="Remove skill">×</button>
           </div>`
        : `<div class="cc-skill-slot empty" data-node-id="${node.id}">
               Drag a skill here from the sidebar
           </div>`;

    const isPiped = idx > 0 && node.input && node.input.length > 0;
    const logHtml = node.log.length === 0
        ? '<div class="cc-log-empty">No output yet — click Run.</div>'
        : node.log.map(l => `
            <div class="cc-log-line ${l.kind}">
                <span class="ts">[${l.ts}]</span>
                <span class="msg">${escapeHtml(l.msg)}</span>
            </div>`).join('');

    const isLast = idx === total - 1;
    const connectorHtml = !isLast ? '<div class="cc-connector"></div>' : '';

    return `
        <article class="cc-node" data-node-id="${node.id}" data-status="${node.status}">
            <div class="cc-node-head">
                <span class="cc-step-num">№ ${String(idx + 1).padStart(2, '0')}</span>
                ${skillSlot}
                <div class="cc-node-actions">
                    <button class="cc-node-action danger" data-action="delete-node" data-node-id="${node.id}" title="Remove step">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                    </button>
                </div>
            </div>
            <div class="cc-node-body">
                <div class="cc-pane">
                    <div class="cc-pane-label">
                        Input
                        ${isPiped ? '<span class="cc-piped">↳ piped</span>' : ''}
                    </div>
                    <textarea class="cc-input" data-action="input-change" data-node-id="${node.id}" placeholder="$ paste prompt or piped input...">${escapeHtml(node.input)}</textarea>
                </div>
                <div class="cc-pane">
                    <div class="cc-pane-label">
                        Output / Logs
                        <span style="margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:0.62rem;color:var(--text-mute);font-weight:600;">${node.status.toUpperCase()}</span>
                    </div>
                    <div class="cc-log" data-log-id="${node.id}">${logHtml}</div>
                </div>
            </div>
            <div class="cc-node-buttons">
                <button class="cc-btn cc-btn-run" data-action="run-node" data-node-id="${node.id}" ${!skill ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>
                    Run with Claude
                </button>
                <div class="cc-btn-spacer"></div>
                ${!isLast ? `<button class="cc-btn cc-btn-pipe" data-action="pipe-next" data-node-id="${node.id}" ${!node.output ? 'disabled' : ''}>
                    Pipe → Next
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>` : ''}
            </div>
        </article>
        ${connectorHtml}
    `;
}

function bindNodeEvents() {
    document.querySelectorAll('[data-action]').forEach(el => {
        const action = el.dataset.action;
        const nodeId = el.dataset.nodeId;
        if (!nodeId) return;
        if (action === 'input-change') {
            el.addEventListener('input', (e) => {
                const node = findNode(nodeId);
                if (node) { node.input = e.target.value; saveWorkflows(); }
            });
        } else if (action === 'clear-skill') {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const node = findNode(nodeId);
                if (node) { node.skillId = null; saveWorkflows(); renderActiveWorkflow(); }
            });
        } else if (action === 'delete-node') {
            el.addEventListener('click', () => deleteNode(nodeId));
        } else if (action === 'run-node') {
            el.addEventListener('click', () => runNode(nodeId));
        } else if (action === 'pipe-next') {
            el.addEventListener('click', () => pipeToNext(nodeId));
        }
    });

    // Drag/drop on skill slots
    document.querySelectorAll('.cc-skill-slot').forEach(slot => {
        slot.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.currentTarget.closest('.cc-node').classList.add('drag-over');
        });
        slot.addEventListener('dragleave', (e) => {
            e.currentTarget.closest('.cc-node').classList.remove('drag-over');
        });
        slot.addEventListener('drop', (e) => {
            e.preventDefault();
            e.currentTarget.closest('.cc-node').classList.remove('drag-over');
            const skillId = e.dataTransfer.getData('text/skill-id');
            if (!skillId) return;
            const nodeId = slot.dataset.nodeId;
            const node = findNode(nodeId);
            if (node) { node.skillId = skillId; saveWorkflows(); renderActiveWorkflow(); }
        });
    });
}

function findNode(nodeId) {
    const wf = getActiveWorkflow();
    return wf ? wf.nodes.find(n => n.id === nodeId) : null;
}

function findNodeIndex(nodeId) {
    const wf = getActiveWorkflow();
    return wf ? wf.nodes.findIndex(n => n.id === nodeId) : -1;
}

function addStepToActive() {
    const wf = getActiveWorkflow();
    if (!wf) return;
    wf.nodes.push(newNode());
    saveWorkflows();
    renderCommandCenter();
}

function deleteNode(nodeId) {
    const wf = getActiveWorkflow();
    if (!wf) return;
    wf.nodes = wf.nodes.filter(n => n.id !== nodeId);
    saveWorkflows();
    renderCommandCenter();
}

function clearActiveWorkflow() {
    const wf = getActiveWorkflow();
    if (!wf || !confirm('Clear all steps in this workflow?')) return;
    wf.nodes = [newNode()];
    saveWorkflows();
    renderCommandCenter();
}

function appendLog(node, kind, msg) {
    const ts = new Date().toLocaleTimeString('en-GB');
    node.log.push({ ts, kind, msg });
    const logEl = document.querySelector(`[data-log-id="${node.id}"]`);
    if (logEl) {
        if (logEl.querySelector('.cc-log-empty')) logEl.innerHTML = '';
        const line = document.createElement('div');
        line.className = `cc-log-line ${kind}`;
        line.innerHTML = `<span class="ts">[${escapeHtml(ts)}]</span><span class="msg">${escapeHtml(msg)}</span>`;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
    }
}

function setNodeStatus(node, status) {
    node.status = status;
    const el = document.querySelector(`.cc-node[data-node-id="${node.id}"]`);
    if (el) el.dataset.status = status;
    // Header status pill
    const wf = getActiveWorkflow();
    if (!wf) return;
    const anyRunning = wf.nodes.some(n => n.status === 'running');
    const anyError   = wf.nodes.some(n => n.status === 'error');
    const allDone    = wf.nodes.every(n => n.status === 'done' || (!n.skillId));
    const pill = document.getElementById('ccStatus');
    let s = 'idle';
    if (anyRunning) s = 'running';
    else if (anyError) s = 'error';
    else if (allDone && wf.nodes.some(n => n.status === 'done')) s = 'done';
    pill.dataset.status = s;
    pill.querySelector('.cc-status-text').textContent = { idle: 'Idle', running: 'Running', done: 'Done', error: 'Error' }[s];
}

async function runNode(nodeId) {
    const node = findNode(nodeId);
    if (!node) return;
    if (!node.skillId) { toast('Drop a skill into this step first'); return; }
    const skill = state.skills.find(s => s.id === node.skillId);
    if (!skill) { toast('Skill not found in library'); return; }

    node.log = [];
    node.output = '';
    setNodeStatus(node, 'running');
    appendLog(node, 'brass', `▶ Running: ${skill.name}`);
    appendLog(node, 'echo', `Input: ${node.input ? node.input.slice(0, 80) + (node.input.length > 80 ? '…' : '') : '(empty)'}`);

    // Try real Claude execution via /api/run; fallback to skill-URL hint
    const skillUrl = `${location.origin}/skill/${encodeURIComponent(skill.id)}`;
    try {
        const res = await fetch('/api/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skillId: skill.id, input: node.input || '' })
        });
        if (!res.ok) {
            const errBody = await res.text();
            if (res.status === 501 || res.status === 503 || res.status === 500) {
                appendLog(node, 'warn', 'Claude execution not configured on server.');
                appendLog(node, 'info', `Open this URL in Claude Code to run manually:`);
                appendLog(node, 'brass', skillUrl);
                appendLog(node, 'info', `Then paste the result back into this output to pipe to next.`);
                setNodeStatus(node, 'idle');
                saveWorkflows();
                return;
            }
            throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`);
        }
        // Stream the response
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = '';
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            acc += chunk;
            // Try to split on newlines
            const lines = chunk.split('\n').filter(l => l.trim());
            lines.forEach(l => appendLog(node, 'info', l));
        }
        node.output = acc.trim();
        appendLog(node, 'ok', `✓ Done · ${acc.length} chars`);
        setNodeStatus(node, 'done');
    } catch (e) {
        appendLog(node, 'err', `✗ ${e.message}`);
        appendLog(node, 'warn', `Fallback: open in Claude Code → ${skillUrl}`);
        setNodeStatus(node, 'error');
    }
    saveWorkflows();
    // Refresh pipe button enabled state
    const wf = getActiveWorkflow();
    const idx = wf.nodes.findIndex(n => n.id === nodeId);
    const pipeBtn = document.querySelector(`button[data-action="pipe-next"][data-node-id="${nodeId}"]`);
    if (pipeBtn) pipeBtn.disabled = !node.output;
}

function pipeToNext(nodeId) {
    const wf = getActiveWorkflow();
    if (!wf) return;
    const idx = wf.nodes.findIndex(n => n.id === nodeId);
    if (idx === -1 || idx >= wf.nodes.length - 1) return;
    const node = wf.nodes[idx];
    const next = wf.nodes[idx + 1];
    if (!node.output) { toast('No output to pipe yet'); return; }
    next.input = node.output;
    saveWorkflows();
    renderActiveWorkflow();
    toast(`Piped ${node.output.length} chars → step ${idx + 2}`);
    // Scroll to next node
    setTimeout(() => {
        const el = document.querySelector(`.cc-node[data-node-id="${next.id}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}

async function runAllNodes() {
    const wf = getActiveWorkflow();
    if (!wf) return;
    for (let i = 0; i < wf.nodes.length; i++) {
        const node = wf.nodes[i];
        if (!node.skillId) { toast(`Step ${i + 1} has no skill — skipping`); continue; }
        await runNode(node.id);
        // If success, auto-pipe to next
        if (node.status === 'done' && i < wf.nodes.length - 1) {
            pipeToNext(node.id);
        } else if (node.status === 'error') {
            break;
        }
    }
}

function copyChainAsMarkdown() {
    const wf = getActiveWorkflow();
    if (!wf) return;
    const md = [`# ${wf.name}`, '', `${wf.nodes.length} step pipeline.`, ''];
    wf.nodes.forEach((n, i) => {
        const skill = state.skills.find(s => s.id === n.skillId);
        md.push(`## Step ${i + 1}: ${skill ? skill.name : '(no skill)'}`);
        if (skill) md.push(`Skill URL: ${location.origin}/skill/${skill.id}`);
        if (n.input) md.push('', '**Input:**', '```', n.input, '```');
        if (n.output) md.push('', '**Output:**', '```', n.output, '```');
        md.push('');
    });
    navigator.clipboard.writeText(md.join('\n')).then(() => toast('Chain copied as markdown'));
}

// Make sidebar nav-items draggable when in command view
function attachSkillDragHandlers() {
    document.querySelectorAll('.nav-item').forEach(el => {
        if (el._dragBound) return;
        el._dragBound = true;
        el.draggable = true;
        el.addEventListener('dragstart', (e) => {
            if (state.view !== 'command') { e.preventDefault(); return; }
            el.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/skill-id', el.dataset.id);
        });
        el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });
}

// ==========================================
// Helpers
// ==========================================
function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1800);
}

document.addEventListener('DOMContentLoaded', init);
