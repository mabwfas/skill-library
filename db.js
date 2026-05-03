/**
 * db.js — Storage abstraction
 *
 * Two backends, transparent to the app:
 *   - Supabase  (cloud sync, used when URL + key are configured)
 *   - localStorage (offline fallback, default)
 *
 * Schema (matches supabase-schema.sql):
 *   skills(id text pk, name text, category text, tags text[], body text,
 *          updated_at timestamptz)
 */

const LS_DATA_KEY = 'skillLibrary.v2';
const LS_CONFIG_KEY = 'skillLibrary.supabase';

let _client = null;        // supabase client (or null)
let _config = loadConfig();

function loadConfig() {
    try {
        const raw = localStorage.getItem(LS_CONFIG_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function saveConfig(cfg) {
    if (cfg) localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(LS_CONFIG_KEY);
    _config = cfg;
    _client = null; // force re-init
}

function isCloudMode() {
    return !!(_config && _config.url && _config.anonKey);
}

function getClient() {
    if (!isCloudMode()) return null;
    if (_client) return _client;
    if (typeof window.supabase === 'undefined') {
        console.warn('Supabase SDK not loaded yet');
        return null;
    }
    _client = window.supabase.createClient(_config.url, _config.anonKey, {
        auth: { persistSession: false }
    });
    return _client;
}

// ==========================================
// localStorage backend
// ==========================================
function lsLoad() {
    try {
        const raw = localStorage.getItem(LS_DATA_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}
function lsSave(skills) {
    localStorage.setItem(LS_DATA_KEY, JSON.stringify(skills));
}

// ==========================================
// Public API — all async (await everywhere in app.js)
// ==========================================
const DB = {
    // Setup helpers
    isCloudMode,
    getConfig: () => _config ? { ...(_config) } : null,
    setConfig: saveConfig,

    // Test the connection — returns { ok, message }
    async testConnection(cfg) {
        if (!cfg || !cfg.url || !cfg.anonKey) {
            return { ok: false, message: 'URL and key required' };
        }
        if (typeof window.supabase === 'undefined') {
            return { ok: false, message: 'Supabase SDK not loaded' };
        }
        try {
            const c = window.supabase.createClient(cfg.url, cfg.anonKey, {
                auth: { persistSession: false }
            });
            const { error } = await c.from('skills').select('id', { count: 'exact', head: true });
            if (error) return { ok: false, message: error.message };
            return { ok: true, message: 'Connected!' };
        } catch (e) {
            return { ok: false, message: e.message };
        }
    },

    // Load all skills
    async list() {
        if (!isCloudMode()) {
            return lsLoad();
        }
        const c = getClient();
        const { data, error } = await c.from('skills').select('*').order('updated_at', { ascending: false });
        if (error) {
            console.error('Supabase list error:', error);
            throw error;
        }
        return data.map(rowToSkill);
    },

    // Upsert one skill (insert or update by id)
    async upsert(skill) {
        if (!isCloudMode()) {
            const all = lsLoad() || [];
            const idx = all.findIndex(s => s.id === skill.id);
            if (idx >= 0) all[idx] = skill;
            else all.unshift(skill);
            lsSave(all);
            return skill;
        }
        const c = getClient();
        const row = skillToRow(skill);
        const { data, error } = await c.from('skills').upsert(row).select().single();
        if (error) { console.error('Supabase upsert error:', error); throw error; }
        return rowToSkill(data);
    },

    // Bulk insert (used by import)
    async insertMany(skills) {
        if (!isCloudMode()) {
            const all = lsLoad() || [];
            lsSave([...skills, ...all]);
            return skills;
        }
        const c = getClient();
        const rows = skills.map(skillToRow);
        const { data, error } = await c.from('skills').upsert(rows).select();
        if (error) { console.error('Supabase insertMany error:', error); throw error; }
        return data.map(rowToSkill);
    },

    // Replace whole list (used after local edits in fallback mode, or manual sync push)
    async replaceAll(skills) {
        if (!isCloudMode()) {
            lsSave(skills);
            return skills;
        }
        // In cloud mode, replaceAll = wipe + insertMany. Used for "push local cache to cloud."
        const c = getClient();
        await c.from('skills').delete().neq('id', '__sentinel__');
        if (skills.length === 0) return [];
        const { data, error } = await c.from('skills').insert(skills.map(skillToRow)).select();
        if (error) throw error;
        return data.map(rowToSkill);
    },

    // Delete one skill
    async remove(id) {
        if (!isCloudMode()) {
            const all = lsLoad() || [];
            lsSave(all.filter(s => s.id !== id));
            return;
        }
        const c = getClient();
        const { error } = await c.from('skills').delete().eq('id', id);
        if (error) throw error;
    },
};

// ==========================================
// Row <-> Skill (snake_case <-> camelCase, defaults)
// ==========================================
function skillToRow(s) {
    return {
        id: s.id,
        name: s.name || 'Untitled',
        category: s.category || 'General',
        tags: Array.isArray(s.tags) ? s.tags : [],
        body: s.body || '',
        updated_at: new Date().toISOString(),
    };
}
function rowToSkill(r) {
    return {
        id: r.id,
        name: r.name,
        category: r.category,
        tags: r.tags || [],
        body: r.body || '',
    };
}

window.DB = DB;
