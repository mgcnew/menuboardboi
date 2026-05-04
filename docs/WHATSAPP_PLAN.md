# Plano de Implementação da Tab "WhatsApp"

> **Observação**: Pretende-se usar a **w-API** como provedor de API do WhatsApp para este projeto.

---

## 🎯 Objetivo Principal
Criar uma seção para gerenciar banners de propaganda, programar e enviar postagens manual/automaticamente via WhatsApp.

---

## 🏗️ Fase 1: Definição da Arquitetura e Estrutura de Dados

### 1.1 Tabelas do Banco de Dados (Supabase)
Crie as seguintes tabelas no seu schema:

#### Tabela `whatsapp_banners`
Armazena os banners de propaganda:

| Campo          | Tipo      | Descrição                                        |
|----------------|-----------|--------------------------------------------------|
| `id`           | UUID      | Chave primária                                   |
| `company_id`   | UUID      | FK para `companies`                              |
| `name`         | VARCHAR   | Nome identificador do banner                     |
| `file_url`     | TEXT      | URL do arquivo de imagem                        |
| `file_size`    | BIGINT    | Tamanho do arquivo (bytes)                      |
| `created_at`   | TIMESTAMP | Data de criação                                  |
| `updated_at`   | TIMESTAMP | Data de atualização                              |

#### Tabela `whatsapp_post_templates`
Templates de mensagens para reutilizar:

| Campo          | Tipo      | Descrição                                        |
|----------------|-----------|--------------------------------------------------|
| `id`           | UUID      | Chave primária                                   |
| `company_id`   | UUID      | FK para `companies`                              |
| `name`         | VARCHAR   | Nome do template                                 |
| `message_text` | TEXT      | Texto da mensagem                                |
| `created_at`   | TIMESTAMP | Data de criação                                  |

#### Tabela `whatsapp_contacts`
Lista de contatos/segmentos:

| Campo             | Tipo      | Descrição                                        |
|-------------------|-----------|--------------------------------------------------|
| `id`              | UUID      | Chave primária                                   |
| `company_id`      | UUID      | FK para `companies`                              |
| `name`            | VARCHAR   | Nome do contato/grupo                            |
| `phone_numbers`   | TEXT[]    | Lista de números de telefone                    |
| `segment`         | VARCHAR   | Segmento (ex: "VIP", "Novos Clientes")         |
| `created_at`      | TIMESTAMP | Data de criação                                  |

#### Tabela `whatsapp_posts`
Histórico e programação de postagens:

| Campo             | Tipo      | Descrição                                        |
|-------------------|-----------|--------------------------------------------------|
| `id`              | UUID      | Chave primária                                   |
| `company_id`      | UUID      | FK para `companies`                              |
| `banner_id`       | UUID      | FK para `whatsapp_banners` (opcional)          |
| `template_id`     | UUID      | FK para `whatsapp_post_templates` (opcional)   |
| `message_text`    | TEXT      | Texto da mensagem (se não usar template)        |
| `recipient_ids`   | UUID[]    | FK para `whatsapp_contacts`                     |
| `scheduled_at`    | TIMESTAMP | Data/hora programada (nulo se for envio manual)|
| `status`          | VARCHAR   | pending, sent, failed, cancelled                |
| `sent_at`         | TIMESTAMP | Data/hora real de envio                          |
| `recipient_count` | INT       | Número de destinatários                          |
| `created_at`      | TIMESTAMP | Data de criação                                  |
| `updated_at`      | TIMESTAMP | Data de atualização                              |

#### Tabela `whatsapp_credentials`
Credenciais da API (para a w-API):

| Campo             | Tipo      | Descrição                                        |
|-------------------|-----------|--------------------------------------------------|
| `id`              | UUID      | Chave primária                                   |
| `company_id`      | UUID      | FK para `companies`                              |
| `provider`        | VARCHAR   | "w-api" (provedor selecionado)                  |
| `api_key`         | TEXT      | Chave da API (criptografada!)                   |
| `instance_id`     | TEXT      | ID da instância na w-API                         |
| `phone_number`    | VARCHAR   | Número de telefone conectado                     |
| `is_active`       | BOOLEAN   | Se as credenciais estão ativas                  |
| `created_at`      | TIMESTAMP | Data de criação                                  |

