
-- =====================================================================================
-- MIGRAÇÃO DE MELHORIAS PARA O MÓDULO WHATSAPP
-- =====================================================================================
-- Este script adiciona todas as funcionalidades propostas no relatório de análise.
-- Execute no SQL Editor do Supabase.

-- =====================================================================================
-- PARTE 1: MELHORIAS PARA STATUS DIÁRIOS
-- =====================================================================================

-- 1. Tabela para configuração de rotinas de status
create table if not exists public.whatsapp_status_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  time_slots time[] not null default '{}',
  active_days integer[] not null default '{0,1,2,3,4,5,6}',
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly', 'monthly')),
  max_posts_per_day integer not null default 3,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists whatsapp_status_schedules_company_idx on public.whatsapp_status_schedules (company_id);

-- 2. Adicionar campos de aprovação na tabela whatsapp_posts
alter table public.whatsapp_posts 
add column if not exists approval_status text default 'draft' 
check (approval_status in ('draft', 'pending_approval', 'approved', 'rejected'));

alter table public.whatsapp_posts 
add column if not exists approved_by uuid;

alter table public.whatsapp_posts 
add column if not exists approved_at timestamptz;

-- 3. Melhorias na tabela de templates
alter table public.whatsapp_post_templates 
add column if not exists category text;

alter table public.whatsapp_post_templates 
add column if not exists is_status_template boolean not null default false;

alter table public.whatsapp_post_templates 
add column if not exists default_banner_id uuid references public.whatsapp_banners(id) on delete set null;

-- 4. Tabela para métricas de postagens
create table if not exists public.whatsapp_post_metrics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.whatsapp_posts(id) on delete cascade,
  views_count integer not null default 0,
  avg_view_duration_seconds integer,
  clicks_count integer not null default 0,
  replies_count integer not null default 0,
  unique_viewers_count integer not null default 0,
  collected_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists whatsapp_post_metrics_post_idx on public.whatsapp_post_metrics (post_id);

-- =====================================================================================
-- PARTE 2: MELHORIAS PARA ENVIO DE BANNERS PROMOCIONAIS
-- =====================================================================================

-- 1. Melhorias na tabela de contatos
alter table public.whatsapp_contacts 
add column if not exists last_purchase_at timestamptz;

alter table public.whatsapp_contacts 
add column if not exists total_purchases integer not null default 0;

alter table public.whatsapp_contacts 
add column if not exists total_spent numeric(10,2) not null default 0;

alter table public.whatsapp_contacts 
add column if not exists last_contact_at timestamptz;

alter table public.whatsapp_contacts 
add column if not exists has_opted_out boolean not null default false;

alter table public.whatsapp_contacts 
add column if not exists opted_out_at timestamptz;

-- 2. Tabela para múltiplas tags por contato
create table if not exists public.whatsapp_contact_tags (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.whatsapp_contacts(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique(contact_id, tag)
);

create index if not exists whatsapp_contact_tags_contact_idx on public.whatsapp_contact_tags (contact_id);
create index if not exists whatsapp_contact_tags_tag_idx on public.whatsapp_contact_tags (tag);

-- 3. Tabela para regras de frequência
create table if not exists public.whatsapp_frequency_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  max_messages_per_day integer not null default 1,
  max_messages_per_week integer not null default 3,
  max_messages_per_month integer not null default 10,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists whatsapp_frequency_rules_company_idx on public.whatsapp_frequency_rules (company_id);

-- 4. Tabela para log de mensagens por contato
create table if not exists public.whatsapp_contact_message_log (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.whatsapp_contacts(id) on delete cascade,
  post_id uuid not null references public.whatsapp_posts(id) on delete cascade,
  sent_at timestamptz not null default timezone('utc'::text, now()),
  message_type text not null check (message_type in ('status', 'promotional', 'transactional'))
);

create index if not exists whatsapp_contact_message_log_contact_idx on public.whatsapp_contact_message_log (contact_id);
create index if not exists whatsapp_contact_message_log_sent_idx on public.whatsapp_contact_message_log (sent_at);

-- 5. Tabelas para A/B Testing
create table if not exists public.whatsapp_ab_tests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'running', 'paused', 'completed')),
  start_at timestamptz,
  end_at timestamptz,
  winner_variant_id uuid,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists whatsapp_ab_tests_company_idx on public.whatsapp_ab_tests (company_id);

