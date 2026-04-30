-- =======================================================================================
-- SISTEMA DE GERENCIAMENTO MULTIUSUÁRIO CORPORATIVO - MIGRAÇÃO ENTERPRISE
-- =======================================================================================

-- ---------------------------------------------------------------------------------------
-- PARTE 1: BACKUP COMPLETO DO BANCO EXISTENTE
-- Nota: Em um ambiente de produção real, use pg_dump. 
-- Aqui, criamos tabelas de backup no próprio banco como contingência imediata.
-- ---------------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS backup_schema;

-- Usando blocos DO para verificar a existência das tabelas antes do backup
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
        CREATE TABLE IF NOT EXISTS backup_schema.companies_bkp AS SELECT * FROM public.companies;
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'images') THEN
        CREATE TABLE IF NOT EXISTS backup_schema.images_bkp AS SELECT * FROM public.images;
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'music') THEN
        CREATE TABLE IF NOT EXISTS backup_schema.music_bkp AS SELECT * FROM public.music;
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'voiceovers') THEN
        CREATE TABLE IF NOT EXISTS backup_schema.voiceovers_bkp AS SELECT * FROM public.voiceovers;
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        CREATE TABLE IF NOT EXISTS backup_schema.profiles_bkp AS SELECT * FROM public.profiles;
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'company_usage') THEN
        CREATE TABLE IF NOT EXISTS backup_schema.company_usage_bkp AS SELECT * FROM public.company_usage;
    END IF;
END $$;

-- ---------------------------------------------------------------------------------------
-- PARTE 2: CRIAÇÃO DE NOVAS TABELAS E RELACIONAMENTOS (MODELO DE DADOS ROBUSTO)
-- ---------------------------------------------------------------------------------------

-- Tabela de permissões/roles
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inserindo as roles específicas exigidas
INSERT INTO public.roles (name, description) VALUES 
('master_admin', 'Administrador e dono do sistema'),
('admin_empresa', 'Administrador exclusivo da própria empresa'),
('editor', 'Editor de conteúdo multimídia da empresa'),
('visualizador', 'Acesso somente leitura aos conteúdos da empresa')
ON CONFLICT (name) DO NOTHING;

-- Tabela de Usuários (Customizada para refletir os requisitos de autenticação segura solicitados, 
-- embora a autenticação real no Supabase seja feita via auth.users, esta tabela mantém os metadados enterprise)
CREATE TABLE IF NOT EXISTS public.enterprise_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT, -- Usado se a autenticação for externa ao Supabase
    password_salt TEXT,
    session_token TEXT,
    session_expires_at TIMESTAMPTZ,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret TEXT,
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de Associação Many-to-Many entre Usuários e Empresas (Isolamento de Dados)
CREATE TABLE IF NOT EXISTS public.user_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.enterprise_users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(id),
    is_active BOOLEAN DEFAULT TRUE,
    activated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, company_id) -- Um usuário tem apenas uma role ativa por empresa específica
);

