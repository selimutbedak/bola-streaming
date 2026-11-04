create extension if not exists pgcrypto;

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  competition text not null,
  home_team text not null,
  away_team text not null,
  home_emoji text default '⚽',
  away_emoji text default '⚽',
  home_score integer,
  away_score integer,
  status text not null default 'upcoming'
    check (status in ('upcoming','live','finished')),
  kickoff_at timestamptz,
  description text,
  stream_url text,
  stream_type text not null default 'embed'
    check (stream_type in ('embed','video')),
  created_at timestamptz not null default now()
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, match_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.matches enable row level security;
alter table public.favorites enable row level security;
alter table public.comments enable row level security;

-- Semua pengunjung boleh membaca jadwal.
create policy "matches are readable by everyone"
on public.matches for select
using (true);

-- Favorit hanya bisa dibaca pemilik akun.
create policy "read own favorites"
on public.favorites for select
to authenticated
using (auth.uid() = user_id);

-- Pengguna hanya bisa menyimpan favorit untuk akunnya sendiri.
create policy "insert own favorites"
on public.favorites for insert
to authenticated
with check (auth.uid() = user_id);

-- Pengguna hanya bisa menghapus favorit miliknya sendiri.
create policy "delete own favorites"
on public.favorites for delete
to authenticated
using (auth.uid() = user_id);

-- Komentar bisa dibaca semua pengunjung.
create policy "comments are readable by everyone"
on public.comments for select
using (true);

-- Hanya pengguna login yang bisa berkomentar atas namanya sendiri.
create policy "insert own comments"
on public.comments for insert
to authenticated
with check (auth.uid() = user_id);

create policy "delete own comments"
on public.comments for delete
to authenticated
using (auth.uid() = user_id);

grant select on public.matches to anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select, insert, delete on public.comments to anon, authenticated;

-- Data contoh untuk melihat tampilan website.
-- Ini bukan jadwal pertandingan sungguhan.
insert into public.matches (
  competition,
  home_team,
  away_team,
  home_emoji,
  away_emoji,
  status,
  kickoff_at,
  description
)
values
(
  'CONTOH • PREMIER LEAGUE',
  'North London',
  'Manchester',
  '🔴',
  '🔵',
  'upcoming',
  now() + interval '2 days',
  'Data contoh. Ganti dengan jadwal pertandingan yang benar.'
),
(
  'CONTOH • LIGA INDONESIA',
  'Garuda FC',
  'Banteng United',
  '🦅',
  '🐂',
  'upcoming',
  now() + interval '3 days',
  'Data contoh. Ganti dengan jadwal pertandingan yang benar.'
);