create table if not exists public.whatsapp_ab_test_variants (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.whatsapp_ab_tests(id) on delete cascade,
  name text not null,
  banner_id uuid references public.whatsapp_banners(id) on delete set null,
  template_id uuid references public.whatsapp_post_templates(id) on delete set null,
  traffic_percentage integer not null default 50,
  is_control boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists whatsapp_ab_test_variants_test_idx on public.whatsapp_ab_test_variants (test_id);

create table if not exists public.whatsapp_ab_test_results (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.whatsapp_ab_tests(id) on delete cascade,
  variant_id uuid not null references public.whatsapp_ab_test_variants(id) on delete cascade,
  sent_count integer not null default 0,
  views_count integer not null default 0,
  clicks_count integer not null default 0,
  conversions_count integer not null default 0,
  collected_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists whatsapp_ab_test_results_test_idx on public.whatsapp_ab_test_results (test_id);
create index if not exists whatsapp_ab_test_results_variant_idx on public.whatsapp_ab_test_results (variant_id);

-- =====================================================================================
-- HABILITANDO RLS NAS NOVAS TABELAS
-- =====================================================================================

alter table public.whatsapp_status_schedules enable row level security;
alter table public.whatsapp_post_metrics enable row level security;
alter table public.whatsapp_contact_tags enable row level security;
alter table public.whatsapp_frequency_rules enable row level security;
alter table public.whatsapp_contact_message_log enable row level security;
alter table public.whatsapp_ab_tests enable row level security;
alter table public.whatsapp_ab_test_variants enable row level security;
alter table public.whatsapp_ab_test_results enable row level security;

-- Políticas para whatsapp_status_schedules
drop policy if exists "whatsapp_status_schedules scoped by company" on public.whatsapp_status_schedules;
create policy "whatsapp_status_schedules scoped by company"
on public.whatsapp_status_schedules
for all to authenticated
using (exists (select 1 from public.companies where companies.id = whatsapp_status_schedules.company_id))
with check (exists (select 1 from public.companies where companies.id = whatsapp_status_schedules.company_id));

-- Políticas para whatsapp_post_metrics
drop policy if exists "whatsapp_post_metrics scoped by company" on public.whatsapp_post_metrics;
create policy "whatsapp_post_metrics scoped by company"
on public.whatsapp_post_metrics
for all to authenticated
using (exists (
  select 1 from public.whatsapp_posts 
  join public.companies on companies.id = whatsapp_posts.company_id
  where whatsapp_posts.id = whatsapp_post_metrics.post_id
));

-- Políticas para whatsapp_contact_tags
drop policy if exists "whatsapp_contact_tags scoped by company" on public.whatsapp_contact_tags;
create policy "whatsapp_contact_tags scoped by company"
on public.whatsapp_contact_tags
for all to authenticated
using (exists (
  select 1 from public.whatsapp_contacts 
  join public.companies on companies.id = whatsapp_contacts.company_id
  where whatsapp_contacts.id = whatsapp_contact_tags.contact_id
));

-- Políticas para whatsapp_frequency_rules
drop policy if exists "whatsapp_frequency_rules scoped by company" on public.whatsapp_frequency_rules;
create policy "whatsapp_frequency_rules scoped by company"
on public.whatsapp_frequency_rules
for all to authenticated
using (exists (select 1 from public.companies where companies.id = whatsapp_frequency_rules.company_id))
with check (exists (select 1 from public.companies where companies.id = whatsapp_frequency_rules.company_id));

-- Políticas para whatsapp_contact_message_log
drop policy if exists "whatsapp_contact_message_log scoped by company" on public.whatsapp_contact_message_log;
create policy "whatsapp_contact_message_log scoped by company"
on public.whatsapp_contact_message_log
for all to authenticated
using (exists (
  select 1 from public.whatsapp_contacts 
  join public.companies on companies.id = whatsapp_contacts.company_id
  where whatsapp_contacts.id = whatsapp_contact_message_log.contact_id
));

-- Políticas para whatsapp_ab_tests
drop policy if exists "whatsapp_ab_tests scoped by company" on public.whatsapp_ab_tests;
create policy "whatsapp_ab_tests scoped by company"
on public.whatsapp_ab_tests
for all to authenticated
using (exists (select 1 from public.companies where companies.id = whatsapp_ab_tests.company_id))
with check (exists (select 1 from public.companies where companies.id = whatsapp_ab_tests.company_id));

-- Políticas para whatsapp_ab_test_variants
drop policy if exists "whatsapp_ab_test_variants scoped by company" on public.whatsapp_ab_test_variants;
create policy "whatsapp_ab_test_variants scoped by company"
on public.whatsapp_ab_test_variants
for all to authenticated
using (exists (
  select 1 from public.whatsapp_ab_tests 
  join public.companies on companies.id = whatsapp_ab_tests.company_id
  where whatsapp_ab_tests.id = whatsapp_ab_test_variants.test_id
));

-- Políticas para whatsapp_ab_test_results
drop policy if exists "whatsapp_ab_test_results scoped by company" on public.whatsapp_ab_test_results;
create policy "whatsapp_ab_test_results scoped by company"
on public.whatsapp_ab_test_results
for all to authenticated
using (exists (
  select 1 from public.whatsapp_ab_tests 
  join public.companies on companies.id = whatsapp_ab_tests.company_id
  where whatsapp_ab_tests.id = whatsapp_ab_test_results.test_id
));

