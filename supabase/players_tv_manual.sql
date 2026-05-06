-- =============================================================================
-- TVs / Players — ajuste manual no Supabase (SQL Editor)
-- Rode o bloco inteiro; é idempotente na medida do possível.
-- =============================================================================

-- 1) Tabela (heartbeat das TVs que abrem o player)
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  player_name text not null default 'TV',
  last_ping_at timestamptz not null default timezone('utc'::text, now()),
  current_media_name text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists players_company_idx on public.players (company_id);

-- 2) Default do nome (novas linhas sem nome explícito)
alter table public.players alter column player_name set default 'TV';

-- 3) RLS
alter table public.players enable row level security;

-- Painel logado: ver TVs da empresa
drop policy if exists "players are viewable by company members and master" on public.players;
create policy "players are viewable by company members and master"
on public.players
for select
to authenticated
using (true);

-- Player na TV (anon + authenticated): inserir/atualizar heartbeat
-- Se no seu projeto a política for outra, ajuste aqui.
drop policy if exists "players can be inserted/updated anonymously" on public.players;
create policy "players can be inserted/updated anonymously"
on public.players
for all
to anon, authenticated
using (true)
with check (true);

-- 4) Realtime (opcional): painel atualiza mais rápido
-- alter publication supabase_realtime add table public.players;
