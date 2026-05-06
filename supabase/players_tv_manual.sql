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

-- 4) Permissões na tabela (se o heartbeat ou o painel falharem com “permission denied”)
grant select on table public.players to authenticated;
grant select, insert, update on table public.players to anon, authenticated;
grant all on table public.players to service_role;

-- 5) RPC de heartbeat (recomendado): ignora RLS na gravação e evita falhas silenciosas na TV
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
    -- Não altera player_name no ping: renomeação no painel preservada; só INSERT define o nome.
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

-- 6) Realtime (opcional): painel atualiza mais rápido
-- alter publication supabase_realtime add table public.players;