---

## 🎨 Fase 2: Design da Interface (Tab "WhatsApp")

### Seção 1: Gerenciar Banners
- Upload de imagens (com validação de formato e tamanho)
- Listagem de banners com preview
- Ações: Editar, Excluir, Usar em postagem

### Seção 2: Templates de Mensagens
- Criar/editar templates de texto
- Preview do template
- Ações: Usar em postagem, Excluir

### Seção 3: Contatos e Segmentos
- Adicionar/editar contatos individuais ou grupos
- Importar lista de contatos via CSV
- Filtrar por segmento

### Seção 4: Programar e Enviar Postagens
- **Formulário de Envio**:
  - Selecionar banner (ou nenhum)
  - Selecionar template ou escrever texto personalizado
  - Selecionar destinatários (contatos ou segmentos)
- **Calendário de Programação**:
  - Selecionar data/hora
  - Opção de repetição (diária, semanal, mensal)
- **Lista de Postagens**:
  - Status: Pendente (com contador regressivo), Enviada, Falha, Cancelada
  - Ações: Cancelar (se pendente), Reenviar (se falhou)

### Seção 5: Histórico e Métricas
- Histórico completo de todas as postagens
- Filtros por data, status, destinatários
- Gráficos simples (ex: número de postagens por mês, taxa de sucesso)

---

## 🔧 Fase 3: Implementação Técnica

### 3.1 Provedor de API Selecionado: w-API
Use a **w-API** como provedor de API do WhatsApp. Documentação oficial: https://w-api.io/

### 3.2 Automatização (Cron Jobs)
Use uma das opções:
1. **Supabase Edge Functions + pg_cron**: Mais fácil se já usa o Supabase
   - Crie uma função Edge que verifica a tabela `whatsapp_posts` a cada minuto
   - Use `pg_cron` para agendar a execução
2. **Vercel Cron Jobs**: Se hospedar no Vercel
3. **AWS Lambda + EventBridge**: Para escala enterprise

### 3.3 Segurança e Compliance
- **Criptografe as credenciais**: Nunca armazene chaves de API em texto plano
- **Controle de acesso**: Apenas admins da empresa podem acessar a tab WhatsApp
- **Respeite a LGPD**: Tenha um termo de consentimento para os contatos
- **Limites de taxa**: Evite bloqueios, implemente um limite de mensagens por hora/dia (conforme regras da w-API)

---

## 📅 Fase 4: Roadmap de Implementação (Ordem Recomendada)

1. **Mês 1**: Estrutura básica
   - Criar tabelas no Supabase
   - Adicionar tab "WhatsApp" na interface
   - Implementar gerenciamento de banners e templates

2. **Mês 2**: Envio manual
   - Integrar com a w-API (configurar credenciais e instância)
   - Implementar formulário de envio manual
   - Adicionar lista de contatos

3. **Mês 3**: Automatização
   - Implementar cron jobs para postagens programadas
   - Adicionar calendário visual
   - Histórico completo de postagens

4. **Mês 4**: Melhorias e escala
   - Adicionar métricas e gráficos
   - Segmentação avançada de contatos
   - Import/export de CSV
   - Melhorias na experiência do usuário

---

## 💡 Dicas Extra para Ficar TOP
1. **Preview em Mockup**: Mostre um exemplo visual de como a mensagem vai ficar no WhatsApp
2. **Validação de Números**: Use uma API (ex: Numverify) para verificar se o número é válido
3. **Notificações**: Adicione alertas no sistema quando uma postagem for enviada ou falhar
4. **Backup**: Sempre faça backup das postagens e contatos
5. **Testes A/B**: Permita testar duas versões de uma mesma propaganda para ver qual tem melhor desempenho
6. **Monitoramento da w-API**: Adicione uma página para verificar o status da instância na w-API (se está conectada, nível de bateria, etc.)
