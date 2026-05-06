# process-whatsapp-queue

Worker de fila para campanhas WhatsApp.

## O que faz

- Busca posts `pending` que já venceram (`scheduled_at <= now`) ou imediatos (`scheduled_at is null`)
- Marca como `processing` (lock otimista)
- Envia para a W-API (texto ou imagem+legenda)
- Atualiza para `sent` ou `failed` com `last_error`

## Variáveis de ambiente (Edge Function)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WAPI_BASE_URL` (default: `https://api.w-api.app/v1`)
- `WAPI_TEXT_PATH` (default: `/instance/{{instanceId}}/message/send-text`)
- `WAPI_IMAGE_PATH` (default: `/instance/{{instanceId}}/message/send-image`)
- `WAPI_TIMEOUT_MS` (default: `15000`)

## Deploy

```bash
supabase functions deploy process-whatsapp-queue --no-verify-jwt
```

> O SQL em `supabase/whatsapp_scheduler_setup.sql` chama a function a cada 1 minuto via `pg_cron` + `pg_net`.