-- Tabela de Auditoria para rastreamento de operações críticas
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.enterprise_users(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de Sessões (Controle de Múltiplos Dispositivos)
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.enterprise_users(id) ON DELETE CASCADE,
    device_info TEXT,
    ip_address INET,
    refresh_token TEXT UNIQUE NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adicionando metadados organizacionais e quotas na tabela de empresas
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT DEFAULT 5368709120, -- 5GB default
ADD COLUMN IF NOT EXISTS max_users INT DEFAULT 10,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS domain VARCHAR(255) UNIQUE;

-- ---------------------------------------------------------------------------------------
-- PARTE 3: MIGRAÇÃO DE DADOS EXISTENTES PARA NOVO SCHEMA
-- ---------------------------------------------------------------------------------------

-- Migrar usuários da auth.users e profiles existentes para enterprise_users
INSERT INTO public.enterprise_users (auth_user_id, email, created_at, updated_at)
SELECT u.id, u.email, u.created_at, u.updated_at
FROM auth.users u
LEFT JOIN public.enterprise_users eu ON u.id = eu.auth_user_id
WHERE eu.id IS NULL;

-- Associar usuários às empresas com base na tabela profiles antiga (se ela existir)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        -- Tenta migrar os dados usando SQL dinâmico para evitar erro de compilação caso a tabela não exista
        EXECUTE '
        INSERT INTO public.user_companies (user_id, company_id, role_id)
        SELECT 
            eu.id,
            p.company_id,
            CASE 
                WHEN p.role = ''master_admin'' THEN (SELECT id FROM public.roles WHERE name = ''master_admin'')
                ELSE (SELECT id FROM public.roles WHERE name = ''admin_empresa'')
            END
        FROM public.profiles p
        JOIN public.enterprise_users eu ON p.id = eu.auth_user_id
        WHERE p.company_id IS NOT NULL
        ON CONFLICT (user_id, company_id) DO NOTHING;
        ';
    END IF;
END $$;

-- ---------------------------------------------------------------------------------------
-- PARTE 4: CRIAÇÃO DE VIEWS PARA SIMPLIFICAR QUERIES
-- ---------------------------------------------------------------------------------------

-- View para facilitar a listagem de usuários e suas permissões nas empresas
CREATE OR REPLACE VIEW public.vw_company_users AS
SELECT 
    uc.company_id,
    c.name AS company_name,
    eu.id AS user_id,
    eu.email,
    r.name AS role_name,
    uc.is_active
FROM public.user_companies uc
JOIN public.enterprise_users eu ON uc.user_id = eu.id
JOIN public.companies c ON uc.company_id = c.id
JOIN public.roles r ON uc.role_id = r.id;

-- View para consumo de quota por empresa
CREATE OR REPLACE VIEW public.vw_company_storage_usage AS
SELECT 
    c.id AS company_id,
    c.name AS company_name,
    c.storage_quota_bytes,
    COALESCE(SUM(pg_column_size(i.*)), 0) + COALESCE(SUM(pg_column_size(m.*)), 0) AS used_bytes
FROM public.companies c
LEFT JOIN public.images i ON c.id = i.company_id
LEFT JOIN public.music m ON c.id = m.company_id
GROUP BY c.id, c.name, c.storage_quota_bytes;

-- ---------------------------------------------------------------------------------------
-- PARTE 5: CRIAÇÃO DE ÍNDICES E OTIMIZAÇÕES
-- ---------------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_enterprise_users_auth_id ON public.enterprise_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_user ON public.user_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_company ON public.user_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON public.audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions(user_id);

-- Habilitar RLS nas novas tabelas
ALTER TABLE public.enterprise_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS rigorosas para garantir isolamento absoluto (Tenancy Isolation)
-- 1. Usuários só podem ver seus próprios dados
CREATE POLICY "Users can view own data" ON public.enterprise_users
    FOR SELECT USING (auth_user_id = auth.uid());

-- 2. Associação Usuário-Empresa visível para membros da mesma empresa ou master_admin
CREATE POLICY "User-Company association visibility" ON public.user_companies
    FOR SELECT USING (
        user_id IN (SELECT id FROM public.enterprise_users WHERE auth_user_id = auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_companies uc
            JOIN public.enterprise_users eu ON uc.user_id = eu.id
            JOIN public.roles r ON uc.role_id = r.id
            WHERE eu.auth_user_id = auth.uid() AND r.name = 'master_admin'
        )
    );

-- 3. Auditoria visível apenas para admins da empresa ou master_admin
CREATE POLICY "Audit logs visibility" ON public.audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_companies uc
            JOIN public.enterprise_users eu ON uc.user_id = eu.id
            JOIN public.roles r ON uc.role_id = r.id
            WHERE eu.auth_user_id = auth.uid() 
            AND uc.company_id = audit_logs.company_id
            AND r.name IN ('master_admin', 'admin_empresa')
        )
    );

-- Trigger para inserir log de auditoria automaticamente em operações críticas (Exemplo: update na company)
CREATE OR REPLACE FUNCTION log_company_changes() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.audit_logs (company_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (NEW.id, 'UPDATE', 'company', NEW.id, row_to_json(OLD), row_to_json(NEW));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_company_update ON public.companies;
CREATE TRIGGER trg_audit_company_update
AFTER UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION log_company_changes();

-- ---------------------------------------------------------------------------------------
-- PARTE 6: SCRIPTS DE ROLLBACK PARA CONTINGÊNCIA
-- (A serem executados apenas em caso de falha na migração)
-- ---------------------------------------------------------------------------------------
/*
-- DESCOMENTE PARA EXECUTAR O ROLLBACK
DROP VIEW IF EXISTS public.vw_company_users;
DROP VIEW IF EXISTS public.vw_company_storage_usage;

DROP TABLE IF EXISTS public.user_sessions CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.user_companies CASCADE;
DROP TABLE IF EXISTS public.enterprise_users CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;

ALTER TABLE public.companies 
DROP COLUMN IF EXISTS storage_quota_bytes,
DROP COLUMN IF EXISTS max_users,
DROP COLUMN IF EXISTS is_active,
DROP COLUMN IF EXISTS domain;

-- Restaurar dados se necessário
-- TRUNCATE public.companies CASCADE;
-- INSERT INTO public.companies SELECT * FROM backup_schema.companies_bkp;
-- DROP SCHEMA backup_schema CASCADE;
*/
