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
    await loadSkills();
    render();
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
    if (window.DB.isCloudMode()) {
        el.textContent = 'Cloud · Synced';
        el.classList.add('cloud');
    } else {
        el.textContent = 'Local';
        el.classList.remove('cloud');
    }
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

    // Cloud / Supabase modal
    document.getElementById('settingsBtn').addEventListener('click', openCloudModal);
    document.getElementById('cloudClose').addEventListener('click', closeCloudModal);
    document.getElementById('cloudCancel').addEventListener('click', closeCloudModal);
    document.getElementById('cloudTest').addEventListener('click', testCloudConnection);
    document.getElementById('cloudSave').addEventListener('click', saveCloudConfig);
    document.getElementById('cloudPush').addEventListener('click', pushLocalToCloud);
    document.getElementById('cloudDisconnect').addEventListener('click', disconnectCloud);
    document.getElementById('cloudModal').addEventListener('click', (e) => {
        if (e.target.id === 'cloudModal') closeCloudModal();
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
// Cloud / Supabase
// ==========================================
function openCloudModal() {
    const cfg = window.DB.getConfig();
    document.getElementById('supaUrl').value = cfg ? cfg.url : '';
    document.getElementById('supaKey').value = cfg ? cfg.anonKey : '';
    document.getElementById('cloudStatus').innerHTML = window.DB.isCloudMode()
        ? '<span class="status-ok">● Connected</span>'
        : '<span class="status-mute">Not connected</span>';
    document.getElementById('cloudModal').hidden = false;
    setTimeout(() => document.getElementById('supaUrl').focus(), 50);
}

function closeCloudModal() {
    document.getElementById('cloudModal').hidden = true;
}

async function testCloudConnection() {
    const url = document.getElementById('supaUrl').value.trim();
    const anonKey = document.getElementById('supaKey').value.trim();
    setCloudStatus('testing', 'Testing…');
    const result = await window.DB.testConnection({ url, anonKey });
    setCloudStatus(result.ok ? 'ok' : 'err', result.message);
}

async function saveCloudConfig() {
    const url = document.getElementById('supaUrl').value.trim();
    const anonKey = document.getElementById('supaKey').value.trim();
    if (!url || !anonKey) { setCloudStatus('err', 'URL and key required'); return; }
    setCloudStatus('testing', 'Connecting…');
    const result = await window.DB.testConnection({ url, anonKey });
    if (!result.ok) { setCloudStatus('err', result.message); return; }
    window.DB.setConfig({ url, anonKey });
    setCloudStatus('ok', 'Connected — reloading…');
    updateDbModeIndicator();
    await loadSkills();
    render();
    setTimeout(() => closeCloudModal(), 800);
    toast('Cloud sync enabled');
}

async function pushLocalToCloud() {
    const url = document.getElementById('supaUrl').value.trim();
    const anonKey = document.getElementById('supaKey').value.trim();
    if (!url || !anonKey) { setCloudStatus('err', 'Save config first'); return; }
    if (!confirm('This wipes the cloud table and uploads your current local skills. Continue?')) return;
    setCloudStatus('testing', 'Pushing…');
    // Temporarily set config
    const prev = window.DB.getConfig();
    window.DB.setConfig({ url, anonKey });
    try {
        await window.DB.replaceAll(state.skills);
        setCloudStatus('ok', `Pushed ${state.skills.length} skills`);
        updateDbModeIndicator();
        toast('Local pushed to cloud');
    } catch (e) {
        setCloudStatus('err', e.message);
        if (prev) window.DB.setConfig(prev); else window.DB.setConfig(null);
    }
}

async function disconnectCloud() {
    if (!confirm('Disconnect from cloud? Your local cache stays intact.')) return;
    window.DB.setConfig(null);
    updateDbModeIndicator();
    setCloudStatus('mute', 'Disconnected');
    await loadSkills();
    render();
    toast('Disconnected from cloud');
}

function setCloudStatus(kind, msg) {
    const el = document.getElementById('cloudStatus');
    const cls = kind === 'ok' ? 'status-ok' : kind === 'err' ? 'status-err' : kind === 'testing' ? 'status-mute' : 'status-mute';
    el.innerHTML = `<span class="${cls}">${escapeHtml(msg)}</span>`;
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
