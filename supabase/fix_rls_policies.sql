-- Este script restaura as políticas RLS originais para garantir que o modo TV funcione

-- Tabela companies: permitir leitura para anon e authenticated
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

-- Tabela images: permitir acesso para anon e authenticated
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

-- Tabela music: permitir acesso para anon e authenticated
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

-- Tabela voiceovers: permitir acesso para anon e authenticated
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
