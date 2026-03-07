# Astronaut Training Leaderboard Setup (Supabase)

This page uses two Supabase tables for optional leaderboard participation:

- `astro_profiles` (display name + opt-in state)
- `astro_leaderboard_scores` (XP and score aggregates)

Run the SQL below in Supabase SQL editor.

## 1) Tables

```sql
create table if not exists public.astro_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  leaderboard_opt_in boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.astro_leaderboard_scores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_xp integer not null default 0,
  streak_days integer not null default 0,
  quiz_count integer not null default 0,
  cognitive_count integer not null default 0,
  avg_quiz_score integer not null default 0,
  avg_cognitive_score integer not null default 0,
  best_quiz_score integer not null default 0,
  best_cognitive_score integer not null default 0,
  updated_at timestamptz not null default now()
);
```

## 2) Row Level Security

```sql
alter table public.astro_profiles enable row level security;
alter table public.astro_leaderboard_scores enable row level security;
```

## 3) Policies

```sql
-- Profiles: users manage their own row; public can only read opted-in names.
create policy if not exists "profiles_insert_own"
on public.astro_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy if not exists "profiles_update_own"
on public.astro_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "profiles_select_opted_or_self"
on public.astro_profiles
for select
to authenticated
using (leaderboard_opt_in = true or auth.uid() = user_id);

-- Scores: users manage own row; authenticated users can read leaderboard metrics.
create policy if not exists "scores_insert_own"
on public.astro_leaderboard_scores
for insert
to authenticated
with check (auth.uid() = user_id);

create policy if not exists "scores_update_own"
on public.astro_leaderboard_scores
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "scores_select_authenticated"
on public.astro_leaderboard_scores
for select
to authenticated
using (true);
```

## 4) Verification

1. Sign in on `astronaut-training.html`.
2. Open Progress tab.
3. Set display name and enable opt-in.
4. Click `Save Leaderboard Settings`.
5. Click `Refresh Leaderboard` and verify your row appears.
