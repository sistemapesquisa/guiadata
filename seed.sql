-- =========================================================================
-- GuiaData PRO: Initial Seed Data for Cloudflare D1
-- =========================================================================

-- 1. Usuários Principais (Admin, DEV, Pesquisadora)
INSERT OR REPLACE INTO users (id, name, email, password_hash, role, status, permissions_json)
VALUES 
('admin_user', 'Clara Admin', 'sistemagithub@gmail.com', 'admin123', 'Admin', 'ativo', '{"can_create_projects":true,"can_view_maps":true,"can_export_data":true,"can_edit_forms":true,"can_manage_users":true}'),
('user_admin', 'Clara Admin', 'admin@guiadata.com', 'admin123', 'Admin', 'ativo', '{"can_create_projects":true,"can_view_maps":true,"can_export_data":true,"can_edit_forms":true,"can_manage_users":true}'),
('dev_user', 'Gustavo Dev', 'dev@guiadata.com', 'dev123', 'DEV', 'ativo', '{"can_create_projects":true,"can_view_maps":true,"can_export_data":true,"can_edit_forms":true,"can_manage_users":true}'),
('researcher_1', 'Ana Pesquisadora', 'ana@guiadata.com', 'pesquisa123', 'Researcher', 'ativo', '{"can_create_projects":false,"can_view_maps":true,"can_export_data":false,"can_edit_forms":false,"can_manage_users":false}'),
('odk_collector', 'Agente ODK Collect', 'odk@guiadata.com', 'pesquisa123', 'Researcher', 'ativo', '{"can_create_projects":false,"can_view_maps":true,"can_export_data":false,"can_edit_forms":false,"can_manage_users":false}'),
('pesquisador_1', 'Pesquisador Web', 'web@guiadata.com', 'pesquisa123', 'Researcher', 'ativo', '{"can_create_projects":false,"can_view_maps":true,"can_export_data":false,"can_edit_forms":false,"can_manage_users":false}');

-- 2. Projeto Principal
INSERT OR REPLACE INTO projects (id, name, description, client_name, sample_size, status)
VALUES
('proj_eleicao_2026', 'Pesquisa Eleitoral Majoritária 2026', 'Levantamento de intenção de voto municipal e estadual.', 'Instituto Opinião & Análise', 1500, 'em_campo');

-- 3. Formulário / Questionário Publicado
INSERT OR REPLACE INTO forms (id, project_id, title, version, status, questions_json, category, year)
VALUES
('form_eleicao_2026', 'proj_eleicao_2026', 'Pesquisa de Opinião e Intenção de Voto 2026', 1, 'publicado', '[{"id":"q1","title":"Qual a sua faixa etária?","type":"single_choice","options":["16 a 24 anos","25 a 34 anos","35 a 59 anos","60 anos ou mais"],"required":true},{"id":"q2","title":"Como você avalia a atual gestão municipal?","type":"single_choice","options":["Ótima","Boa","Regular","Ruim","Péssima"],"required":true},{"id":"q3","title":"Em quem você votaria para prefeito se a eleição fosse hoje?","type":"single_choice","options":["Candidato A","Candidato B","Candidato C","Branco / Nulo","Indeciso"],"required":true}]', 'Eleitoral & Opinião Pública', 2026);

-- 4. Submissões / Entrevistas de Teste
INSERT OR REPLACE INTO submissions (id, project_id, form_id, form_version, researcher_id, device_id, latitude, longitude, data_json, status, audit_status)
VALUES
('sub_001', 'proj_eleicao_2026', 'form_eleicao_2026', 1, 'researcher_1', 'sim_dev_1', -23.5505, -46.6333, '{"q1":"25 a 34 anos","q2":"Boa","q3":"Candidato A"}', 'aprovado', 'certified'),
('sub_002', 'proj_eleicao_2026', 'form_eleicao_2026', 1, 'researcher_1', 'sim_dev_2', -23.5520, -46.6350, '{"q1":"35 a 59 anos","q2":"Ótima","q3":"Candidato A"}', 'aprovado', 'certified'),
('sub_003', 'proj_eleicao_2026', 'form_eleicao_2026', 1, 'researcher_1', 'sim_dev_3', -23.5480, -46.6310, '{"q1":"16 a 24 anos","q2":"Regular","q3":"Candidato B"}', 'aprovado', 'certified');

-- 5. Atribuição de Rota
INSERT OR REPLACE INTO researcher_assignments (id, project_id, researcher_id, form_id, quota_assigned, quota_completed, city, neighborhood)
VALUES
('rt_01', 'proj_eleicao_2026', 'researcher_1', 'form_eleicao_2026', 50, 3, 'São Paulo', 'Centro Histórico');

-- 6. Cotas Amostrais Padrão
INSERT OR REPLACE INTO quotas (id, form_id, variable, category, target_count, current_count, is_locked)
VALUES
('q_faixa_1', 'form_eleicao_2026', 'q1', '16 a 24 anos', 100, 1, 0),
('q_faixa_2', 'form_eleicao_2026', 'q1', '25 a 34 anos', 150, 1, 0),
('q_faixa_3', 'form_eleicao_2026', 'q1', '35 a 59 anos', 200, 1, 0),
('q_faixa_4', 'form_eleicao_2026', 'q1', '60 anos ou mais', 100, 0, 0);

-- 7. White-Label Settings
INSERT OR REPLACE INTO white_label_settings (id, org_name, logo_url, primary_color, accent_color, report_header)
VALUES
('wl_default', 'GuiaData PRO', '', '#38bdf8', '#10b981', 'Relatório Executivo de Inteligência Amostral');
