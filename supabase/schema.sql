-- Run this whole file once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- It creates the two tables the app needs, and locks each row to its owner
-- so users can only ever see and edit their own data.

-- ========== ENTRIES (expenses & income) ==========
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount numeric not null check (amount > 0),
  type text not null check (type in ('expense', 'income')),
  created_at timestamptz not null default now()
);

alter table entries enable row level security;

create policy "Users can view their own entries"
  on entries for select
  using (auth.uid() = user_id);

create policy "Users can insert their own entries"
  on entries for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own entries"
  on entries for delete
  using (auth.uid() = user_id);

-- ========== GOALS (savings target) ==========
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target numeric not null check (target > 0),
  saved numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table goals enable row level security;

create policy "Users can view their own goals"
  on goals for select
  using (auth.uid() = user_id);

create policy "Users can insert their own goals"
  on goals for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own goals"
  on goals for update
  using (auth.uid() = user_id);

create policy "Users can delete their own goals"
  on goals for delete
  using (auth.uid() = user_id);

-- ========== SETTINGS (starting balance) ==========
create table if not exists settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  starting_balance numeric not null default 0
);

alter table settings enable row level security;

create policy "Users can view their own settings"
  on settings for select
  using (auth.uid() = user_id);

create policy "Users can insert their own settings"
  on settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own settings"
  on settings for update
  using (auth.uid() = user_id);
