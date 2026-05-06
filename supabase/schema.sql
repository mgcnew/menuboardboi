create extension if not exists "pgcrypto";

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  access_code text unique,
  image_duration_seconds integer not null default 10 check (image_duration_seconds >= 1),
  transition_type text not null default 'fade' check (transition_type in ('fade', 'cut', 'wipe-horizontal', 'wipe-vertical')),
  transition_duration_seconds numeric not null default 1.0 check (transition_duration_seconds >= 0.1 and transition_duration_seconds <= 3.0),
  image_fit_mode text not null default 'cover' check (image_fit_mode in ('contain', 'cover', 'fill')),
  ticker_text text not null default '',
  ticker_active boolean not null default false,
  audio_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  file_url text not null,
  file_path text not null unique,
  order_index integer not null default 0,
  active_days smallint[] default array[0,1,2,3,4,5,6],
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

-- Suporte a Letreiro (Ticker)
alter table public.companies add column if not exists ticker_text text;
alter table public.companies add column if not exists ticker_active boolean default false;

-- Tabela para rastrear as TVs (Players)
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  player_name text not null default 'TV',
  last_ping_at timestamptz not null default timezone('utc'::text, now()),
  current_media_name text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists players_company_idx on public.players (company_id);

alter table public.players enable row level security;

drop policy if exists "players are viewable by company members and master" on public.players;
create policy "players are viewable by company members and master"
on public.players
for select
to authenticated
using (true);

drop policy if exists "players can be inserted/updated anonymously" on public.players;
create policy "players can be inserted/updated anonymously"
on public.players
for all
to anon, authenticated
using (true)
with check (true);

grant select on table public.players to authenticated;
grant select, insert, update on table public.players to anon, authenticated;
grant all on table public.players to service_role;

-- Heartbeat da TV via RPC (contorna RLS se políticas estiverem incompletas)
create or replace function public.tv_heartbeat(
  p_company_id uuid,
  p_player_id uuid,
  p_player_name text,
  p_media text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_player_id is not null then
    -- Não altera player_name no ping: o painel pode renomear; só INSERT define o nome inicial.
    update public.players
    set
      last_ping_at = timezone('utc'::text, now()),
      current_media_name = nullif(trim(p_media), ''),
      company_id = p_company_id
    where id = p_player_id
      and company_id = p_company_id
    returning id into v_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into public.players (company_id, player_name, last_ping_at, current_media_name)
  values (
    p_company_id,
    coalesce(nullif(trim(p_player_name), ''), 'TV'),
    timezone('utc'::text, now()),
    nullif(trim(p_media), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.tv_heartbeat(uuid, uuid, text, text) from public;
grant execute on function public.tv_heartbeat(uuid, uuid, text, text) to anon, authenticated, service_role;

-- Tabelas adicionais para Multi-Tenancy e RBAC (retrocompatíveis)
create type public.user_role as enum ('client', 'master_admin');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  role public.user_role not null default 'client',
  full_name text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists profiles_company_idx on public.profiles (company_id);
create index if not exists profiles_role_idx on public.profiles (role);

alter table public.profiles enable row level security;

drop policy if exists "profiles are viewable by owner and master admin" on public.profiles;
create policy "profiles are viewable by owner and master admin"
on public.profiles
for select
to authenticated
using (
  auth.uid() = id
  or exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'master_admin'
  )
);

drop policy if exists "profiles are updatable by owner" on public.profiles;
create policy "profiles are updatable by owner"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Trigger para criar profile automaticamente quando um usuário é criado
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Tabela para limites de uso e billing (opcional, para uso futuro)
create table if not exists public.company_usage (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  monthly_images_uploaded integer default 0,
  monthly_storage_bytes bigint default 0,
  billing_cycle_month integer not null,
  billing_cycle_year integer not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (company_id, billing_cycle_month, billing_cycle_year)
);

alter table public.company_usage enable row level security;

drop policy if exists "company usage visible by company members and master" on public.company_usage;
create policy "company usage visible by company members and master"
on public.company_usage
for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
    and (profiles.company_id = company_usage.company_id or profiles.role = 'master_admin')
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
