-- =====================================================================================
-- WHATSAPP SCHEDULER SETUP (EDGE FUNCTION + CRON 1 MIN)
-- =====================================================================================
-- 1) Atualiza schema para fila de processamento
-- 2) Configura função SQL que dispara a Edge Function
-- 3) Agenda cron de 1 em 1 minuto
--
-- IMPORTANTE:
-- - Substitua os placeholders pelos dados do seu projeto
-- - Execute no SQL Editor do Supabase
-- =====================================================================================

-- 1) Ajustes de schema
alter table public.whatsapp_posts
  drop constraint if exists whatsapp_posts_status_check;

alter table public.whatsapp_posts
  add constraint whatsapp_posts_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled'));

alter table public.whatsapp_posts
  add column if not exists last_error text,
  add column if not exists processed_at timestamptz;

create index if not exists whatsapp_posts_queue_idx
  on public.whatsapp_posts (status, scheduled_at, created_at);

-- 2) Extensões necessárias (normalmente já disponíveis no Supabase)
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 3) Função SQL para acionar a Edge Function via HTTP
create or replace function public.trigger_whatsapp_queue_worker()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := 'https://<PROJECT-REF>.supabase.co/functions/v1/process-whatsapp-queue';
  v_service_key text := '<SUPABASE_SERVICE_ROLE_KEY>';
begin
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('batchSize', 25)
  );
end;
$$;

revoke all on function public.trigger_whatsapp_queue_worker() from public;
grant execute on function public.trigger_whatsapp_queue_worker() to postgres, service_role;

-- 4) Agenda execução a cada 1 minuto
select cron.unschedule('whatsapp-queue-every-minute')
where exists (
  select 1 from cron.job where jobname = 'whatsapp-queue-every-minute'
);

select cron.schedule(
  'whatsapp-queue-every-minute',
  '* * * * *',
  $$select public.trigger_whatsapp_queue_worker();$$
);

-- 5) Execução manual de teste (opcional)
-- select public.trigger_whatsapp_queue_worker();
