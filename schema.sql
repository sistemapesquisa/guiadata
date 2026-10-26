-- =====================================================================
-- GuiaData PRO: Cloudflare D1 / SQLite Database Schema
-- Clean Architecture + High-Performance Caching + OpenRosa 1.0 Support
-- =====================================================================

-- 1. Projetos (Navegação Drill-Down)
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    client_name TEXT,
    sample_size INTEGER DEFAULT 0,
    status TEXT CHECK(status IN ('planejamento', 'em_campo', 'encerrado', 'pausado')) DEFAULT 'planejamento',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Formulários / Questionários (com Versionamento)
CREATE TABLE IF NOT EXISTS forms (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT CHECK(status IN ('rascunho', 'publicado', 'arquivado')) DEFAULT 'rascunho',
    questions_json TEXT NOT NULL,       -- Estrutura visual JSON das perguntas e lógicas
    settings_json TEXT DEFAULT '{}',    -- Configurações avançadas (áudio de fundo, trava GPS, etc.)
    category TEXT DEFAULT 'Eleitoral & Opinião Pública',
    year INTEGER DEFAULT 2026,
    xform_xml TEXT,                     -- XML pré-compilado ODK XForm (Cache de alta performance)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 3. Histórico de Versões do Questionário (Rollback)
CREATE TABLE IF NOT EXISTS form_versions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    questions_json TEXT NOT NULL,
    xform_xml TEXT,
    published_by TEXT,
    changelog TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(form_id) REFERENCES forms(id) ON DELETE CASCADE
);

-- 4. Usuários e RBAC com Permissões Granulares
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'pesquisador',   -- admin, coordenador, analista, supervisor, pesquisador, dev
    status TEXT CHECK(status IN ('ativo', 'inativo', 'removido')) DEFAULT 'ativo',
    permissions_json TEXT NOT NULL DEFAULT '{"can_create_projects":false,"can_view_maps":false,"can_export_data":false,"can_edit_forms":false,"can_manage_users":false}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Coletas / Submissões (Entrevistas de Campo)
CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    form_id TEXT NOT NULL,
    form_version INTEGER NOT NULL,
    researcher_id TEXT NOT NULL,
    device_id TEXT,
    latitude REAL,
    longitude REAL,
    data_json TEXT NOT NULL,             -- Respostas completas em JSON
    audio_path TEXT,                     -- URL ou chave R2/Drive da gravação de áudio
    media_files_json TEXT DEFAULT '[]',  -- Lista de fotos/assinaturas associadas
    status TEXT CHECK(status IN ('aprovado', 'em_analise', 'rejeitado', 'duplicado')) DEFAULT 'aprovado',
    audit_status TEXT DEFAULT 'pending', -- pending, certified, warning, rejected
    audit_notes TEXT DEFAULT '',
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(form_id) REFERENCES forms(id) ON DELETE CASCADE,
    FOREIGN KEY(researcher_id) REFERENCES users(id)
);

-- 6. Atribuições de Rotas de Campo
CREATE TABLE IF NOT EXISTS researcher_assignments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    researcher_id TEXT NOT NULL,
    form_id TEXT NOT NULL,
    quota_assigned INTEGER DEFAULT 0,
    quota_completed INTEGER DEFAULT 0,
    city TEXT NOT NULL,
    neighborhood TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(researcher_id) REFERENCES users(id),
    FOREIGN KEY(form_id) REFERENCES forms(id)
);

-- 7. Auditoria de Segurança e Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    details_json TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Gestão de Cotas Amostrais em Tempo Real (DATApesquise Engine)
CREATE TABLE IF NOT EXISTS quotas (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    variable TEXT NOT NULL,
    category TEXT NOT NULL,
    target_count INTEGER NOT NULL,
    current_count INTEGER NOT NULL DEFAULT 0,
    is_locked INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(form_id) REFERENCES forms(id) ON DELETE CASCADE
);

-- 9. Cargos e Permissões Customizadas (RBAC Dinâmico)
CREATE TABLE IF NOT EXISTS custom_roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    permissions_json TEXT NOT NULL
);

-- 10. Trilha de Auditoria Criptográfica em Cadeia (SHA-256 Chained Hash)
CREATE TABLE IF NOT EXISTS audit_trail (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    ip TEXT,
    details_json TEXT,
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 11. Central de Chamados e SLA VIP
CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY,
    client_name TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    sla_deadline DATETIME NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
);

-- 12. Configurações White-Label e Identidade Institucional
CREATE TABLE IF NOT EXISTS white_label_settings (
    id TEXT PRIMARY KEY,
    org_name TEXT NOT NULL,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#38bdf8',
    accent_color TEXT DEFAULT '#10b981',
    report_header TEXT DEFAULT 'Relatório Executivo de Inteligência Amostral',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices de Alta Performance (Evita queries lentas e sobrecarga)
CREATE INDEX IF NOT EXISTS idx_submissions_project ON submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_submissions_form ON submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_submissions_researcher ON submissions(researcher_id);
CREATE INDEX IF NOT EXISTS idx_submissions_date ON submissions(submitted_at);
CREATE INDEX IF NOT EXISTS idx_forms_project ON forms(project_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_quotas_form ON quotas(form_id);
