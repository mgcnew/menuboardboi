-- =====================================================================================
-- SCRIPT DE CRIAÇÃO DO SCHEMA DO WHATSAPP (MÓDULO DE POSTAGENS E PROPAGANDAS)
-- =====================================================================================
-- Execute este script no SQL Editor do Supabase para criar as tabelas necessárias.

-- 1. Tabela: whatsapp_banners
create table if not exists public.whatsapp_banners (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  file_url text not null,
  file_size bigint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists whatsapp_banners_company_idx on public.whatsapp_banners (company_id);

-- 2. Tabela: whatsapp_post_templates
create table if not exists public.whatsapp_post_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  message_text text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists whatsapp_post_templates_company_idx on public.whatsapp_post_templates (company_id);

-- 3. Tabela: whatsapp_contacts
create table if not exists public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  phone_numbers text[] not null default '{}',
  segment text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists whatsapp_contacts_company_idx on public.whatsapp_contacts (company_id);

-- 4. Tabela: whatsapp_posts
create table if not exists public.whatsapp_posts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  banner_id uuid references public.whatsapp_banners(id) on delete set null,
  template_id uuid references public.whatsapp_post_templates(id) on delete set null,
  message_text text,
  recipient_ids uuid[] not null default '{}',
  scheduled_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  sent_at timestamptz,
  recipient_count integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists whatsapp_posts_company_idx on public.whatsapp_posts (company_id);
create index if not exists whatsapp_posts_status_idx on public.whatsapp_posts (status);
create index if not exists whatsapp_posts_scheduled_at_idx on public.whatsapp_posts (scheduled_at);

-- 5. Tabela: whatsapp_credentials
create table if not exists public.whatsapp_credentials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null default 'w-api',
  api_key text not null,
  instance_id text,
  phone_number text,
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique(company_id)
);

create index if not exists whatsapp_credentials_company_idx on public.whatsapp_credentials (company_id);

-- =====================================================================================
-- HABILITANDO ROW LEVEL SECURITY (RLS) E CRIANDO POLÍTICAS
-- =====================================================================================

alter table public.whatsapp_banners enable row level security;
alter table public.whatsapp_post_templates enable row level security;
alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_posts enable row level security;
alter table public.whatsapp_credentials enable row level security;

-- Políticas para whatsapp_banners
drop policy if exists "whatsapp_banners scoped by company" on public.whatsapp_banners;
create policy "whatsapp_banners scoped by company"
on public.whatsapp_banners
for all to authenticated
using (exists (select 1 from public.companies where companies.id = whatsapp_banners.company_id))
with check (exists (select 1 from public.companies where companies.id = whatsapp_banners.company_id));

-- Políticas para whatsapp_post_templates
drop policy if exists "whatsapp_post_templates scoped by company" on public.whatsapp_post_templates;
create policy "whatsapp_post_templates scoped by company"
on public.whatsapp_post_templates
for all to authenticated
using (exists (select 1 from public.companies where companies.id = whatsapp_post_templates.company_id))
with check (exists (select 1 from public.companies where companies.id = whatsapp_post_templates.company_id));

-- Políticas para whatsapp_contacts
drop policy if exists "whatsapp_contacts scoped by company" on public.whatsapp_contacts;
create policy "whatsapp_contacts scoped by company"
on public.whatsapp_contacts
for all to authenticated
using (exists (select 1 from public.companies where companies.id = whatsapp_contacts.company_id))
with check (exists (select 1 from public.companies where companies.id = whatsapp_contacts.company_id));

-- Políticas para whatsapp_posts
drop policy if exists "whatsapp_posts scoped by company" on public.whatsapp_posts;
create policy "whatsapp_posts scoped by company"
on public.whatsapp_posts
for all to authenticated
using (exists (select 1 from public.companies where companies.id = whatsapp_posts.company_id))
with check (exists (select 1 from public.companies where companies.id = whatsapp_posts.company_id));

-- Políticas para whatsapp_credentials (apenas leitura para o usuário, e atualização)
-- Obs: as chaves deveriam ter um nível extra de segurança na aplicação real.
drop policy if exists "whatsapp_credentials scoped by company" on public.whatsapp_credentials;
create policy "whatsapp_credentials scoped by company"
on public.whatsapp_credentials
for all to authenticated
using (exists (select 1 from public.companies where companies.id = whatsapp_credentials.company_id))
with check (exists (select 1 from public.companies where companies.id = whatsapp_credentials.company_id));

-- Bucket Storage para Banners do WhatsApp
insert into storage.buckets (id, name, public)
values ('whatsapp_banners', 'whatsapp_banners', true)
on conflict (id) do nothing;

drop policy if exists "public can read whatsapp_banners bucket" on storage.objects;
create policy "public can read whatsapp_banners bucket"
on storage.objects for select to anon, authenticated
using (bucket_id = 'whatsapp_banners');

drop policy if exists "public can upload whatsapp_banners bucket" on storage.objects;
create policy "public can upload whatsapp_banners bucket"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'whatsapp_banners');

drop policy if exists "public can delete whatsapp_banners bucket" on storage.objects;
create policy "public can delete whatsapp_banners bucket"
on storage.objects for delete to anon, authenticated
using (bucket_id = 'whatsapp_banners');
