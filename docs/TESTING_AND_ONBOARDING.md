# Plano de Testes e Processo de Onboarding Enterprise

Este documento detalha o plano de testes exaustivos para a arquitetura multi-tenant e o processo de onboarding de novas empresas.

## 1. Estratégia de Testes Exaustivos

### 1.1. Testes de Isolamento de Dados (Tenant Isolation / Penetration Testing)
O objetivo principal é garantir que os usuários de uma empresa não consigam acessar os dados ou mídias de outras empresas.
- **Teste de Acesso Cruzado Direto:** Tentar acessar o Painel de Controle utilizando o ID de uma empresa diferente com um token de sessão não autorizado. (Espera-se `403 Forbidden` do Row Level Security).
- **Teste de Manipulação de API:** Fazer requisições diretas via cURL/Postman modificando o `company_id` nos payloads de inserção/deleção. (Espera-se bloqueio via policies do banco).
- **Teste de Acesso ao Storage:** Tentar baixar ou listar imagens/músicas do bucket do Supabase de outro tenant sem possuir permissão daquela role.

### 1.2. Testes de Carga e Performance (Load Testing)
Garantir estabilidade e responsividade de todo o sistema sob estresse:
- **Cenário Principal:** 100 usuários concorrentes (painéis administrativos) fazendo uploads de imagens, e 1.000 TVs (endpoints públicos de reprodução) fazendo requests de heartbeat e listagem de media simultaneamente.
- **Ferramentas Recomendadas:** K6 ou Artillery.
- **Métricas Alvo:**
  - Tempo de Resposta (P95) para leitura do schema: `< 200ms`
  - Tempo de Resposta (P95) para upload (excluindo compressão frontend): `< 2s`
  - Zero falhas de "Tenant Leak" (vazamento de informações).

### 1.3. Recuperação de Desastres e Escalabilidade
- **Backups Contínuos:** Verificar os logs do Supabase PITR (Point in Time Recovery). Testar a restauração da base para os últimos 5 minutos (Tabelas: `companies`, `enterprise_users`, `user_companies`).
- **Escalabilidade Horizontal:** Como o Supabase e o banco de dados estão desacoplados da CDN (que serve os assets estáticos de imagens/áudio), certifique-se de que a API de borda possui cache ativado.

---

## 2. Processo de Onboarding Manual (Administrador Master)

O processo atual foi desenhado para ser executado pelo Administrador do Sistema (`master_admin`), garantindo controle de qualidade.

1. **Acesso ao Painel Master:**
   - O `master_admin` entra no sistema via componente de Autenticação.
   - O sistema detecta a role `master_admin` e habilita a aba exclusiva "Empresa".

2. **Criação do Tenant:**
   - Na aba "Empresa", o Admin preenche o nome da nova organização.
   - Ao clicar em "Adicionar", o backend:
     - Gera automaticamente um `access_code` seguro (ex: 4 dígitos) para as TVs.
     - Cria um `id` único do tipo UUID v4 para o banco de dados.
     - Isola logicamente os dados no banco usando RLS.

3. **Definição de Quotas e Metadados (Configurações Padrão):**
   - O sistema define a quota default para 5GB (expansível no futuro).
   - O Admin pode gerar links diretos (`/1234`) para repassar ao cliente final configurar suas TVs.

4. **Atribuição de Acesso:**
   - O cliente final (Dono da Empresa X) é cadastrado e recebe a role `admin_empresa` atrelada ao `company_id` gerado.

---

## 3. Preparação para Futura Automação via API RESTful

A estrutura atual do banco de dados (visível em `enterprise_migration.sql`) está totalmente preparada para suportar automação futura B2B (ex: onboarding automático via site com pagamento via Stripe/Pagar.me):

- **Campos Preparados:** As tabelas contêm metadados como `is_active`, `domain`, `storage_quota_bytes`, `max_users`.
- **Validação de CNPJ e Compliance:** 
  - Pode-se adicionar facilmente a coluna `cnpj` na tabela `companies`.
  - A integração via Edge Functions do Supabase (ou Webhooks) poderá interceptar a criação de novas empresas para validar o CNPJ junto à Receita Federal e registrar na tabela de auditoria (`audit_logs`) o resultado do compliance check.
