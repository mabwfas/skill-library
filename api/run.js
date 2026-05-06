/**
 * /api/run — Execute a skill against an input via Claude API
 *
 * Streams Claude's response back to the browser as plain text chunks.
 * Requires ANTHROPIC_API_KEY env var on Vercel.
 *
 * Body: { skillId: string, input: string }
 */

const SUPA_URL = 'https://ddyflncpimwxutqvuvwx.supabase.co';
const SUPA_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkeWZsbmNwaW13eHV0cXZ1dnd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTQ4NjIsImV4cCI6MjA5MzMzMDg2Mn0.s-UA4_HtqTpbJDeLTg03DiBkWAHs2IoT4gwziPmMiRA';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).send('POST only');
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(501).send(
            'ANTHROPIC_API_KEY not configured on the server. Set it in Vercel project env vars.'
        );
    }

    const { skillId, input } = req.body || {};
    if (!skillId) return res.status(400).send('Missing skillId');

    // Fetch the skill body
    let skill;
    try {
        const r = await fetch(
            `${SUPA_URL}/rest/v1/skills?id=eq.${encodeURIComponent(skillId)}&select=name,body`,
            { headers: { apikey: SUPA_ANON_KEY, Authorization: `Bearer ${SUPA_ANON_KEY}` } }
        );
        const rows = await r.json();
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(404).send(`Skill not found: ${skillId}`);
        }
        skill = rows[0];
    } catch (e) {
        return res.status(500).send(`Skill fetch failed: ${e.message}`);
    }

    // Stream from Claude API
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');

    const systemPrompt = `You are operating inside a skill chain. The user has activated the skill below as your operating mode for this turn. Apply the skill directly to the input. Do not ask for confirmation. Output the result of executing the skill on the input — concise, structured, ready to feed into the next step.

--- SKILL: ${skill.name} ---
${skill.body}
--- END SKILL ---`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 4096,
            stream: true,
            system: systemPrompt,
            messages: [{ role: 'user', content: input || '(no input — use defaults from the skill)' }],
        }),
    });

    if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        return res.status(claudeRes.status).send(`Claude API error: ${errText.slice(0, 500)}`);
    }

    // Parse SSE stream and write text deltas to client
    const reader = claudeRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';
            for (const evt of events) {
                const line = evt.split('\n').find(l => l.startsWith('data: '));
                if (!line) continue;
                const json = line.slice(6).trim();
                if (!json || json === '[DONE]') continue;
                try {
                    const data = JSON.parse(json);
                    if (data.type === 'content_block_delta' && data.delta?.text) {
                        res.write(data.delta.text);
                    }
                } catch (_) {
                    // ignore malformed events
                }
            }
        }
    } catch (e) {
        res.write(`\n[stream error: ${e.message}]`);
    }

    res.end();
}
