# Preparação para Integração com API do WhatsApp

Este documento detalha o estado atual do módulo de WhatsApp no projeto e as preparações realizadas para facilitar a futura integração com um provedor de API (como a W-API).

## 1. Estrutura do Banco de Dados (Supabase)
Foi gerado o script SQL `supabase/whatsapp_schema.sql` que contém todas as tabelas e políticas de segurança (RLS) necessárias.
- `whatsapp_banners`: Armazena as imagens de propagandas específicas para envio no WhatsApp.
- `whatsapp_post_templates`: Textos pré-definidos para agilizar as campanhas.
- `whatsapp_contacts`: Armazena listas de transmissão, contatos e seus segmentos.
- `whatsapp_posts`: Histórico e agendamentos de disparos de mensagens. Controla o estado (`pending`, `sent`, `failed`, `cancelled`).
- `whatsapp_credentials`: Tabela segura com RLS para armazenar as credenciais da API (API Key, Instance ID, etc) isoladas por `company_id`.

## 2. Tipagens no TypeScript (`src/types.ts`)
Todas as interfaces foram mapeadas exatamente como o modelo de dados:
- `WhatsAppBanner`
- `WhatsAppPostTemplate`
- `WhatsAppContact`
- `WhatsAppPost`
- `WhatsAppCredentials`

Essa forte tipagem garante que a futura manipulação de dados entre o Frontend e as Edge Functions do Supabase seja type-safe.

## 3. Frontend e UI (`src/components/WhatsAppTab.tsx`)
A interface foi construída em formato de abas internas modulares:
- **Banners**: Permite gerenciar as imagens (UI mockada, pronta para receber funções de upload).
- **Templates**: Gerenciamento de textos.
- **Contatos**: Listagem de números e segmentação.
- **Postagens (Agendamento)**: Formulário completo para agendar envios. Já possui as tags visuais de status (Sucesso, Pendente, Falha).
- **Configuração da API**: Aba preparada para o usuário inserir as credenciais da `w-api.io`.

O componente já utiliza `useEffect` para buscar os dados via `supabase.from('...')`, o que significa que assim que você inserir dados nas tabelas e conectar a API real, a interface se adaptará imediatamente sem a necessidade de reescrever as views.

## 4. Próximos Passos (Integração Backend)
Como não foram implementadas lógicas de integração nesta fase, as próximas etapas necessárias serão:
1. **Edge Functions (Supabase)**: Criar uma função para processar as mensagens (ler de `whatsapp_posts` onde o `status` é `pending` e a data de `scheduled_at` já passou).
2. **Cron Jobs**: Configurar o `pg_cron` no Supabase para chamar a Edge Function a cada 1 minuto.
3. **Comunicação com W-API**: Dentro da Edge Function, ler a tabela `whatsapp_credentials`, descriptografar a `api_key` e fazer o `POST` para a API da W-API enviando os dados (mensagem, mídia e destinatários).
4. **Atualização de Status**: Atualizar a tabela `whatsapp_posts` para `sent` ou `failed` dependendo do response da W-API.
