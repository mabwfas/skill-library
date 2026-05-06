/**
 * One-shot insert of the Insta Download / Virality Finder skill.
 *
 * Required env vars:
 *   SUPA_URL          — Supabase project URL
 *   SUPA_SERVICE_KEY  — service_role key (bypasses RLS) — keep secret!
 *   INSTA_SKILL_PATH  — local path to the Instagram operator prompt markdown
 */
import fs from 'node:fs/promises';

const SUPA_URL = process.env.SUPA_URL;
const SUPA_KEY = process.env.SUPA_SERVICE_KEY;
const INSTA_SKILL_PATH = process.env.INSTA_SKILL_PATH;

if (!SUPA_URL || !SUPA_KEY || !INSTA_SKILL_PATH) {
    console.error('❌ Missing env vars. Required: SUPA_URL, SUPA_SERVICE_KEY, INSTA_SKILL_PATH');
    process.exit(1);
}

const body = (await fs.readFile(INSTA_SKILL_PATH, 'utf8'))
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

const skill = {
    id: 'custom-insta-virality-finder',
    name: 'Insta Download + Clean + Virality Finder 30x + AI TECH',
    category: 'Personal',
    tags: ['instagram', 'reels', 'virality', 'ai', 'download'],
    body: body.trim(),
    updated_at: new Date().toISOString()
};

const res = await fetch(`${SUPA_URL}/rest/v1/skills`, {
    method: 'POST',
    headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify([skill])
});

console.log('Status:', res.status);
const text = await res.text();
console.log('Body:', text.slice(0, 300));

// Verify
const verify = await fetch(
    `${SUPA_URL}/rest/v1/skills?id=eq.custom-insta-virality-finder&select=id,name,category`,
    { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
);
console.log('Verify:', await verify.text());
