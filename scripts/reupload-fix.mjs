/**
 * One-shot re-upload of the 4 custom skills with proper sanitization.
 * Fixes the bug where spaces had been stripped from cloud bodies.
 */
import fs from 'node:fs/promises';

// Sanitize: strip ONLY null + control chars; PRESERVE spaces, tabs, newlines
const clean = s => String(s || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();

const SUPA_URL = 'https://ddyflncpimwxutqvuvwx.supabase.co';
const SUPA_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkeWZsbmNwaW13eHV0cXZ1dnd4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc1NDg2MiwiZXhwIjoyMDkzMzMwODYyfQ.e7i4kDcnEl0IgFzmHy22a1_6kH71ks5nNTiRRNSsn7s';

const skills = [
    {
        id: 'custom-insta-virality-finder',
        name: 'Insta Download + Clean + Virality Finder 30x + AI TECH',
        category: 'Personal',
        tags: ['instagram', 'reels', 'virality', 'ai', 'download'],
        summary: [
            'Scrapes Instagram hashtags to find top creators and reel codes',
            'Calculates creator view ratios to identify highly viral outlier reels',
            'Downloads qualifying outlier videos to local storage using yt-dlp',
            'Removes identifying video metadata and adds tail fades via FFmpeg',
            'Renames and ranks the final edited reels by view counts',
        ],
        body: clean(await fs.readFile('C:/Users/reals/Downloads/reels/breakthroughs/INSTAGRAM_OPERATOR_PROMPT.md', 'utf8')),
        updated_at: new Date().toISOString(),
    },
    {
        id: 'custom-linkedin-agency-outreach',
        name: 'LinkedIn Agency Outreach (India → US)',
        category: 'Personal',
        tags: ['linkedin', 'outreach', 'agency', 'sales', 'india-to-us'],
        summary: [
            'Builds India-to-US LinkedIn outbound sequences for web dev agencies',
            'Designs multi-account sender architectures to bypass LinkedIn invite caps',
            'Creates trigger-based message templates for US founders and operators',
            'Structures permission-first Loom audit workflows to convert cold leads',
            'Defines daily operating rhythms for targeted comments and connection requests',
            'Positions offshore web dev agencies to close US credibility gaps',
        ],
        body: clean(await fs.readFile('C:/Users/reals/AppData/Local/Temp/linkedin-skill/linkedin-agency-outreach/SKILL.md', 'utf8')),
        updated_at: new Date().toISOString(),
    },
    {
        id: 'custom-reel-outlier-hunter',
        name: 'Reel Outlier Hunter (X-Factor + Clean + Rename)',
        category: 'Personal',
        tags: ['instagram', 'reels', 'outliers', 'x-factor', 'virality', 'download', 'metadata-strip', 'repost'],
        summary: [
            "Identifies reels that beat the creator's own baseline by an X-factor (default 30x)",
            'Computes X = reel_likes / creator_median_recent_likes',
            'Downloads outlier MP4s and strips all identifying metadata via bitexact ffmpeg remux',
            'Renames files with NN_handle_Xx_reelLikes-vs-medianLikes schema',
            'Asks user posting preference at end (Boostax mobile vs browser-only)',
        ],
        body: clean(await fs.readFile('C:/Users/reals/.claude/skills/reel-outlier-hunter/SKILL.md', 'utf8')),
        updated_at: new Date().toISOString(),
    },
    {
        id: 'custom-ig-reel-publisher',
        name: 'IG Reel Publisher (Outro + Clean + Auto-Post)',
        category: 'Personal',
        tags: ['instagram', 'reels', 'publishing', 'outro', 'playwright', 'automation', 'captions', 'branding'],
        summary: [
            'Re-encodes any source video to 9:16 and strips all metadata for clean uploads',
            'Appends a 1.5s branded outro card (handle + tagline + brand)',
            'Watches each video via extracted frames to write context-matched SEO captions',
            'Auto-uploads to Instagram via logged-in Playwright Chrome session',
            'Tracks posted.txt for resume-safety and stops on suspension or action-block warnings',
        ],
        body: clean(await fs.readFile('C:/Users/reals/.claude/skills/ig-reel-publisher/SKILL.md', 'utf8')),
        updated_at: new Date().toISOString(),
    },
];

const r = await fetch(`${SUPA_URL}/rest/v1/skills`, {
    method: 'POST',
    headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(skills),
});

console.log('Status:', r.status);
const data = await r.json();
if (Array.isArray(data)) {
    data.forEach((s) => {
        const spaces = (s.body.match(/ /g) || []).length;
        console.log(`  ${s.id}: ${s.body.length} chars · ${spaces.toLocaleString()} spaces`);
    });
} else {
    console.log(JSON.stringify(data));
}
