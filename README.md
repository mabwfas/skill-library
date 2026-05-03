# 📚 Skill Library

A gorgeous, dark-themed personal skill library — open-book carousel UI, slide-in
editor, bulk import, and optional Supabase cloud sync.

![status](https://img.shields.io/badge/stack-vanilla_JS-yellow)
![status](https://img.shields.io/badge/storage-Supabase_or_localStorage-blue)
![status](https://img.shields.io/badge/license-MIT-green)

## Features

- **Open-book thumbnails** — two parchment pages, colored binding, bookmark ribbon
- **Three-column responsive layout** — sidebar / carousel / slide-in editor
- **Search + category chips** — filter live
- **Bulk import** — paste-format, JSON paste, or file upload
- **Auto-save** — debounced commits to local cache or cloud
- **Cloud sync** — Supabase backend, falls back to localStorage offline
- **Keyboard shortcuts** — `Ctrl+K` search, `Ctrl+N` new, `Ctrl+S` save, `Esc` close
- **Click-drag carousel** — pan horizontally with grab cursor
- **Mobile responsive** — hamburger menu, full-screen editor on phones

## Quick Start

```bash
git clone <this-repo>
cd skill-library
npx serve .
```

Open http://localhost:3000 — the app boots with 15 sample skills in
localStorage. Add, edit, import to your heart's content.

## Cloud Sync (Optional)

To sync across devices, see [SUPABASE-SETUP.md](./SUPABASE-SETUP.md).

TL;DR — create a free Supabase project, run `supabase-schema.sql`, paste your
project URL + anon key into the **☁** modal in the sidebar.

## File Layout

```
index.html              → markup
styles.css              → all styling (dark theme, open-book CSS)
app.js                  → app logic, state, rendering, events
db.js                   → storage abstraction (Supabase or localStorage)
supabase-schema.sql     → DB table + RLS policy
SUPABASE-SETUP.md       → setup guide
```

## Tech

- Vanilla JavaScript — no framework, no build step
- [Supabase JS SDK](https://github.com/supabase/supabase-js) (CDN, optional)
- Crimson Pro + Inter fonts (Google Fonts)
- localStorage for offline cache

## Deployment

Drop the folder into Vercel / Netlify / Cloudflare Pages — it's static.

```bash
vercel
```

## License

MIT
