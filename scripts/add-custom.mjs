/**
 * Adds custom skills (Instagram + LinkedIn) to Supabase.
 * Wipes everything else first.
 *
 * Required env vars:
 *   SUPA_URL             — Supabase project URL
 *   SUPA_SERVICE_KEY     — service_role key (bypasses RLS) — keep secret!
 *   INSTA_SKILL_PATH     — local path to Instagram operator prompt markdown
 *   LINKEDIN_SKILL_PATH  — local path to LinkedIn agency outreach SKILL.md
 */
import fs from 'node:fs/promises';

const SUPA_URL = process.env.SUPA_URL;
const SUPA_KEY = process.env.SUPA_SERVICE_KEY;
const INSTA_SKILL_PATH = process.env.INSTA_SKILL_PATH;
const LINKEDIN_SKILL_PATH = process.env.LINKEDIN_SKILL_PATH;

if (!SUPA_URL || !SUPA_KEY || !INSTA_SKILL_PATH || !LINKEDIN_SKILL_PATH) {
    console.error('❌ Missing env vars. Required: SUPA_URL, SUPA_SERVICE_KEY, INSTA_SKILL_PATH, LINKEDIN_SKILL_PATH');
    process.exit(1);
}

const sanitize = s => String(s || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

const insta = await fs.readFile(INSTA_SKILL_PATH, 'utf8');
const linkedin = await fs.readFile(LINKEDIN_SKILL_PATH, 'utf8');

const skills = [
    {
        id: 'custom-insta-virality-finder',
        name: 'Insta Download + Clean + Virality Finder 30x + AI TECH',
        category: 'Personal',
        tags: ['instagram', 'reels', 'virality', 'ai', 'download'],
        body: sanitize(insta).trim(),
        updated_at: new Date().toISOString()
    },
    {
        id: 'custom-linkedin-agency-outreach',
        name: 'LinkedIn Agency Outreach (India → US)',
        category: 'Personal',
        tags: ['linkedin', 'outreach', 'agency', 'sales', 'india-to-us'],
        body: sanitize(linkedin).trim(),
        updated_at: new Date().toISOString()
    }
];

console.log('Wiping…');
await fetch(`${SUPA_URL}/rest/v1/skills?id=neq.__sentinel__`, {
    method: 'DELETE',
    headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
});

console.log(`Inserting ${skills.length} custom skills…`);
const res = await fetch(`${SUPA_URL}/rest/v1/skills`, {
    method: 'POST',
    headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(skills)
});

console.log('Status:', res.status);
const data = await res.json();
console.log('Inserted:', data.map(d => `${d.id} (${d.name.length}c name, ${d.body.length}c body)`).join('\n  '));
