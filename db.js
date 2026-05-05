/**
 * db.js — Supabase storage layer (auto-connected)
 *
 * Connection is hardcoded — the app always syncs to the same database.
 * The anon key is safe in client code (RLS policies in supabase-schema.sql
 * govern access).
 *
 * Schema (matches supabase-schema.sql):
 *   skills(id text pk, name text, category text, tags text[],
 *          summary text[], body text, updated_at timestamptz)
 */

const SUPA_URL = 'https://ddyflncpimwxutqvuvwx.supabase.co';
const SUPA_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkeWZsbmNwaW13eHV0cXZ1dnd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTQ4NjIsImV4cCI6MjA5MzMzMDg2Mn0.s-UA4_HtqTpbJDeLTg03DiBkWAHs2IoT4gwziPmMiRA';

let _client = null;

function getClient() {
    if (_client) return _client;
    if (typeof window.supabase === 'undefined') {
        console.warn('Supabase SDK not loaded yet');
        return null;
    }
    _client = window.supabase.createClient(SUPA_URL, SUPA_ANON_KEY, {
        auth: { persistSession: false }
    });
    return _client;
}

// ==========================================
// Row <-> Skill (snake_case <-> camelCase)
// ==========================================
function skillToRow(s) {
    return {
        id: s.id,
        name: s.name || 'Untitled',
        category: s.category || 'General',
        tags: Array.isArray(s.tags) ? s.tags : [],
        summary: Array.isArray(s.summary) ? s.summary : [],
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
        summary: r.summary || [],
        body: r.body || '',
    };
}

// ==========================================
// Public API — always async, always Supabase
// ==========================================
const DB = {
    /** Always cloud now — kept for legacy callers. */
    isCloudMode: () => true,

    /** Load all skills (paginated; Supabase caps at 1000 per request). */
    async list() {
        const c = getClient();
        if (!c) throw new Error('Supabase client not available');
        const PAGE = 1000;
        const all = [];
        for (let from = 0; ; from += PAGE) {
            const { data, error } = await c
                .from('skills')
                .select('*')
                .order('updated_at', { ascending: false })
                .range(from, from + PAGE - 1);
            if (error) { console.error('Supabase list error:', error); throw error; }
            if (!data || data.length === 0) break;
            all.push(...data);
            if (data.length < PAGE) break;
        }
        return all.map(rowToSkill);
    },

    /** Insert or update one skill. */
    async upsert(skill) {
        const c = getClient();
        const { data, error } = await c.from('skills').upsert(skillToRow(skill)).select().single();
        if (error) { console.error('Supabase upsert error:', error); throw error; }
        return rowToSkill(data);
    },

    /** Bulk insert (used by import). */
    async insertMany(skills) {
        const c = getClient();
        const rows = skills.map(skillToRow);
        const { data, error } = await c.from('skills').upsert(rows).select();
        if (error) { console.error('Supabase insertMany error:', error); throw error; }
        return data.map(rowToSkill);
    },

    /** Delete one skill by id. */
    async remove(id) {
        const c = getClient();
        const { error } = await c.from('skills').delete().eq('id', id);
        if (error) { console.error('Supabase remove error:', error); throw error; }
    },

    /**
     * Subscribe to real-time changes (cross-device sync).
     * Callback fires on INSERT/UPDATE/DELETE of any skill row.
     */
    subscribe(callback) {
        const c = getClient();
        if (!c) return () => {};
        const channel = c
            .channel('skills-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'skills' },
                (payload) => callback(payload)
            )
            .subscribe();
        return () => { c.removeChannel(channel); };
    },
};

window.DB = DB;
