-- =====================================================================
-- Skill Library — Supabase schema
-- Run this in your Supabase project's SQL Editor (Dashboard → SQL Editor)
-- =====================================================================

create table if not exists public.skills (
    id           text         primary key,
    name         text         not null default 'Untitled',
    category     text         not null default 'General',
    tags         text[]       not null default '{}',
    body         text         not null default '',
    updated_at   timestamptz  not null default now()
);

-- Index for sorting / filtering
create index if not exists skills_updated_at_idx on public.skills (updated_at desc);
create index if not exists skills_category_idx   on public.skills (category);

-- Enable Row Level Security
alter table public.skills enable row level security;

-- =====================================================================
-- POLICY OPTION A — single-user / personal tool (DEFAULT)
-- Anyone with the anon key can read & write. Simple, no auth.
-- =====================================================================
drop policy if exists "anon all access" on public.skills;
create policy "anon all access"
    on public.skills
    for all
    using (true)
    with check (true);

-- =====================================================================
-- POLICY OPTION B — multi-user (uncomment if you add auth later)
-- Each authenticated user only sees their own skills.
-- Add:  alter table public.skills add column user_id uuid default auth.uid();
-- =====================================================================
-- drop policy if exists "users manage own" on public.skills;
-- create policy "users manage own"
--     on public.skills
--     for all
--     using (auth.uid() = user_id)
--     with check (auth.uid() = user_id);
