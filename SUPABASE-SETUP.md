# Supabase Cloud Sync — Setup

The Skill Library works offline with localStorage by default.
To sync across devices, connect a free Supabase project.

## 1. Create a Supabase project

1. Go to https://supabase.com and sign in.
2. Click **New Project**, give it any name, pick a region, set a strong DB password.
3. Wait ~2 minutes for it to spin up.

## 2. Create the table

1. In your project, open **SQL Editor** (left sidebar).
2. Click **New query**.
3. Paste the contents of `supabase-schema.sql` (in this folder).
4. Click **Run**.

That creates a `skills` table with row-level security set to "anyone with the
anon key can read & write" — fine for a personal tool.

## 3. Grab your credentials

In your project's left sidebar:
**Project Settings → API**

Copy these two values:

- **Project URL** — looks like `https://xxxxxxxxxxxxx.supabase.co`
- **Project API keys → anon / public** — long JWT starting with `eyJhbG…`

> The anon key is safe to put in client code (RLS protects writes).
> Never paste the **service_role** key in the browser.

## 4. Connect from the app

1. Open the Skill Library.
2. Click the **☁** button in the sidebar header.
3. Paste the URL and anon key.
4. Click **Test Connection** → should say "Connected!".
5. Click **Save & Connect**.

The footer indicator switches from `💾 Local` to `☁ Cloud`.

## 5. Push your existing local skills (one time)

If you already added skills locally and want them in the cloud:

1. Open the cloud modal again.
2. Click **⬆ Push Local → Cloud**.
3. Confirms "wipes the cloud table and uploads your current local skills".

After that, every add / edit / delete syncs to the cloud automatically.

## Multi-device usage

Once connected on machine A, just enter the same URL + anon key on machine B.
Both devices read from the same `skills` table.

## Disconnecting

Cloud modal → **Disconnect**. Your local cache stays — you'll see whatever
was loaded last from the cloud, and edits go back to localStorage only.

## Multi-user mode (advanced)

If you want each user to see only their own skills (with Supabase Auth):

1. In `supabase-schema.sql`, comment out **Policy A** and uncomment **Policy B**.
2. Run: `alter table public.skills add column user_id uuid default auth.uid();`
3. Add Supabase Auth signup / login UI to the app (not included by default).
