create extension if not exists "pgcrypto";

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  image_duration_seconds integer not null default 10 check (image_duration_seconds >= 1),
  transition_type text not null default 'fade' check (transition_type in ('fade', 'cut', 'wipe-horizontal', 'wipe-vertical')),
  transition_duration_seconds numeric not null default 1.0 check (transition_duration_seconds >= 0.1 and transition_duration_seconds <= 3.0),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  file_url text not null,
  file_path text not null unique,
  order_index integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.music (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  file_url text not null,
  file_path text not null unique,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.voiceovers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  file_url text not null,
  file_path text not null unique,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists images_company_order_idx on public.images (company_id, order_index);
create index if not exists music_company_created_idx on public.music (company_id, created_at);
create index if not exists voiceovers_company_created_idx on public.voiceovers (company_id, created_at);

alter table public.companies enable row level security;
alter table public.images enable row level security;
alter table public.music enable row level security;
alter table public.voiceovers enable row level security;

drop policy if exists "companies are readable" on public.companies;
create policy "companies are readable"
on public.companies
for select
to anon, authenticated
using (true);

drop policy if exists "companies are writable" on public.companies;
create policy "companies are writable"
on public.companies
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "images scoped by company" on public.images;
create policy "images scoped by company"
on public.images
for all
to anon, authenticated
using (
  exists (
    select 1
    from public.companies
    where companies.id = images.company_id
  )
)
with check (
  exists (
    select 1
    from public.companies
    where companies.id = images.company_id
  )
);

drop policy if exists "music scoped by company" on public.music;
create policy "music scoped by company"
on public.music
for all
to anon, authenticated
using (
  exists (
    select 1
    from public.companies
    where companies.id = music.company_id
  )
)
with check (
  exists (
    select 1
    from public.companies
    where companies.id = music.company_id
  )
);

drop policy if exists "voiceovers scoped by company" on public.voiceovers;
create policy "voiceovers scoped by company"
on public.voiceovers
for all
to anon, authenticated
using (
  exists (
    select 1
    from public.companies
    where companies.id = voiceovers.company_id
  )
)
with check (
  exists (
    select 1
    from public.companies
    where companies.id = voiceovers.company_id
  )
);

insert into storage.buckets (id, name, public)
values
  ('images', 'images', true),
  ('music', 'music', true),
  ('voiceovers', 'voiceovers', true)
on conflict (id) do nothing;

drop policy if exists "public can read images bucket" on storage.objects;
create policy "public can read images bucket"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'images');

drop policy if exists "public can upload images bucket" on storage.objects;
create policy "public can upload images bucket"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'images');

drop policy if exists "public can delete images bucket" on storage.objects;
create policy "public can delete images bucket"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'images');

drop policy if exists "public can read music bucket" on storage.objects;
create policy "public can read music bucket"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'music');

drop policy if exists "public can upload music bucket" on storage.objects;
create policy "public can upload music bucket"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'music');

drop policy if exists "public can delete music bucket" on storage.objects;
create policy "public can delete music bucket"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'music');

drop policy if exists "public can read voiceovers bucket" on storage.objects;
create policy "public can read voiceovers bucket"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'voiceovers');

drop policy if exists "public can upload voiceovers bucket" on storage.objects;
create policy "public can upload voiceovers bucket"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'voiceovers');

drop policy if exists "public can delete voiceovers bucket" on storage.objects;
create policy "public can delete voiceovers bucket"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'voiceovers');
