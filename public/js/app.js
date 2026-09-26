/* =========================================================
   GuiaData — Plataforma de Pesquisa de Campo
   app.js — Core Application Logic
   ========================================================= */

// ===================== STATE =====================
const state = {
  activeRole: null,
  activeUserId: null,
  activeUserName: null,
  forms: [],
  interviews: [],
  users: [],
  logs: [],
  activeForm: { id: '', title: '', status: 'draft', version: 1, questions: [], category: 'geral', year: new Date().getFullYear() },
  filterYear: 'all',
  filterCategory: 'all',
  dashboardFilterStatus: 'all',
  dashboardSearchQuery: '',
  simSelectedFormId: '',
  simActiveForm: null,
  simAnswers: {},
  simCurrentQuestionIdx: 0,
  simOfflineQueue: [],
  simIsOnline: true,
  simAudioFile: null,
  simIsRecording: false,
  map: null,
  mapMarkers: [],
  statusChart: null
};

const MOCK_USER_IDS = {
  DEV: 'dev_user', Admin: 'admin_user', Analyst: 'analyst_user',
  Coordinator: 'coord_user', Supervisor: 'super_user', Researcher: 'researcher_1'
};
const MOCK_USER_NAMES = {
  DEV: 'Gustavo Dev', Admin: 'Clara Admin', Researcher: 'Ana Pesquisadora'
};
const ROLE_LABELS = {
  DEV: 'Suporte Técnico', Admin: 'Administrador', Researcher: 'Pesquisador'
};
const RESEARCHER_COLORS = {
  researcher_1: '#ef4444', researcher_2: '#7c3aed',
  researcher_3: '#059669', researcher_4: '#0284c7'
};
const STATUS_LABELS = { approved: 'Aprovada', pending: 'Pendente', rejected: 'Rejeitada' };


function validateSkipLogicLocal(questions) {
  const feedback = [];
  const idToIdx = new Map();
  questions.forEach((q, i) => idToIdx.set(q.id, i));
  questions.forEach((q, idx) => {
    if (!q.skipRules) return;
    q.skipRules.forEach(rule => {
      if (!rule.targetQuestionId) { feedback.push({ type:'ERROR', message:`Pergunta "${q.id}" tem regra de pulo sem destino.` }); return; }
      if (!idToIdx.has(rule.targetQuestionId)) { feedback.push({ type:'ERROR', message:`Pergunta "${q.id}" pula para "${rule.targetQuestionId}" que não existe.` }); return; }
      if (rule.targetQuestionId === q.id) { feedback.push({ type:'ERROR', message:`Pergunta "${q.id}" pula para ela mesma (loop infinito).` }); }
      if (idToIdx.get(rule.targetQuestionId) < idx) { feedback.push({ type:'WARNING', message:`Pergunta "${q.id}" pula para trás. Pode causar loops.` }); }
      if ((q.type==='single_choice'||q.type==='multiple_choice') && rule.conditionValue && !q.options.includes(rule.conditionValue)) {
        feedback.push({ type:'WARNING', message:`Regra em "${q.id}" depende da opção "${rule.conditionValue}" que não existe.` });
      }
    });
  });
  return feedback;
}

async function apiFetch(endpoint, options = {}) {
  try {
    const headers = { 'Content-Type':'application/json', 'x-user-role':state.activeRole, 'x-user-id':state.activeUserId, ...(options.headers||{}) };
    const token = localStorage.getItem('auth_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(endpoint, { ...options, headers });
    if (!res.ok) {
      if (res.status === 403) throw new Error('Você não tem permissão para esta ação.');
      if (res.status >= 500) throw new Error('Ocorreu um erro interno. Tente novamente.');
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Algo deu errado.');
    }
    // Handle 204 No Content
    if (res.status === 204) return { success: true };
    return await res.json();
  } catch (err) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      throw new Error('Servidor indisponível. Verifique se o backend está rodando.');
    }
    throw err;
  }
}

// ===================== AUTHENTICATION =====================
window.fazerLogin = async () => {
  const userEl = document.getElementById('login-username');
  const passEl = document.getElementById('login-password');
  const username = userEl.value.trim();
  const password = passEl.value;

  if (!username || !password) {
    return showToast('error', 'Preencha o usuário e a senha.');
  }

  const btn = document.getElementById('btn-login');
  const oldText = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Entrando...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao realizar login');

    localStorage.setItem('auth_user', JSON.stringify(data.user));
    if (data.token) localStorage.setItem('auth_token', data.token);
    state.activeRole = data.user.role;
    state.activeUserId = data.user.id;
    state.activeUserName = data.user.name;

    document.querySelector('.sidebar').style.display = 'flex';
    document.querySelector('.main-content').style.marginLeft = 'var(--sidebar-w)';
    
    // Switch to dashboard immediately
    switchTab('view-dashboard');

    try { await loadServerData(); } catch(e) { console.error('loadServerData error:', e); }
    try { updateUserUI(); } catch(e) { console.error('updateUserUI error:', e); }
    try { applyRoleRestrictions(); } catch(e) { console.error('applyRoleRestrictions error:', e); }
    try { renderDashboard(); } catch(e) { console.error('renderDashboard error:', e); }
    try { initFormBuilder(); } catch(e) { console.error('initFormBuilder error:', e); }
    try { renderFormBuilderList(); } catch(e) { console.error('renderFormBuilderList error:', e); }
    try { if (state.forms.length > 0) loadFormIntoBuilder(state.forms[0]); } catch(e) { console.error('loadFormIntoBuilder error:', e); }
    try { initMobileSimulator(); } catch(e) { console.error('initMobileSimulator error:', e); }
    try { initDataExporter(); } catch(e) { console.error('initDataExporter error:', e); }
    try { renderAudioReviewList(); } catch(e) { console.error('renderAudioReviewList error:', e); }
    
    if (typeof window.initWebSocket === 'function') {
      try { window.initWebSocket(); } catch(e) {}
    }

    showToast('success', 'Bem-vindo(a) ao GuiaData!');
  } catch (err) {
    showToast('error', err.message);
  } finally {
    btn.innerHTML = oldText;
    btn.disabled = false;
  }
};

window.logout = () => {
  localStorage.removeItem('auth_user');
  localStorage.removeItem('auth_token');
  state.activeRole = null;
  state.activeUserId = null;
  state.activeUserName = null;
  document.querySelector('.sidebar').style.display = 'none';
  document.querySelector('.main-content').style.marginLeft = '0';
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  switchTab('view-login');
};

// ===================== TOAST SYSTEM =====================
function showToast(type, message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const iconMap = { success:'fa-circle-check', error:'fa-circle-xmark', warning:'fa-triangle-exclamation', info:'fa-circle-info' };
  // Map old severity names
  if (type === 'LOW') type = 'info';
  else if (type === 'MEDIUM') type = 'warning';
  else if (type === 'HIGH' || type === 'CRITICAL') type = 'error';
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fa-solid ${iconMap[type]||iconMap.info} toast-icon"></i><span class="toast-msg">${message}</span><button class="toast-close" onclick="this.parentElement.remove()">&times;</button>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 300); }, 4500);
}

// ===================== CONFIRM MODAL =====================
function showConfirm(title, message, onConfirm, options = {}) {
  const overlay = document.getElementById('confirm-modal');
  const iconEl = document.getElementById('confirm-modal-icon');
  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-message');
  const confirmBtn = document.getElementById('confirm-modal-confirm');
  const cancelBtn = document.getElementById('confirm-modal-cancel');

  titleEl.textContent = title;
  msgEl.textContent = message;
  const type = options.type || 'warning';
  iconEl.className = `modal-icon ${type}`;
  const icons = { warning:'fa-triangle-exclamation', danger:'fa-trash', info:'fa-circle-info' };
  iconEl.innerHTML = `<i class="fa-solid ${icons[type]||icons.warning}"></i>`;
  confirmBtn.textContent = options.confirmText || 'Confirmar';
  confirmBtn.className = type === 'danger' ? 'btn btn-danger-solid' : 'btn btn-primary';
  cancelBtn.textContent = options.cancelText || 'Cancelar';
  overlay.classList.add('active');

  const cleanup = () => { overlay.classList.remove('active'); confirmBtn.onclick = null; cancelBtn.onclick = null; };
  confirmBtn.onclick = () => { cleanup(); onConfirm(); };
  cancelBtn.onclick = cleanup;
}

function setButtonLoading(btn, loading) {
  if (loading) { btn.classList.add('loading'); btn.disabled = true; }
  else { btn.classList.remove('loading'); btn.disabled = false; }
}

// ===================== DATA LOADING =====================
async function loadServerData() {
  try {
    const [users, forms, interviews] = await Promise.all([
      apiFetch('/api/users').catch(e => { console.warn('apiFetch users error:', e); return []; }),
      apiFetch('/api/forms').catch(e => { console.warn('apiFetch forms error:', e); return []; }),
      apiFetch('/api/interviews').catch(e => { console.warn('apiFetch interviews error:', e); return []; })
    ]);
    state.users = users || [];
    state.forms = forms || [];
    state.interviews = interviews || [];
  } catch (err) { console.error('Erro ao carregar dados:', err); }
}

// ===================== NAVIGATION =====================
window.switchTab = function switchTab(targetId) {
  document.querySelectorAll('.view-panel').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
  const panel = document.getElementById(targetId);
  if (panel) {
    panel.classList.add('active');
    if (targetId === 'view-login' || targetId === 'view-project-details') {
      panel.style.display = 'flex';
    } else {
      panel.style.display = 'block';
    }
  }
  const navItem = document.querySelector(`.nav-item[data-target="${targetId}"]`);
  if (navItem) navItem.classList.add('active');
  // Close mobile sidebar
  document.getElementById('sidebar')?.classList.remove('mobile-open');
  // Leaflet resize fix
  if (targetId === 'view-map' && state.map) setTimeout(() => state.map.invalidateSize(), 150);
  
  // Specific view loaders
  if (targetId === 'view-dashboard') renderDashboard();
  if (targetId === 'view-logs') fetchLogs();
  if (targetId === 'view-team') loadTeam();
  if (targetId === 'view-reports') renderReportsTable();
  if (targetId === 'view-roles') loadRoles();
  if (targetId === 'view-cloud-storage') loadCloudStatus();
  if (targetId === 'view-executive-suite') initExecutiveSuite();
  if (targetId === 'view-mobile-sim') {
    if (!state.simActiveForm && state.forms && state.forms.length > 0) {
      const pub = state.forms.find(f => f.status === 'published') || state.forms[0];
      if (pub) {
        state.simActiveForm = pub;
        state.simAnswers = {};
        state.simCurrentQuestionIdx = 0;
      }
    }
    renderMobileScreen();
  }
};

// ===================== RBAC =====================
const NAV_PERMISSIONS = {
  'nav-dashboard': ['DEV','Admin','Analyst','Coordinator','Researcher'],
  'nav-library': ['DEV','Admin','Analyst','Coordinator'],
  'nav-mobile-sim': ['DEV','Admin','Analyst','Coordinator','Researcher'],
  'nav-team': ['DEV','Admin'],
  'nav-roles': ['DEV','Admin'],
  'nav-form-builder': ['DEV','Admin'],
  'nav-cloud-storage': ['DEV','Admin','Analyst','Coordinator'],
  'nav-logs': ['DEV','Admin'],
  'nav-executive-suite': ['DEV','Admin','Analyst','Coordinator'],
  'nav-pendrive-backup': ['DEV','Admin','Analyst','Coordinator']
};
const SECTION_PERMISSIONS = {
  'financial-dashboard-section': ['DEV','Admin'],
  'supervisor-validation-panel': ['DEV','Admin'],
  'audio-review-panel': ['DEV','Admin'],
};

function normalizeRole(r) {
  if (!r) return 'Admin';
  const lower = String(r).toLowerCase().trim();
  if (lower === 'admin' || lower === 'administrador') return 'Admin';
  if (lower === 'dev' || lower === 'desenvolvedor' || lower === 'suporte') return 'DEV';
  if (lower === 'pesquisador' || lower === 'researcher') return 'Researcher';
  if (lower === 'analista' || lower === 'analyst') return 'Analyst';
  if (lower === 'coordenador' || lower === 'coordinator') return 'Coordinator';
  if (lower === 'supervisor') return 'Supervisor';
  return 'Admin';
}

function applyRoleRestrictions() {
  const role = normalizeRole(state.activeRole);
  // Nav items
  Object.entries(NAV_PERMISSIONS).forEach(([navId, roles]) => {
    const el = document.getElementById(navId);
    if (el) {
      const isAllowed = roles.some(r => r.toLowerCase() === role.toLowerCase());
      el.style.display = isAllowed ? '' : 'none';
    }
  });
  // Dashboard sections
  Object.entries(SECTION_PERMISSIONS).forEach(([secId, roles]) => {
    const el = document.getElementById(secId);
    if (el) {
      const isAllowed = roles.some(r => r.toLowerCase() === role.toLowerCase());
      el.style.display = isAllowed ? '' : 'none';
    }
  });
  // If current view is hidden, switch to dashboard
  const activePanel = document.querySelector('.view-panel.active');
  if (activePanel) {
    const activeNav = document.querySelector(`.nav-item[data-target="${activePanel.id}"]`);
    if (activeNav && activeNav.style.display === 'none') window.switchTab('view-dashboard');
  }
}

function updateUserUI() {
  const name = MOCK_USER_NAMES[state.activeRole] || state.activeRole;
  const roleLabel = ROLE_LABELS[state.activeRole] || state.activeRole;
  document.getElementById('current-user-name').textContent = name;
  document.getElementById('current-user-role-label').textContent = roleLabel;
  document.getElementById('user-avatar').textContent = name.charAt(0).toUpperCase();
}

// ===================== QUICK LOGIN & FILTERS =====================
window.quickLogin = async function(role) {
  const creds = {
    Admin: { user: 'admin_user', pass: 'admin123' },
    DEV: { user: 'dev_user', pass: 'dev123' }
  };
  const c = creds[role] || creds.Admin;
  const userEl = document.getElementById('login-username');
  const passEl = document.getElementById('login-password');
  if (userEl) userEl.value = c.user;
  if (passEl) passEl.value = c.pass;
  const roleEl = document.getElementById('login-role');
  if (roleEl) roleEl.value = role;
  await window.fazerLogin();
};

state.dashboardFilterStatus = 'all';
state.dashboardSearchQuery = '';
state.filterYear = 'all';
state.filterCategory = 'all';

window.filterProjectsByStatus = function(status) {
  state.dashboardFilterStatus = status;
  document.querySelectorAll('.proj-filter-pill').forEach(btn => {
    btn.classList.remove('active', 'btn-primary');
    btn.classList.add('btn-outline');
    if (btn.dataset.filter === status) {
      btn.classList.add('active', 'btn-primary');
      btn.classList.remove('btn-outline');
    }
  });
  renderDashboard();
};

window.filterProjectsByYear = function(year) {
  state.filterYear = year || 'all';
  document.querySelectorAll('.year-pill').forEach(btn => {
    btn.classList.remove('active', 'btn-primary');
    btn.classList.add('btn-outline');
    if (btn.dataset.year === year) {
      btn.classList.add('active', 'btn-primary');
      btn.classList.remove('btn-outline');
    }
  });
  renderDashboard();
};

window.filterProjectsByCategory = function(cat) {
  state.filterCategory = cat || 'all';
  renderDashboard();
};

window.filterDashboardProjects = function(query) {
  state.dashboardSearchQuery = (query || '').toLowerCase().trim();
  renderDashboard();
};

// ===================== DASHBOARD (PROJECTS) =====================
function renderDashboard() {
  const grid = document.getElementById('projects-grid');
  if (!grid) return;
  grid.innerHTML = '';

  let formsList = state.forms || [];

  // Filter by status
  if (state.dashboardFilterStatus && state.dashboardFilterStatus !== 'all') {
    formsList = formsList.filter(f => f.status === state.dashboardFilterStatus);
  }

  // Filter by year
  if (state.filterYear && state.filterYear !== 'all') {
    formsList = formsList.filter(f => String(f.year || '') === String(state.filterYear));
  }

  // Filter by category
  if (state.filterCategory && state.filterCategory !== 'all') {
    formsList = formsList.filter(f => (f.category || 'geral') === state.filterCategory);
  }

  // Filter by search query
  if (state.dashboardSearchQuery) {
    formsList = formsList.filter(f => {
      const t = (f.title || '').toLowerCase();
      const id = (f.id || '').toLowerCase();
      return t.includes(state.dashboardSearchQuery) || id.includes(state.dashboardSearchQuery);
    });
  }
  
  if (formsList.length === 0) {
    grid.innerHTML = `
      <div style="text-align:center; padding: 4rem 2rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--glass-border);">
        <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; color: var(--text-muted); margin-bottom: 1rem;"></i>
        <h3 style="font-size: 1.15rem; color: #fff; margin-bottom: 0.5rem;">Nenhum projeto encontrado</h3>
        <p style="color: var(--text-secondary); font-size: 0.85rem; max-width: 400px; margin: 0 auto 1.5rem auto;">Crie um novo questionário ou ajuste os filtros de busca para visualizar seus projetos.</p>
        <button class="btn btn-primary" onclick="switchTab('view-form-builder'); newForm();"><i class="fa-solid fa-plus"></i> Criar Novo Projeto</button>
      </div>`;
    return;
  }

  formsList.forEach(form => {
    const ints = state.interviews.filter(i => i.form_id === form.id);
    const isPub = form.status === 'published';
    const isArchived = form.status === 'archived';
    
    let statusBadge = '';
    if (isArchived) {
      statusBadge = '<span class="sys-status-badge" style="background:rgba(71, 85, 105, 0.4); color:#94a3b8; border:1px solid rgba(148, 163, 184, 0.2);"><i class="fa-solid fa-box-archive"></i> Arquivado</span>';
    } else if (isPub) {
      statusBadge = '<span class="sys-status-badge" style="background:rgba(16, 185, 129, 0.15); color:#34d399; border:1px solid rgba(16, 185, 129, 0.3);"><span class="status-pulse-dot" style="display:inline-block; margin-right:5px;"></span> Em Coleta (Ativo)</span>';
    } else {
      statusBadge = '<span class="sys-status-badge" style="background:rgba(245, 158, 11, 0.15); color:#fbbf24; border:1px solid rgba(245, 158, 11, 0.3);"><i class="fa-solid fa-pen" style="margin-right:4px;"></i> Rascunho</span>';
    }

    const cat = form.category || 'geral';
    const year = form.year || new Date().getFullYear();
    const catLabels = {
      eleitoral: 'Eleitoral & Opinião',
      governo: 'Avaliação Governamental',
      mercado: 'Pesquisa de Mercado',
      satisfacao: 'Satisfação / NPS',
      auditoria: 'Auditoria de Campo',
      geral: 'Geral'
    };
    const catLabel = catLabels[cat] || cat;
    const catBadge = `<span class="badge-cat badge-cat-${cat}"><i class="fa-solid fa-tag"></i> ${catLabel}</span>`;
    const yearBadge = `<span class="proj-year-badge"><i class="fa-regular fa-calendar"></i> ${year}</span>`;
    
    const modDateStr = form.updated_at ? new Date(form.updated_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
    const qCount = form.questions ? form.questions.length : 0;
    
    // Sample target calculation (default 100 or from quota)
    const targetQuota = 100;
    const progressPct = Math.min(100, Math.round((ints.length / targetQuota) * 100));

    grid.innerHTML += `
      <div class="project-card-glass" onclick="openProject('${form.id}')" style="cursor: pointer;" title="Abrir projeto ${form.title}">
        <div class="project-card-header">
          <div style="flex: 1; min-width: 0;">
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.4rem;">
              <span class="project-id-badge"><i class="fa-solid fa-hashtag"></i> ${form.id}</span>
              ${statusBadge}
              ${yearBadge}
              ${catBadge}
            </div>
            <h3 class="project-title">${form.title}</h3>
            <p style="font-size:0.78rem; color:var(--text-muted); margin:0;">
              <i class="fa-regular fa-clock" style="margin-right:4px;"></i> Atualizado em: ${modDateStr}
            </p>
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem;" onclick="event.stopPropagation()">
            <a href="/api/export/xlsx/${form.id}" class="btn btn-sm btn-outline" style="border-color:var(--glass-border); color:#34d399;" title="Exportar Planilha Excel (.xlsx) Direto" onclick="event.stopPropagation()">
              <i class="fa-solid fa-file-excel"></i> XLSX
            </a>
            <button type="button" class="btn btn-sm btn-primary" onclick="event.stopPropagation(); openProject('${form.id}')" title="Abrir Área de Trabalho do Projeto">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir
            </button>
          </div>
        </div>

        <div class="project-metrics-grid">
          <div class="metric-cell">
            <span class="metric-cell-label">Entrevistas</span>
            <span class="metric-cell-value" style="color:var(--primary);">${ints.length}</span>
          </div>
          <div class="metric-cell">
            <span class="metric-cell-label">Perguntas</span>
            <span class="metric-cell-value">${qCount}</span>
          </div>
          <div class="metric-cell">
            <span class="metric-cell-label">Meta da Amostra</span>
            <span class="metric-cell-value" style="color:${progressPct >= 100 ? '#10b981' : '#38bdf8'};">${progressPct}%</span>
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:0.35rem;">
          <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:var(--text-muted);">
            <span>Progresso da Coleta</span>
            <span><b>${ints.length}</b> de ${targetQuota} respostas</span>
          </div>
          <div style="width:100%; height:6px; background:rgba(255,255,255,0.06); border-radius:var(--radius-full); overflow:hidden;">
            <div style="height:100%; width:${progressPct}%; background:linear-gradient(90deg, var(--primary), #10b981); border-radius:var(--radius-full); transition: width 0.4s ease;"></div>
          </div>
        </div>
      </div>
    `;
  });
}

// ===================== PROJECT DETAILS =====================
window.openProject = async function(formId) {
  if (!formId) {
    showToast('warning', 'ID do projeto não fornecido.');
    return;
  }

  state.activeProjectFormId = formId;

  // 1. Find form in local state, or fetch from server
  let form = (state.forms || []).find(f => f.id === formId || String(f.id).trim() === String(formId).trim());
  if (!form) {
    try {
      await loadServerData();
      form = (state.forms || []).find(f => f.id === formId || String(f.id).trim() === String(formId).trim());
    } catch (e) {
      console.warn('Erro ao atualizar projetos:', e);
    }
  }

  if (!form) {
    showToast('error', `Projeto ${formId} não encontrado no sistema.`);
    return;
  }

  // Ensure state.activeForm is synchronized for builder and sub-components
  state.activeForm = JSON.parse(JSON.stringify(form));
  if (!state.activeForm.questions || !Array.isArray(state.activeForm.questions)) {
    state.activeForm.questions = [];
  }
  if (!form.questions || !Array.isArray(form.questions)) {
    form.questions = [];
  }

  const qCount = form.questions.length;
  const ints = (state.interviews || []).filter(i => i.form_id === formId);
  const isPub = form.status === 'published' || form.status === 'publicado';
  const isArchived = form.status === 'archived' || form.status === 'arquivado';

  // 2. Populate Header & Resumo Info
  const titleTop = document.getElementById('project-details-title-top');
  if (titleTop) titleTop.textContent = form.title || 'Projeto';
  
  let statusBadgeHtml = '';
  if (isArchived) {
    statusBadgeHtml = '<span class="sys-status-badge badge-archived"><i class="fa-solid fa-box-archive"></i> Arquivado</span>';
  } else if (isPub) {
    statusBadgeHtml = '<span class="sys-status-badge"><span class="status-pulse-dot" style="margin-right:4px;"></span> Disponibilizado</span>';
  } else {
    statusBadgeHtml = '<span class="sys-status-badge badge-draft"><i class="fa-solid fa-pen" style="margin-right:4px;"></i> Rascunho</span>';
  }
  
  const elStatusBadge = document.getElementById('pd-status-badge');
  if (elStatusBadge) elStatusBadge.innerHTML = statusBadgeHtml;
  const elStatusBadgeTop = document.getElementById('pd-status-badge-top');
  if (elStatusBadgeTop) elStatusBadgeTop.innerHTML = statusBadgeHtml;
  
  const elQCount = document.getElementById('pd-questions-count');
  if (elQCount) elQCount.textContent = `${qCount} perguntas cadastradas`;
  
  const name = String(state.activeUserName || (state.activeRole && MOCK_USER_NAMES[state.activeRole]) || state.activeRole || 'Usuário');
  const initial = name.charAt(0).toUpperCase();
  const shortName = name.split(' ')[0];

  const elOwnerInit = document.getElementById('pd-owner-initial');
  if (elOwnerInit) elOwnerInit.textContent = initial;
  const elOwnerInitTop = document.getElementById('pd-owner-initial-top');
  if (elOwnerInitTop) elOwnerInitTop.textContent = initial;
  const elOwnerName = document.getElementById('pd-owner-name');
  if (elOwnerName) elOwnerName.textContent = shortName;

  const elTotalSubs = document.getElementById('pd-total-submissions');
  if (elTotalSubs) elTotalSubs.textContent = ints.length;

  const modDateStr = form.updated_at ? new Date(form.updated_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
  const elLastMod = document.getElementById('pd-last-mod');
  if (elLastMod) elLastMod.textContent = modDateStr;

  const pubDateStr = isPub ? modDateStr : '-';
  const elLastPub = document.getElementById('pd-last-pub');
  if (elLastPub) elLastPub.textContent = pubDateStr;

  // 3. SWITCH VIEW IMMEDIATELY
  switchTab('view-project-details');

  // Reset to default tab (RESUMO)
  sysSwitchTab('proj-tab-resumo');

  // 4. Safely initialize sub-modules with try/catch
  try { loadProjectAccess(); } catch (e) { console.error('Erro em loadProjectAccess:', e); }
  try { renderQuotasProgress(formId); } catch (e) { console.error('Erro em renderQuotasProgress:', e); }
  try { renderReportsTable(); } catch (e) { console.error('Erro em renderReportsTable:', e); }
  try { renderAudioReviewList(); } catch (e) { console.error('Erro em renderAudioReviewList:', e); }
  try { renderCharts(); } catch (e) { console.error('Erro em renderCharts:', e); }
  try { if (typeof renderProjectVersionsTab === 'function') renderProjectVersionsTab(formId); } catch (e) { console.error('Erro em renderProjectVersionsTab:', e); }
};

async function renderQuotasProgress(formId) {
  const container = document.getElementById('quota-progress-container');
  const card = document.getElementById('quota-progress-card');
  if (!container || !card) return;

  try {
    const headers = { 'x-user-id': state.activeUserId, 'x-user-role': state.activeRole };
    const token = localStorage.getItem('auth_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api/forms/${formId}/quotas/progress`, { headers });
    if (!res.ok) throw new Error('Erro ao carregar cotas');
    
    const data = await res.json();
    if (!data.quotas || data.quotas.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    let html = '';
    
    data.quotas.forEach(q => {
      const pct = Math.min(100, Math.round((q.count / q.limit) * 100));
      const color = pct >= 100 ? '#10b981' : (pct >= 50 ? '#f59e0b' : '#3b82f6');
      
      html += `
        <div style="margin-bottom:1rem;">
          <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
            <strong>${q.question_id}: ${q.target_value}</strong>
            <span>${q.count} / ${q.limit} (${pct}%)</span>
          </div>
          <div style="width:100%; height:8px; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden;">
            <div style="height:100%; width:${pct}%; background:${color}; border-radius:4px;"></div>
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
  } catch (e) {
    console.error(e);
    card.style.display = 'none';
  }
}

window.sysSwitchTab = function(tabId) {
  document.querySelectorAll('.sys-proj-tab').forEach(t => {
    t.classList.remove('active');
    if (t.dataset.tab === tabId) t.classList.add('active');
  });
  document.querySelectorAll('#view-project-details .tab-content').forEach(c => c.style.display = 'none');
  const target = document.getElementById(tabId);
  if (target) {
    target.style.display = 'block';
    target.classList.add('active');
  }
  
  if (tabId === 'proj-tab-resumo') {
    if (typeof renderQuotasProgress === 'function' && state.activeProjectFormId) {
      try { renderQuotasProgress(state.activeProjectFormId); } catch(e){}
    }
  }

  if (tabId === 'proj-tab-versoes') {
    if (typeof renderProjectVersionsTab === 'function' && state.activeProjectFormId) {
      try { renderProjectVersionsTab(state.activeProjectFormId); } catch(e){}
    }
  }

  if (tabId === 'proj-tab-dados') {
    if (typeof renderReportsTable === 'function') try { renderReportsTable(); } catch(e){}
    if (typeof renderAudioReviewList === 'function') try { renderAudioReviewList(); } catch(e){}
    if (typeof renderCharts === 'function') try { renderCharts(); } catch(e){}
  }

  if (tabId === 'proj-tab-mapa') {
    if (typeof loadGeospatialMetrics === 'function' && state.activeProjectFormId) {
      try { loadGeospatialMetrics(state.activeProjectFormId); } catch(e){}
    }
    if (!state.map) {
      setTimeout(() => { try { initMap(); } catch(e){} }, 100);
    } else {
      setTimeout(() => {
        try {
          state.map.invalidateSize();
          renderMapMarkers();
        } catch(e){}
      }, 150);
    }
  }

  if (tabId === 'proj-tab-config') {
    if (typeof loadProjectAccess === 'function') try { loadProjectAccess(); } catch(e){}
  }
};

window.sysEditForm = function() {
  if (!state.activeProjectFormId) return;
  const form = state.forms.find(f => f.id === state.activeProjectFormId);
  if (form) {
    loadFormIntoBuilder(form);
    switchTab('view-form-builder');
  }
};

window.exportCurrentFormXLS = async function() {
  if (state.activeForm.questions.length === 0) return showToast('warning', 'O formulário está vazio.');
  showToast('info', 'Gerando XLSForm...');
  try {
    const url = `/api/forms/${state.activeForm.id}/export-xlsform`;
    const token = localStorage.getItem('auth_token');
    
    const res = await fetch(url, {
      method: 'GET',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    
    if (!res.ok) throw new Error('Erro ao exportar XLSForm');
    
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${state.activeForm.title || 'formulario'}_xlsform.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(blobUrl);
    a.remove();
    showToast('success', 'Exportação concluída!');
  } catch (err) {
    showToast('error', err.message);
  }
};

window.sysPreviewForm = function() {
  if (!state.activeProjectFormId) return;
  const form = state.forms.find(f => f.id === state.activeProjectFormId);
  if (form) {
    state.simActiveForm = form;
    state.simAnswers = {};
    state.simCurrentQuestionIdx = 0;
    state.simAudioFile = null;
    state.simIsRecording = false;
    
    switchTab('view-mobile-sim');
    renderMobileScreen();
    showToast('info', `Simulador carregado com "${form.title}".`);
  }
};

// ===================== MAP =====================
function getStringColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
}

window.toggleMap3D = function() {
  const mapDiv = document.getElementById('map');
  const btn = document.getElementById('btn-map-3d');
  state.isMap3D = !state.isMap3D;
  
  if (state.isMap3D) {
    btn.innerHTML = '<i class="fa-solid fa-circle-half-stroke"></i> Mapa Dark';
    btn.style.background = '#0f172a';
    if(state.tileLayer) state.map.removeLayer(state.tileLayer);
    state.tileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Esri Satellite' }).addTo(state.map);
  } else {
    btn.innerHTML = '<i class="fa-solid fa-satellite"></i> Visão Satélite';
    btn.style.background = 'var(--primary)';
    if(state.tileLayer) state.map.removeLayer(state.tileLayer);
    state.tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd', attribution: '&copy; CARTO &copy; OpenStreetMap' }).addTo(state.map);
  }
};

function initMap() {
  if (state.map) return;
  state.map = L.map('map', { zoomControl: true }).setView([-3.1190, -60.0217], 7);
  state.tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap'
  }).addTo(state.map);
  
  state.markerCluster = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 40,
    spiderfyOnMaxZoom: true
  });
  state.map.addLayer(state.markerCluster);
  
  renderMapMarkers();
}

function renderMapMarkers() {
  if (!state.map || !state.markerCluster) return;
  
  state.markerCluster.clearLayers();
  
  // Filter only for the active project
  let filtered = state.interviews.filter(i => i.latitude && i.longitude);
  if (state.activeProjectFormId) {
    filtered = filtered.filter(i => i.form_id === state.activeProjectFormId);
  }

  const markers = [];
  filtered.forEach(item => {
    const researcher = state.users.find(u => u.id === item.researcher_id);
    const researcherName = researcher ? researcher.name : item.researcher_id;
    const color = getStringColor(researcherName);
    const form = state.forms.find(f => f.id === item.form_id);
    const formTitle = form ? form.title : item.form_id;
    const initial = researcherName.charAt(0).toUpperCase();
    
    // High-tech glowing pin
    const iconHtml = `<div style="position:relative;width:28px;height:28px;">
      <div style="width:28px;height:28px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #ffffff;box-shadow:0 0 15px ${color};display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);font-size:10px;font-weight:800;color:#ffffff;font-family:sans-serif;">${initial}</span>
      </div>
    </div>`;
    const icon = L.divIcon({ className:'custom-marker', html: iconHtml, iconSize:[28,28], iconAnchor:[14,28] });
    
    const popup = `
      <div style="font-family:'Plus Jakarta Sans',sans-serif; min-width:220px; color:#f8fafc;">
        <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem; padding-bottom:0.4rem; border-bottom:1px solid rgba(255,255,255,0.1);">
          <div style="width:10px; height:10px; border-radius:50%; background:${color};"></div>
          <strong style="font-size:0.95rem; color:#fff;">${formTitle}</strong>
        </div>
        <div style="font-size:0.8rem; color:#94a3b8; line-height:1.6;">
          <div><i class="fa-solid fa-user" style="color:${color}; width:16px;"></i> <b>Pesquisador:</b> ${researcherName}</div>
          <div><i class="fa-solid fa-calendar-day" style="color:var(--primary); width:16px;"></i> <b>Data:</b> ${new Date(item.created_at).toLocaleDateString('pt-BR')} ${new Date(item.created_at).toLocaleTimeString('pt-BR')}</div>
          <div><i class="fa-solid fa-location-crosshairs" style="color:#10b981; width:16px;"></i> <b>GPS:</b> ${Number(item.latitude).toFixed(4)}, ${Number(item.longitude).toFixed(4)}</div>
        </div>
        <div style="margin-top:10px;">
          <button class="btn btn-sm btn-primary" onclick="openInterviewDetails('${item.id}')" style="width:100%; font-size:0.75rem; justify-content:center;">
            <i class="fa-solid fa-eye"></i> Visualizar Respostas
          </button>
        </div>
      </div>`;
    
    const tooltipText = `<div style="font-weight:bold; color:${color};"><i class="fa-solid fa-user"></i> ${researcherName}</div><div style="font-size:10px; color:#94a3b8;">${new Date(item.created_at).toLocaleTimeString('pt-BR')}</div>`;

    const marker = L.marker([item.latitude, item.longitude], { icon })
      .bindTooltip(tooltipText, { direction: 'top', offset: [0, -22] })
      .bindPopup(popup);
      
    markers.push(marker);
  });
  
  state.markerCluster.addLayers(markers);
  if (markers.length > 0) {
    state.map.fitBounds(state.markerCluster.getBounds(), { padding: [50, 50] });
  }
}

// ===================== REPORTS =====================
window.renderCharts = function() {
  const container = document.getElementById('analytics-charts-container');
  if (!container) return;

  const formId = state.activeProjectFormId;
  const form = (state.forms || []).find(f => f.id === formId) || state.activeForm;
  const interviews = (state.interviews || []).filter(i => i.form_id === formId);

  if (!form || !form.questions || form.questions.length === 0 || interviews.length === 0) {
    container.innerHTML = '<p class="text-muted" style="grid-column: 1 / -1; text-align: center;">Não há dados suficientes para gerar relatórios gráficos.</p>';
    return;
  }

  if (typeof Chart === 'undefined') {
    container.innerHTML = '<p class="text-muted" style="grid-column: 1 / -1; text-align: center;">Carregando biblioteca de gráficos...</p>';
    return;
  }

  container.innerHTML = '';
  if (window._analyticsCharts) {
    window._analyticsCharts.forEach(c => {
      try { c.destroy(); } catch(e){}
    });
  }
  window._analyticsCharts = [];

  form.questions.forEach(q => {
    try {
      const isSelect = q.type === 'single_choice' || q.type === 'select_one' || q.type === 'multiple_choice' || q.type === 'select_multiple' || q.type === 'range';
      if (isSelect && q.options && q.options.length > 0) {
        const counts = {};
        const labelsMap = {};
        
        q.options.forEach(opt => {
          const val = typeof opt === 'object' ? (opt.name || opt.value || opt.label) : opt;
          const lbl = typeof opt === 'object' ? (opt.label || opt.name || val) : opt;
          counts[val] = 0;
          labelsMap[val] = lbl;
        });

        let totalResponses = 0;

        interviews.forEach(int => {
          const val = int.data && int.data[q.id];
          if (val !== undefined && val !== null && val !== '') {
            if (Array.isArray(val)) {
              val.forEach(v => {
                if (counts[v] !== undefined) counts[v]++;
                else counts[v] = 1;
              });
              totalResponses++;
            } else {
              if (counts[val] !== undefined) counts[val]++;
              else counts[val] = 1;
              totalResponses++;
            }
          }
        });

        if (totalResponses === 0) return;

        const card = document.createElement('div');
        card.className = 'card';
        card.style.padding = '1.3rem';
        
        const title = document.createElement('h4');
        title.style.fontSize = '0.95rem';
        title.style.fontWeight = '700';
        title.style.marginBottom = '1rem';
        title.style.color = 'var(--text-primary)';
        title.textContent = q.text || q.title || q.id;
        card.appendChild(title);

        const canvas = document.createElement('canvas');
        canvas.style.maxHeight = '250px';
        card.appendChild(canvas);

        container.appendChild(card);

        const displayLabels = Object.keys(counts).map(k => labelsMap[k] || k);
        const displayData = Object.values(counts);

        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
          type: displayLabels.length > 6 ? 'bar' : 'pie',
          data: {
            labels: displayLabels,
            datasets: [{
              label: 'Respostas',
              data: displayData,
              backgroundColor: ['#22d3ee', '#34d399', '#fbbf24', '#f87171', '#818cf8', '#38bdf8', '#a78bfa', '#ec4899', '#10b981', '#6366f1'],
              borderColor: 'rgba(6, 11, 24, 0.8)',
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { 
                display: displayLabels.length <= 6,
                position: 'bottom', 
                labels: { 
                  boxWidth: 12, 
                  color: '#eef4ff', 
                  font: { size: 11, family: 'Inter' } 
                } 
              }
            }
          }
        });
        window._analyticsCharts.push(chart);
      }
    } catch(err) {
      console.warn('Erro ao renderizar gráfico da pergunta:', q.id, err);
    }
  });

  if (container.innerHTML === '') {
    container.innerHTML = '<p class="text-muted" style="grid-column: 1 / -1; text-align: center;">Nenhuma questão de múltipla escolha para gerar gráficos.</p>';
  }
};

function formatDeviceId(deviceId) {
  if (!deviceId) return 'N/A';
  if (deviceId.startsWith('collect:')) return 'Aplicativo Mobile (Android)';
  if (deviceId === 'Simulador Web' || deviceId.startsWith('enketo')) return 'Formulário Web';
  return deviceId;
}

window.renderReportsTable = function() {
  const thead = document.getElementById('reports-thead');
  const tbody = document.getElementById('reports-tbody');
  const searchInput = document.getElementById('reports-search');
  if (!tbody || !thead) return;
  
  const formId = state.activeProjectFormId;
  const form = (state.forms || []).find(f => f.id === formId) || state.activeForm || { questions: [] };
  const questions = form.questions || [];

  let filtered = [...state.interviews].reverse(); // newest first
  if (state.activeProjectFormId) {
    filtered = filtered.filter(i => i.form_id === state.activeProjectFormId);
  }

  // Search filter
  const term = searchInput ? searchInput.value.toLowerCase() : '';
  if (term) {
    filtered = filtered.filter(int => {
      const r = state.users.find(u => u.id === int.researcher_id) || {name: int.researcher_id};
      if (int.id.toLowerCase().includes(term) || r.name.toLowerCase().includes(term)) return true;
      if (int.data) {
        return Object.values(int.data).some(v => String(v).toLowerCase().includes(term));
      }
      return false;
    });
  }

  // Generate Headers
  let headHtml = `<tr><th style="width:40px;"><input type="checkbox" id="check-all-interviews"></th><th>ID</th><th>Pesquisador</th><th>Data/Hora</th>`;
  questions.forEach(q => {
    headHtml += `<th>${q.text || q.id}</th>`;
  });
  headHtml += `<th>Ações</th></tr>`;
  thead.innerHTML = headHtml;

  // Check all listener
  setTimeout(() => {
    const cbAll = document.getElementById('check-all-interviews');
    if (cbAll) {
      cbAll.addEventListener('change', (e) => {
        document.querySelectorAll('.cb-interview-select').forEach(cb => cb.checked = e.target.checked);
      });
    }
  }, 50);

  tbody.innerHTML = '';
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${questions.length + 5}" style="text-align:center;padding:2rem;">Nenhuma coleta encontrada.</td></tr>`;
    return;
  }

  filtered.forEach(int => {
    const researcher = state.users.find(u => u.id === int.researcher_id) || {name: int.researcher_id};
    const date = new Date(int.created_at).toLocaleString('pt-BR');
    
    let trHtml = `
      <td><input type="checkbox" class="cb-interview-select" value="${int.id}"></td>
      <td>${int.id.substring(0,8)}</td>
      <td>${researcher.name}</td>
      <td>${date}</td>
    `;

    // Fill answers
    questions.forEach(q => {
      let val = (int.data && int.data[q.id]) ? int.data[q.id] : '-';
      
      // If it's the audio url attached directly, or answered via question
      if ((q.type === 'audio' && val !== '-') || (val && typeof val === 'string' && val.endsWith('.webm'))) {
        val = `<a href="#" style="color:var(--primary); text-decoration:none; display:inline-flex; align-items:center; gap:0.4rem; font-weight:600;" onclick="openAudioModal('${val}'); return false;"><i class="fa-solid fa-play"></i> Ouvir</a>`;
      } else if (int.audio_url && q.type === 'audio') { // Fallback if general audio_url is present and matches an audio question
        val = `<a href="#" style="color:var(--primary); text-decoration:none; display:inline-flex; align-items:center; gap:0.4rem; font-weight:600;" onclick="openAudioModal('${int.audio_url}'); return false;"><i class="fa-solid fa-play"></i> Ouvir</a>`;
      }
      
      trHtml += `<td>${val}</td>`;
    });

    trHtml += `<td><button class="btn btn-sm btn-outline" style="border-color:var(--border); color:var(--text-secondary);" onclick="openInterviewDetails('${int.id}')"><i class="fa-solid fa-eye"></i> Detalhes</button></td>`;
    
    const tr = document.createElement('tr');
    tr.innerHTML = trHtml;
    tbody.appendChild(tr);
  });
};

window.openAudioModal = function(url) {
  const modal = document.getElementById('audio-modal');
  const player = document.getElementById('audio-player-element');
  if (modal && player) {
    player.src = url;
    
    // Fix for 0:00 duration issue (missing metadata in WebM/AMR)
    player.onloadedmetadata = function() {
      if (player.duration === Infinity || isNaN(player.duration)) {
        player.currentTime = 1e101;
        player.ontimeupdate = function() {
          player.ontimeupdate = null;
          player.currentTime = 0;
        };
      }
    };

    modal.classList.add('active');
    player.play().catch(e => console.log("Auto-play blocked", e));
  }
};

window.closeAudioModal = function() {
  const modal = document.getElementById('audio-modal');
  const player = document.getElementById('audio-player-element');
  if (modal && player) {
    player.pause();
    player.currentTime = 0;
    modal.classList.remove('active');
  }
};

window.openInterviewDetails = function(id) {
  const int = state.interviews.find(i => i.id === id);
  if (!int) return;
  const researcher = state.users.find(u => u.id === int.researcher_id) || {name: int.researcher_id};
  const form = state.forms.find(f => f.id === int.form_id) || {title: int.form_id, questions: []};
  
  document.getElementById('interview-modal-form').textContent = form.title;
  document.getElementById('interview-modal-researcher').textContent = researcher.name;
  document.getElementById('interview-modal-date').textContent = new Date(int.created_at).toLocaleString('pt-BR');
  document.getElementById('interview-modal-device').textContent = formatDeviceId(int.device_id);
  document.getElementById('interview-modal-gps').textContent = (int.latitude && int.longitude) ? `${int.latitude}, ${int.longitude}` : 'Não registrada';
  
  const answersDiv = document.getElementById('interview-modal-answers');
  answersDiv.innerHTML = '';
  Object.keys(int.data || {}).forEach(qId => {
    const qText = form.questions ? (form.questions.find(q => q.id === qId)?.text || qId) : qId;
    const val = int.data[qId];
    answersDiv.innerHTML += `<div style="margin-bottom:0.75rem;"><strong style="color:var(--text-primary);display:block;margin-bottom:0.25rem;">${qText}</strong><span style="color:var(--text-secondary);">${val}</span></div>`;
  });
  
  if (int.audio_url) {
    answersDiv.innerHTML += `<div style="margin-top:1rem;border-top:1px solid var(--border);padding-top:1rem;"><strong style="display:block;margin-bottom:0.5rem;"><i class="fa-solid fa-microphone"></i> Gravação de Áudio</strong><audio controls style="width:100%;height:36px;"><source src="${int.audio_url}"></audio></div>`;
  }
  
  document.getElementById('interview-modal').classList.add('active');
};

window.clearTestInterviews = function() {
  const checkboxes = document.querySelectorAll('.cb-interview-select:checked');
  const ids = Array.from(checkboxes).map(cb => cb.value);
  if (ids.length === 0) {
    showToast('warning', 'Selecione pelo menos uma entrevista para apagar.');
    return;
  }

  showConfirm('Limpar Testes', `Tem certeza que deseja apagar permanentemente ${ids.length} entrevista(s)? Essa ação não pode ser desfeita.`, async () => {
    try {
      const res = await apiFetch('/api/interviews/clear', { method: 'DELETE', body: JSON.stringify({ ids }) });
      if (res.success) {
        showToast('success', `${res.deletedCount} entrevistas removidas com sucesso.`);
        await loadServerData();
        renderReportsTable();
        renderMapMarkers();
        renderAudioReviewList();
      }
    } catch(err) { showToast('error', err.message); }
  }, { type:'danger', confirmText:'Apagar Dados' });
};

window.exportProjectData = async function() {
  if (!state.activeProjectFormId) return;
  const formId = state.activeProjectFormId;
  const form = state.forms.find(f => f.id === formId);
  
  showToast('info', 'Gerando arquivo CSV no servidor...');
  
  try {
    const headers = {
      'x-user-id': state.activeUserId,
      'x-user-role': state.activeRole
    };
    const token = localStorage.getItem('auth_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`/api/export/${formId}`, {
      headers
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Erro na exportação');
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GuiaData_${form ? form.title.replace(/\s+/g, '_') : formId}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    showToast('success', 'Download concluído!');
  } catch (err) {
    showToast('error', err.message);
  }
};

window.exportXLSForm = async function() {
  const formId = state.activeForm.id;
  if (!formId) return showToast("error", "Salve o formulário antes de baixar o XLSForm.");
  showToast("info", "Gerando arquivo XLSForm...");
  try {
    const headers = { "x-user-id": state.activeUserId, "x-user-role": state.activeRole };
    const token = localStorage.getItem("auth_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const response = await fetch(`/api/forms/${formId}/export-xlsform`, { headers });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || "Erro na exportação");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = `form_${formId}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    showToast("error", err.message);
  }
};

window.exportProjectDataXLSX = async function() {
  if (!state.activeProjectFormId) return;
  const formId = state.activeProjectFormId;
  const form = state.forms.find(f => f.id === formId);
  
  showToast('info', 'Gerando arquivo XLSX no servidor...');
  
  try {
    const headers = {
      'x-user-id': state.activeUserId,
      'x-user-role': state.activeRole
    };
    const token = localStorage.getItem('auth_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`/api/export/${formId}/xlsx`, { headers });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Erro na exportação');
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GuiaData_${form ? form.title.replace(/\\s+/g, '_') : formId}_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    showToast('success', 'Download concluído!');
  } catch (err) {
    showToast('error', err.message);
  }
};

// ===================== AUDIO REVIEW =====================
function renderAudioReviewList() {
  const container = document.getElementById('audio-review-list');
  if (!container) return;
  container.innerHTML = '';
  
  let auditable = state.interviews.filter(i => i.audio_url);
  if (state.activeProjectFormId) {
    auditable = auditable.filter(i => i.form_id === state.activeProjectFormId);
  }

  if (auditable.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:3rem;"><i class="fa-solid fa-headphones"></i><h4>Nenhuma gravação encontrada neste projeto</h4><p>As gravações de áudio aparecerão aqui quando os pesquisadores as enviarem.</p></div>';
    return;
  }
  
  auditable.forEach(item => {
    const researcher = state.users.find(u => u.id === item.researcher_id);
    const researcherName = researcher ? researcher.name : item.researcher_id;
    const div = document.createElement('div');
    div.style = "padding:1rem; border-bottom:1px solid var(--border);";
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
        <div><strong>Pesquisador:</strong> ${researcherName}</div>
        <div class="text-muted">${new Date(item.created_at).toLocaleString('pt-BR')}</div>
      </div>
      <audio controls style="width:100%;height:36px;"><source src="${item.audio_url}"></audio>
    `;
    container.appendChild(div);
  });
}

// ===================== FORM BUILDER =====================
let draggedQuestionIndex = null;

window.newForm = function() {
  loadFormIntoBuilder({ id:'', title:'Novo Formulário', status:'draft', version:1, questions:[], category:'geral', year:new Date().getFullYear() });
};

function initFormBuilder() {
  const btnNew = document.getElementById('btn-new-form');
  if (btnNew) {
    btnNew.addEventListener('click', () => {
      window.newForm();
    });
  }

  const btnAdd = document.getElementById('btn-add-question');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      const modal = document.getElementById('question-type-modal');
      if (modal) modal.classList.add('active');
    });
  }

  const btnSave = document.getElementById('btn-save-form');
  if (btnSave) {
    btnSave.addEventListener('click', saveActiveForm);
  }
  
  const importInput = document.getElementById('import-xlsform-input') || document.getElementById('import-xls-input');
  if (importInput) {
    importInput.addEventListener('change', async (e) => {
      await window.importXLSForm(e);
    });
  }

  const importBuilder = document.getElementById('import-builder-xls');
  if (importBuilder) {
    importBuilder.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      showToast('info', 'Importando perguntas...');
      try {
        const token = localStorage.getItem('auth_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (state.activeRole) headers['x-user-role'] = state.activeRole;
        const res = await fetch('/api/forms/parse-xlsform', { method: 'POST', headers, body: formData });
        const data = await res.json();
        if (data.error) showToast('error', data.error);
        else {
          state.activeForm.questions = data.questions;
          renderBuilderQuestions();
          showToast('success', 'Perguntas substituídas com sucesso!');
        }
      } catch (err) { showToast('error', 'Erro: ' + err.message); }
      e.target.value = '';
    });
  }
}

window.importXLSForm = async function(e) {
  const file = e && e.target && e.target.files && e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);
  showToast('info', 'Processando arquivo XLSForm...');

  try {
    const token = localStorage.getItem('auth_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (state.activeRole) headers['x-user-role'] = state.activeRole;

    const res = await fetch('/api/forms/upload-xlsform', {
      method: 'POST',
      headers,
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro na importação.');

    showToast('success', 'Formulário XLSForm importado com sucesso!');
    await loadServerData();
    renderFormBuilderList();
    if (data.form) {
      loadFormIntoBuilder(data.form);
    } else if (data.id) {
      const created = state.forms.find(f => f.id === data.id);
      if (created) loadFormIntoBuilder(created);
    }
  } catch (err) {
    showToast('error', 'Falha ao importar XLSForm: ' + err.message);
  } finally {
    if (e && e.target) e.target.value = '';
  }
};

window.toggleOdkPanel = function(status) {
  const panel = document.getElementById('odk-status-panel');
  if (panel) panel.style.display = (status === 'published' || status === 'publicado') ? 'block' : 'none';
};

window.deleteQuestion = (idx) => window.confirmDeleteQuestion(idx);
window.moveQuestionUp = (idx) => {
  if (idx <= 0 || !state.activeForm || !state.activeForm.questions) return;
  const questions = state.activeForm.questions;
  const temp = questions[idx];
  questions[idx] = questions[idx - 1];
  questions[idx - 1] = temp;
  renderBuilderQuestions();
};
window.moveQuestionDown = (idx) => {
  if (!state.activeForm || !state.activeForm.questions || idx >= state.activeForm.questions.length - 1) return;
  const questions = state.activeForm.questions;
  const temp = questions[idx];
  questions[idx] = questions[idx + 1];
  questions[idx + 1] = temp;
  renderBuilderQuestions();
};

window.addNewQuestion = function(type) {
  const qId = 'Q' + (state.activeForm.questions.length + 1);
  const q = { id:qId, text:'', type: type, options:[], required: false };
  if (type === 'select_one' || type === 'select_multiple' || type === 'rank') {
    q.options = [{ name: 'opt_1', label: 'Opção 1' }, { name: 'opt_2', label: 'Opção 2' }];
  }
  state.activeForm.questions.push(q);
  renderBuilderQuestions();
  document.getElementById('question-type-modal').classList.remove('active');
  
  // Scroll to bottom
  const container = document.querySelector('.sys-workspace-body');
  if (container) container.scrollTop = container.scrollHeight;
};

function renderFormBuilderList() {
  const container = document.getElementById('forms-list-container');
  container.innerHTML = '';
  if (state.forms.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><h4>Nenhum formulário</h4><p>Clique em "Novo" para criar o primeiro formulário.</p></div>';
    return;
  }
  state.forms.forEach(form => {
    const div = document.createElement('div');
    div.className = `form-list-item ${state.activeForm.id === form.id ? 'active' : ''}`;
    const badge = form.status === 'published' ? '<span class="badge badge-success">PUB</span>' : '<span class="badge badge-draft">RASCUNHO</span>';
    const qCount = (form.questions || []).length;
    div.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;"><span class="form-list-title">${form.title}</span>${badge}</div><div class="form-list-meta">Versão ${form.version || 1} · ${qCount} perguntas</div>`;
    div.addEventListener('click', () => loadFormIntoBuilder(form));
    container.appendChild(div);
  });
}

function loadFormIntoBuilder(form) {
  state.activeForm = JSON.parse(JSON.stringify(form));
  state.activeForm.category = form.category || (form.settings && form.settings.category) || 'geral';
  state.activeForm.year = form.year || (form.settings && form.settings.year) || new Date().getFullYear();
  if (form.id) state.activeProjectFormId = form.id;

  const titleEl = document.getElementById('form-edit-title');
  if (titleEl) titleEl.value = state.activeForm.title || '';

  const statusEl = document.getElementById('form-edit-status');
  if (statusEl) statusEl.value = state.activeForm.status || 'draft';

  // Update Breadcrumb & Badges
  const breadcrumbEl = document.getElementById('builder-breadcrumb-title');
  if (breadcrumbEl) breadcrumbEl.textContent = state.activeForm.title || 'Questionário';

  const verBadge = document.getElementById('builder-version-badge');
  if (verBadge) verBadge.textContent = `V${state.activeForm.version || 1}`;

  const statusBadge = document.getElementById('builder-status-badge');
  if (statusBadge) {
    if (state.activeForm.status === 'published') {
      statusBadge.className = 'badge badge-success';
      statusBadge.textContent = 'Publicado';
    } else if (state.activeForm.status === 'archived') {
      statusBadge.className = 'badge badge-secondary';
      statusBadge.textContent = 'Arquivado';
    } else {
      statusBadge.className = 'badge badge-warning';
      statusBadge.textContent = 'Rascunho';
    }
  }

  const skipErrors = document.getElementById('skip-logic-errors');
  if (skipErrors) skipErrors.classList.remove('visible');
  renderBuilderQuestions();
  renderFormBuilderList();
}


// REBUILT FOR NESTED SORTABLE AND GROUPS
function renderBuilderQuestions() {
  const container = document.getElementById('builder-questions-list');
  container.innerHTML = '';
  
  if (!state.activeForm.questions || state.activeForm.questions.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-list-ol"></i><h4>Nenhuma pergunta adicionada</h4><p>Clique em "Adicionar Pergunta" acima para começar a criar o questionário.</p></div>';
    return;
  }

  const tree = [];
  const stack = [tree];
  
  state.activeForm.questions.forEach((q, idx) => {
    q._origIdx = idx;
    if (q.type === 'begin_group' || q.type === 'begin_repeat') {
      const groupNode = { type: 'group', question: q, children: [] };
      stack[stack.length - 1].push(groupNode);
      stack.push(groupNode.children);
    } else if (q.type === 'end_group' || q.type === 'end_repeat') {
      if (stack.length > 1) {
        stack.pop();
      } else {
        stack[0].push({ type: 'item', question: q });
      }
    } else {
      stack[stack.length - 1].push({ type: 'item', question: q });
    }
  });

  function getQuestionRuleSummary(q) {
    if (q.constraint) {
      const c = q.constraint;
      if (c.includes('^[0-9]{11}$')) return 'CPF (11 dígitos)';
      if (c.includes('^[0-9]{10,11}$')) return 'WhatsApp / Celular';
      if (c.includes('@')) return 'E-mail Válido';
      if (c.includes('string-length')) {
        const m = c.match(/string-length\(\.\)\s*>=\s*(\d+)/);
        if (m) return `Mín. ${m[1]} caracteres`;
        return 'Tamanho de texto';
      }
      if (c.includes('>= 16') && c.includes('<= 120')) return 'Idade (16 a 120 anos)';
      if (c.includes('>= 0') && c.includes('<= 100')) return 'Percentual (0 a 100%)';
      if (c.includes('>= 0') && c.includes('<= 10')) return 'Escala NPS (0 a 10)';
      if (c.includes('> 0')) return 'Valor > 0';
      if (c.includes('today()')) return 'Data Válida';
      if (c.includes('count-selected')) {
        if (q.min_selections && q.max_selections && q.min_selections === q.max_selections) return `Exatamente ${q.min_selections} opção`;
        if (q.max_selections) return `Até ${q.max_selections} opções`;
        if (q.min_selections) return `Mín. ${q.min_selections} opções`;
      }
      return 'Validação Ativa';
    }
    if (q.min_selections || q.max_selections) {
      if (q.min_selections && q.max_selections && q.min_selections === q.max_selections) return `Exatamente ${q.min_selections} opção`;
      if (q.max_selections) return `Até ${q.max_selections} opções`;
      if (q.min_selections) return `Mín. ${q.min_selections} opções`;
    }
    return '';
  }

  function createCardHtml(q, isGroupHeader = false) {
    const idx = q._origIdx;
    const isChoice = q.type === 'single_choice' || q.type === 'select_one' || q.type === 'multiple_choice' || q.type === 'select_multiple';
    let optionsHtml = '';
    if (isChoice) {
      optionsHtml = '<div style="margin-top:0.5rem;">';
      (q.options || []).forEach((opt, oi) => {
        const val = typeof opt === 'object' ? opt.label : opt;
        const nameVal = typeof opt === 'object' ? opt.name : val.toLowerCase().replace(/[^a-z0-9]/g,'_');
        optionsHtml += `
          <div class="sys-choice-row">
            <button class="sys-choice-trash" onclick="removeOption(${idx},${oi})" title="Excluir"><i class="fa-solid fa-trash"></i></button>
            <input type="text" class="sys-choice-input" value="${val}" onchange="updateOption(${idx},${oi},this.value)" placeholder="Texto da Opção" />
            <input type="text" class="sys-choice-pill" value="${nameVal}" onchange="updateOptionName(${idx},${oi},this.value)" style="border:none; outline:none; font-family:var(--font-mono); cursor:text; width:150px;" title="Editar Nome Interno (ID)" />
          </div>
        `;
      });
      optionsHtml += `
        <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.4rem;">
          <div class="sys-add-choice" onclick="addOption(${idx})" title="Adicionar Opção" style="flex:1;">+ Adicionar nova opção...</div>
          <button type="button" class="btn btn-sm btn-outline" onclick="openBatchOptionsModal(${idx})" title="Colar Lista de Opções (Candidatos, Bairros, etc.)" style="padding:0.25rem 0.65rem; font-size:0.75rem; border-color:var(--border-cyan); color:var(--cyan); white-space:nowrap; background:rgba(6,182,212,0.06);">
            <i class="fa-solid fa-list-check"></i> + Colar Lista
          </button>
        </div>
      </div>`;
    }

    const hasLogic = (q._logic && q._logic.length > 0) || (q.relevant && q.relevant.trim() !== '');
    let logicBadge = '';
    if (hasLogic) {
      let labelText = 'Lógica Condicional';
      if (q._logic && q._logic.length > 0 && q._logic[0].target) {
        labelText = `Se [${q._logic[0].target.substring(0, 16)}${q._logic[0].target.length > 16 ? '...' : ''}] ${q._logic[0].op} ${q._logic[0].valLabel || q._logic[0].val}`;
        if (q._logic.length > 1) labelText += ` (+${q._logic.length - 1})`;
      } else if (q.relevant) {
        labelText = q.relevant.length > 25 ? q.relevant.substring(0, 23) + '...' : q.relevant;
      }
      logicBadge = `<span class="sys-cond-badge" onclick="openAdvLogicModal(${idx})" title="Lógica de Pulo Ativa — Clique para editar"><i class="fa-solid fa-code-branch"></i> ${labelText}</span>`;
    }

    const ruleSummary = getQuestionRuleSummary(q);
    const hasRules = !!ruleSummary;
    let ruleBadge = '';
    if (hasRules) {
      ruleBadge = `<span class="sys-rule-badge" onclick="openQuestionSettingsModal(${idx})" title="Regra de Validação Ativa — Clique para editar"><i class="fa-solid fa-shield-halved"></i> ${ruleSummary}</span>`;
    }

    const typeOptions = `
            <option value="text" ${q.type==='text'?'selected':''}>Texto Livre</option>
            <option value="number" ${q.type==='number'?'selected':''}>Número</option>
            <option value="decimal" ${q.type==='decimal'?'selected':''}>Decimal</option>
            <option value="integer" ${q.type==='integer'?'selected':''}>Número (Inteiro)</option>
            <option value="single_choice" ${q.type==='single_choice'||q.type==='select_one'?'selected':''}>Seleção Única</option>
            <option value="multiple_choice" ${q.type==='multiple_choice'||q.type==='select_multiple'?'selected':''}>Múltipla Escolha</option>
            <option value="geopoint" ${q.type==='geopoint'?'selected':''}>Ponto (GPS)</option>
            <option value="geotrace" ${q.type==='geotrace'?'selected':''}>Linha</option>
            <option value="geoshape" ${q.type==='geoshape'?'selected':''}>Área</option>
            <option value="image" ${q.type==='image'?'selected':''}>Foto / Imagem</option>
            <option value="video" ${q.type==='video'?'selected':''}>Vídeo</option>
            <option value="audio_record" ${q.type==='audio_record'||q.type==='audio'?'selected':''}>Áudio</option>
            <option value="date" ${q.type==='date'?'selected':''}>Data</option>
            <option value="time" ${q.type==='time'?'selected':''}>Hora</option>
            <option value="datetime" ${q.type==='datetime'?'selected':''}>Data e Horário</option>
            <option value="note" ${q.type==='note'?'selected':''}>Nota / Aviso</option>
            <option value="barcode" ${q.type==='barcode'?'selected':''}>Cód. Barras</option>
            <option value="acknowledge" ${q.type==='acknowledge'?'selected':''}>Reconhece</option>
            <option value="rank" ${q.type==='rank'?'selected':''}>Classificação</option>
            <option value="calculate" ${q.type==='calculate'?'selected':''}>Calcular</option>
            <option value="hidden" ${q.type==='hidden'?'selected':''}>Oculto</option>
            <option value="file" ${q.type==='file'?'selected':''}>Arquivo</option>
            <option value="range" ${q.type==='range'?'selected':''}>Intervalo</option>
    `;

    return `
      <div class="sys-question-left">
        <i class="sys-question-icon fa-solid fa-bars drag-handle" style="cursor:grab; font-size: 1.2rem;"></i>
      </div>
      <div class="sys-question-center">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; flex:1;">
            <div style="background: var(--primary-light); color: var(--primary); font-weight: bold; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 10px; font-size: 0.9rem; flex-shrink: 0;">${idx+1}</div>
            <input type="text" class="sys-question-text" value="${q.text || ''}" onchange="updateQText(${idx},this.value)" placeholder="${isGroupHeader ? 'Nome do Grupo/Repetição...' : 'Escreva a pergunta aqui...'}" style="flex:1; font-weight:${isGroupHeader?'bold':'normal'};" />
            ${isGroupHeader ? '' : `<button class="sys-btn-piping" onclick="openPipingModal(${idx})" title="Inserir Variável (Piping)" style="background:transparent; border:none; color:var(--primary); cursor:pointer; padding:5px;"><i class="fa-solid fa-wand-magic-sparkles"></i></button>`}
          </div>
          ${isGroupHeader ? 
            `<span style="font-size:0.8rem; color:#64748b; margin-left:10px;">${q.type === 'begin_group' ? 'Grupo' : 'Repetição'}</span>` : 
            `<select style="border:none; color:#64748b; font-size:0.8rem; outline:none; background:transparent; cursor:pointer; margin-left: 10px;" onchange="updateQType(${idx},this.value)">${typeOptions}</select>`
          }
        </div>
        <div style="margin-left: 40px; display:flex; align-items:center; gap:8px; margin-top:5px; flex-wrap:wrap;">
           <span style="font-size:0.75rem; color:var(--text-muted); margin-right:2px;">ID:</span>
           <input type="text" value="${q.id || ''}" onchange="updateQName(${idx},this.value)" placeholder="auto_gerado" style="font-family:var(--font-mono); font-size:0.75rem; border:1px solid var(--border); background:rgba(0,0,0,0.25); color:var(--text-secondary); width:150px; outline:none; padding:2px 6px; border-radius:var(--radius-sm);" onfocus="this.style.borderColor='var(--border-cyan)';" onblur="this.style.borderColor='var(--border)';" title="Identificador único (name)" />
           ${logicBadge}
           ${ruleBadge}
        </div>
        ${isGroupHeader ? '' : `<input type="text" class="sys-question-hint" value="${q.hint || ''}" onchange="updateQHint(${idx},this.value)" placeholder="Dica de preenchimento (opcional)..." style="margin-left: 40px; width: calc(100% - 40px);" />`}
        <div style="margin-left: 40px;">${optionsHtml}</div>
      </div>
      <div class="sys-question-right" style="flex-direction:row; align-items:flex-start;">
        <button class="sys-btn-required ${q.required ? 'active' : ''}" onclick="toggleQRequired(${idx})" title="${q.required ? 'Obrigatória (Ativa)' : 'Tornar Obrigatória'}"><i class="fa-solid fa-asterisk"></i></button>
        ${isGroupHeader ? '' : `<button class="sys-btn-gear sys-btn-rules ${hasRules ? 'has-rules' : ''}" onclick="openQuestionSettingsModal(${idx})" title="Regras & Validações Inteligentes"><i class="fa-solid fa-shield-halved"></i></button>`}
        <button class="sys-btn-trash" onclick="confirmDeleteQuestion(${idx})" title="Excluir"><i class="fa-solid fa-trash"></i></button>
        <button class="sys-btn-copy" onclick="duplicateQuestion(${idx})" title="Duplicar"><i class="fa-solid fa-copy"></i></button>
        ${isGroupHeader ? '' : `<button class="sys-btn-branch ${hasLogic ? 'has-logic' : ''}" onclick="openAdvLogicModal(${idx})" title="Lógica de Pulo Condicional"><i class="fa-solid fa-code-branch"></i></button>`}
      </div>
    `;
  }

  function renderTree(nodes, parentEl) {
    nodes.forEach(node => {
      if (node.type === 'group') {
        const groupEl = document.createElement('div');
        groupEl.className = 'group-container';
        groupEl.dataset.isGroup = 'true';
        groupEl.dataset.origIdx = node.question._origIdx;
        groupEl.dataset.groupType = node.question.type;

        const headerEl = document.createElement('div');
        headerEl.className = 'sys-question-row';
        headerEl.style.border = 'none';
        headerEl.style.marginBottom = '0';
        headerEl.style.padding = '10px 15px';
        headerEl.innerHTML = createCardHtml(node.question, true);
        
        const bodyEl = document.createElement('div');
        bodyEl.className = 'group-body sortable-list';
        bodyEl.style.padding = '10px';
        bodyEl.style.minHeight = '50px';

        renderTree(node.children, bodyEl);

        const insertBtn = document.createElement('div');
        insertBtn.className = 'insert-btn';
        insertBtn.innerHTML = `<button class="btn btn-sm" onclick="setInsertIndex(${node.question._origIdx + node.children.length + 1})" title="Inserir Pergunta"><i class="fa-solid fa-plus"></i></button>`;

        groupEl.appendChild(headerEl);
        groupEl.appendChild(bodyEl);
        groupEl.appendChild(insertBtn);
        parentEl.appendChild(groupEl);

      } else {
        const card = document.createElement('div');
        card.className = 'sys-question-row item-row';
        card.dataset.origIdx = node.question._origIdx;
        card.innerHTML = createCardHtml(node.question, false);
        parentEl.appendChild(card);

        const insertBtn = document.createElement('div');
        insertBtn.className = 'insert-btn';
        insertBtn.innerHTML = `<button class="btn btn-sm" onclick="setInsertIndex(${node.question._origIdx + 1})" title="Inserir Pergunta"><i class="fa-solid fa-plus"></i></button>`;
        parentEl.appendChild(insertBtn);
      }
    });
  }

  container.classList.add('sortable-list');
  renderTree(tree, container);

  const sortables = document.querySelectorAll('.sortable-list');
  sortables.forEach(el => {
    new Sortable(el, {
      group: 'shared',
      animation: 150,
      handle: '.drag-handle',
      fallbackOnBody: true,
      swapThreshold: 0.65,
      onEnd: function (evt) {
        rebuildArrayFromDOM();
      }
    });
  });
}

function rebuildArrayFromDOM() {
  const container = document.getElementById('builder-questions-list');
  const newArray = [];
  
  function walk(el) {
    Array.from(el.children).forEach(child => {
      if (child.classList.contains('item-row')) {
        const idx = parseInt(child.dataset.origIdx);
        if(!isNaN(idx)) newArray.push(state.activeForm.questions[idx]);
      } else if (child.classList.contains('group-container')) {
        const groupIdx = parseInt(child.dataset.origIdx);
        if(!isNaN(groupIdx)) {
          const groupQ = state.activeForm.questions[groupIdx];
          newArray.push(groupQ);
          
          const body = child.querySelector('.group-body');
          if (body) walk(body);
          
          newArray.push({
            id: 'end_' + crypto.randomUUID().substring(0,8),
            type: groupQ.type === 'begin_repeat' ? 'end_repeat' : 'end_group'
          });
        }
      }
    });
  }
  
  walk(container);
  
  state.activeForm.questions = newArray;
  renderBuilderQuestions();
}

window.setInsertIndex = function(idx) {
  window.insertQuestionIndex = idx;
  const btnAdd = document.getElementById('btn-add-question');
  if(btnAdd) btnAdd.click();
};

window.updateQName = function(idx, val) {
  const safeVal = val.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0,50);
  const isDuplicate = state.activeForm.questions.some((q, i) => i !== idx && q.id === safeVal);
  if (isDuplicate) {
    showToast('error', 'Este ID (name) já está sendo usado por outra pergunta.');
    renderBuilderQuestions();
    return;
  }
  state.activeForm.questions[idx].id = safeVal || ('q_' + crypto.randomUUID().substring(0,8));
  renderBuilderQuestions();
};

window.updateQText = function(idx, val) { 
  state.activeForm.questions[idx].text = val; 
  const q = state.activeForm.questions[idx];
  if(q.id && (q.id.startsWith('q_') || q.id.length > 20)) {
    const autoName = val.toLowerCase().replace(/[áàãâä]/g,'a').replace(/[éèêë]/g,'e').replace(/[íìîï]/g,'i').replace(/[óòõôö]/g,'o').replace(/[úùûü]/g,'u').replace(/ç/g,'c').replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').substring(0,30);
    if(autoName && !state.activeForm.questions.some((oq, i) => i !== idx && oq.id === autoName)) {
      q.id = autoName;
    }
  }
  renderBuilderQuestions();
};

// Question handlers
window.updateQType = (idx, val) => { state.activeForm.questions[idx].type = val; if(!state.activeForm.questions[idx].options) state.activeForm.questions[idx].options=[]; renderBuilderQuestions(); };
window.addOption = (idx) => { 
  if(!state.activeForm.questions[idx].options) state.activeForm.questions[idx].options=[];
  state.activeForm.questions[idx].options.push({ name: 'opt_'+crypto.randomUUID().substring(0,6), label: 'Nova opção' }); 
  renderBuilderQuestions(); 
};
window.removeOption = (idx, oi) => {
  if (state.activeForm.questions[idx].options.length <= 1) { showToast('warning', 'A pergunta precisa ter pelo menos uma opção.'); return; }
  state.activeForm.questions[idx].options.splice(oi, 1); renderBuilderQuestions();
};
window.updateOption = (idx, oi, val) => { 
  let opt = state.activeForm.questions[idx].options[oi];
  if(typeof opt === 'string') state.activeForm.questions[idx].options[oi] = { name: opt, label: val };
  else opt.label = val; 
};
window.updateOptionName = (idx, oi, val) => { 
  const q = state.activeForm.questions[idx];
  let opt = q.options[oi];
  let safeVal = val.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  
  const isDuplicate = q.options.some((o, i) => i !== oi && (typeof o === 'string' ? o : o.name) === safeVal);
  if (isDuplicate) {
    showToast('error', 'Este ID de opção já existe nesta pergunta.');
    renderBuilderQuestions();
    return;
  }

  if(typeof opt === 'string') q.options[oi] = { name: safeVal, label: opt };
  else opt.name = safeVal; 
};
window.updateQHint = (idx, val) => { state.activeForm.questions[idx].hint = val; };
window.toggleQRequired = (idx) => { 
  state.activeForm.questions[idx].required = !state.activeForm.questions[idx].required; 
  renderBuilderQuestions(); 
};
window.confirmDeleteQuestion = (idx) => {
  showConfirm('Excluir Pergunta', 'Tem certeza?', () => { state.activeForm.questions.splice(idx,1); renderBuilderQuestions(); });
};

window.openQuestionSettingsModal = (idx) => {
  const q = state.activeForm.questions[idx];
  document.getElementById('q-settings-id').value = idx;
  
  // Set type badge and label
  const typeBadgeEl = document.getElementById('q-settings-type-badge');
  const typeNames = {
    text: 'Texto Livre',
    integer: 'Número Inteiro',
    decimal: 'Número Decimal',
    number: 'Número',
    select_one: 'Escolha Única',
    single_choice: 'Escolha Única',
    select_multiple: 'Múltipla Escolha',
    multiple_choice: 'Múltipla Escolha',
    date: 'Data',
    datetime: 'Data e Hora',
    time: 'Hora',
    geopoint: 'Ponto GPS',
    geotrace: 'Linha GPS',
    geoshape: 'Área GPS',
    image: 'Foto / Câmera',
    audio: 'Áudio / Voz',
    audio_record: 'Áudio / Voz',
    video: 'Vídeo',
    range: 'Escala / Slider',
    calculate: 'Cálculo',
    barcode: 'Código de Barras',
    note: 'Nota / Aviso',
    acknowledge: 'Confirmação',
    rank: 'Ranking',
    hidden: 'Campo Oculto',
    file: 'Arquivo'
  };
  const typeIcons = {
    text: 'fa-font',
    integer: 'fa-hashtag',
    decimal: 'fa-square-root-variable',
    number: 'fa-hashtag',
    select_one: 'fa-circle-dot',
    single_choice: 'fa-circle-dot',
    select_multiple: 'fa-list-check',
    multiple_choice: 'fa-list-check',
    date: 'fa-calendar-days',
    datetime: 'fa-calendar-plus',
    time: 'fa-clock',
    geopoint: 'fa-location-dot',
    geotrace: 'fa-route',
    geoshape: 'fa-draw-polygon',
    image: 'fa-camera',
    audio: 'fa-microphone',
    audio_record: 'fa-microphone',
    video: 'fa-video',
    range: 'fa-sliders',
    calculate: 'fa-calculator',
    barcode: 'fa-barcode',
    note: 'fa-circle-info',
    acknowledge: 'fa-check-double',
    rank: 'fa-arrow-down-1-9',
    hidden: 'fa-eye-slash',
    file: 'fa-file-arrow-up'
  };

  const isText = q.type === 'text';
  const isNum = q.type === 'integer' || q.type === 'decimal' || q.type === 'number';
  const isMult = q.type === 'select_multiple' || q.type === 'multiple_choice';
  const isDate = q.type === 'date' || q.type === 'datetime';
  const isGps = q.type === 'geopoint' || q.type === 'geotrace' || q.type === 'geoshape';

  if (typeBadgeEl) {
    const icon = typeIcons[q.type] || 'fa-sliders';
    const label = typeNames[q.type] || q.type;
    typeBadgeEl.innerHTML = `<i class="fa-solid ${icon}"></i> Pergunta ${idx + 1}: ${label}`;
  }

  // Toggle Presets Containers
  const pText = document.getElementById('q-presets-text');
  const pNum = document.getElementById('q-presets-number');
  const pMult = document.getElementById('q-presets-mult');
  const pDate = document.getElementById('q-presets-date');
  const pGps = document.getElementById('q-presets-gps');

  if (pText) pText.style.display = isText ? 'grid' : 'none';
  if (pNum) pNum.style.display = isNum ? 'grid' : 'none';
  if (pMult) pMult.style.display = isMult ? 'grid' : 'none';
  if (pDate) pDate.style.display = isDate ? 'grid' : 'none';
  if (pGps) pGps.style.display = isGps ? 'grid' : 'none';

  // Toggle Fine-tuning Sections
  const textLimitsDiv = document.getElementById('q-settings-text-limits');
  const numLimitsDiv = document.getElementById('q-settings-num-limits');
  const limitDiv = document.getElementById('q-settings-select-limits');
  const cfDiv = document.getElementById('q-settings-choice-filter');
  const rangeDiv = document.getElementById('q-settings-range-params');
  const calcDiv = document.getElementById('q-settings-calc-params');

  if (textLimitsDiv) textLimitsDiv.style.display = isText ? 'flex' : 'none';
  if (numLimitsDiv) numLimitsDiv.style.display = isNum ? 'flex' : 'none';
  if (limitDiv) limitDiv.style.display = isMult ? 'flex' : 'none';
  if (cfDiv) cfDiv.style.display = (q.type === 'select_one' || q.type === 'single_choice' || isMult) ? 'block' : 'none';
  if (rangeDiv) rangeDiv.style.display = (q.type === 'range') ? 'block' : 'none';
  if (calcDiv) calcDiv.style.display = (q.type === 'calculate') ? 'block' : 'none';

  // Populate Values
  const c = q.constraint || '';
  
  // Standard Operator match
  const match = c.match(/^\.\s*(=|!=|>|<|>=|<=)\s*(.+)$/);
  if (match) {
    document.getElementById('q-settings-constraint-op').value = match[1];
    document.getElementById('q-settings-constraint-val').value = match[2];
  } else {
    document.getElementById('q-settings-constraint-op').value = '';
    document.getElementById('q-settings-constraint-val').value = '';
  }

  // Parse text min/max
  const matchTextMin = c.match(/string-length\(\.\)\s*>=\s*(\d+)/);
  const matchTextMax = c.match(/string-length\(\.\)\s*<=\s*(\d+)/);
  if (document.getElementById('q-settings-text-min')) {
    document.getElementById('q-settings-text-min').value = matchTextMin ? matchTextMin[1] : '';
  }
  if (document.getElementById('q-settings-text-max')) {
    document.getElementById('q-settings-text-max').value = matchTextMax ? matchTextMax[1] : '';
  }

  // Parse number min/max
  const matchNumRange = c.match(/\.\s*>=\s*(-?\d+(?:\.\d+)?)\s+and\s+\.\s*<=\s*(-?\d+(?:\.\d+)?)/);
  if (document.getElementById('q-settings-num-min')) {
    if (matchNumRange) {
      document.getElementById('q-settings-num-min').value = matchNumRange[1];
    } else {
      const matchMinOnly = c.match(/\.\s*>=\s*(-?\d+(?:\.\d+)?)/);
      document.getElementById('q-settings-num-min').value = matchMinOnly ? matchMinOnly[1] : '';
    }
  }
  if (document.getElementById('q-settings-num-max')) {
    if (matchNumRange) {
      document.getElementById('q-settings-num-max').value = matchNumRange[2];
    } else {
      const matchMaxOnly = c.match(/\.\s*<=\s*(-?\d+(?:\.\d+)?)/);
      document.getElementById('q-settings-num-max').value = matchMaxOnly ? matchMaxOnly[1] : '';
    }
  }

  // Parse select_multiple limits
  if (document.getElementById('q-settings-min-sel')) {
    document.getElementById('q-settings-min-sel').value = q.min_selections || '';
  }
  if (document.getElementById('q-settings-max-sel')) {
    document.getElementById('q-settings-max-sel').value = q.max_selections || '';
  }

  // Choice Filter
  if (document.getElementById('q-settings-cf-formula')) {
    document.getElementById('q-settings-cf-formula').value = q.choice_filter || '';
  }

  // Range
  if (rangeDiv && q.type === 'range') {
    document.getElementById('q-settings-range-start').value = q.parameters?.start || 1;
    document.getElementById('q-settings-range-end').value = q.parameters?.end || 10;
    document.getElementById('q-settings-range-step').value = q.parameters?.step || 1;
  }

  // Calculate
  if (calcDiv && q.type === 'calculate') {
    document.getElementById('q-settings-calc-formula').value = q.parameters?.calculation || '';
  }

  // Error message
  document.getElementById('q-settings-constraint-msg').value = q.constraint_message || '';

  // Formula preview
  const previewEl = document.getElementById('q-settings-formula-preview');
  if (previewEl) {
    previewEl.textContent = q.constraint || '(Nenhuma regra ativa)';
  }

  document.getElementById('question-settings-modal').classList.add('active');
};

window.closeQuestionSettingsModal = () => {
  document.getElementById('question-settings-modal').classList.remove('active');
};

window.applyRulePreset = (presetType, param) => {
  const idx = parseInt(document.getElementById('q-settings-id').value, 10);
  const q = state.activeForm.questions[idx];
  if (!q) return;

  const msgInput = document.getElementById('q-settings-constraint-msg');
  const prevEl = document.getElementById('q-settings-formula-preview');
  
  if (presetType === 'cpf') {
    q.constraint = "regex(., '^[0-9]{11}$')";
    q.constraint_message = "CPF inválido. Digite exatamente os 11 números sem pontos ou traços.";
  } else if (presetType === 'phone') {
    q.constraint = "regex(., '^[0-9]{10,11}$')";
    q.constraint_message = "Telefone inválido. Digite o DDD + número (10 ou 11 dígitos).";
  } else if (presetType === 'email') {
    q.constraint = "regex(., '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$')";
    q.constraint_message = "Por favor, informe um endereço de e-mail válido.";
  } else if (presetType === 'min_chars') {
    const min = param || 15;
    q.constraint = `string-length(.) >= ${min}`;
    q.constraint_message = `Por favor, elabore sua resposta com no mínimo ${min} caracteres.`;
    const tMin = document.getElementById('q-settings-text-min');
    if (tMin) tMin.value = min;
  } else if (presetType === 'age_16_120') {
    q.constraint = ". >= 16 and . <= 120";
    q.constraint_message = "A idade permitida deve estar entre 16 e 120 anos.";
    const nMin = document.getElementById('q-settings-num-min');
    const nMax = document.getElementById('q-settings-num-max');
    if (nMin) nMin.value = 16;
    if (nMax) nMax.value = 120;
  } else if (presetType === 'percent_0_100') {
    q.constraint = ". >= 0 and . <= 100";
    q.constraint_message = "O percentual deve ser um valor entre 0% e 100%.";
    const nMin = document.getElementById('q-settings-num-min');
    const nMax = document.getElementById('q-settings-num-max');
    if (nMin) nMin.value = 0;
    if (nMax) nMax.value = 100;
  } else if (presetType === 'score_0_10') {
    q.constraint = ". >= 0 and . <= 10";
    q.constraint_message = "A nota deve ser entre 0 e 10.";
    const nMin = document.getElementById('q-settings-num-min');
    const nMax = document.getElementById('q-settings-num-max');
    if (nMin) nMin.value = 0;
    if (nMax) nMax.value = 10;
  } else if (presetType === 'positive') {
    q.constraint = ". > 0";
    q.constraint_message = "O valor deve ser obrigatoriamente maior que zero.";
    const op = document.getElementById('q-settings-constraint-op');
    const val = document.getElementById('q-settings-constraint-val');
    if (op) op.value = '>';
    if (val) val.value = '0';
  } else if (presetType === 'mult_exact') {
    const count = param || 1;
    q.min_selections = count;
    q.max_selections = count;
    q.constraint = `count-selected(.) = ${count}`;
    q.constraint_message = `Selecione exatamente ${count} opção(ões).`;
    const minS = document.getElementById('q-settings-min-sel');
    const maxS = document.getElementById('q-settings-max-sel');
    if (minS) minS.value = count;
    if (maxS) maxS.value = count;
  } else if (presetType === 'mult_max') {
    const max = param || 2;
    delete q.min_selections;
    q.max_selections = max;
    q.constraint = `count-selected(.) <= ${max}`;
    q.constraint_message = `Você pode escolher no máximo ${max} opções.`;
    const minS = document.getElementById('q-settings-min-sel');
    const maxS = document.getElementById('q-settings-max-sel');
    if (minS) minS.value = '';
    if (maxS) maxS.value = max;
  } else if (presetType === 'date_past') {
    q.constraint = ". <= today()";
    q.constraint_message = "A data informada não pode ser no futuro.";
  } else if (presetType === 'date_future') {
    q.constraint = ". >= today()";
    q.constraint_message = "Apenas datas a partir de hoje são permitidas.";
  } else if (presetType === 'gps_high') {
    q.constraint = "accuracy(.) < 10";
    q.constraint_message = "Precisão GPS insuficiente (> 10m). Aguarde melhor sinal de satélite.";
  } else if (presetType === 'gps_standard') {
    q.constraint = "accuracy(.) < 25";
    q.constraint_message = "Precisão GPS insuficiente (> 25m). Aguarde estabilização do sinal.";
  } else if (presetType === 'clear') {
    delete q.constraint;
    delete q.constraint_message;
    delete q.min_selections;
    delete q.max_selections;
    if (document.getElementById('q-settings-text-min')) document.getElementById('q-settings-text-min').value = '';
    if (document.getElementById('q-settings-text-max')) document.getElementById('q-settings-text-max').value = '';
    if (document.getElementById('q-settings-num-min')) document.getElementById('q-settings-num-min').value = '';
    if (document.getElementById('q-settings-num-max')) document.getElementById('q-settings-num-max').value = '';
    if (document.getElementById('q-settings-min-sel')) document.getElementById('q-settings-min-sel').value = '';
    if (document.getElementById('q-settings-max-sel')) document.getElementById('q-settings-max-sel').value = '';
    if (document.getElementById('q-settings-constraint-op')) document.getElementById('q-settings-constraint-op').value = '';
    if (document.getElementById('q-settings-constraint-val')) document.getElementById('q-settings-constraint-val').value = '';
  }

  if (msgInput) msgInput.value = q.constraint_message || '';
  if (prevEl) prevEl.textContent = q.constraint || '(Nenhuma regra ativa)';
  showToast('info', presetType === 'clear' ? 'Regras removidas. Pergunta livre.' : 'Modelo de validação aplicado!');
};

window.syncManualTextRules = () => {
  const minVal = document.getElementById('q-settings-text-min')?.value.trim();
  const maxVal = document.getElementById('q-settings-text-max')?.value.trim();
  const prevEl = document.getElementById('q-settings-formula-preview');
  const msgInput = document.getElementById('q-settings-constraint-msg');

  let conds = [];
  let msgParts = [];
  if (minVal) {
    conds.push(`string-length(.) >= ${minVal}`);
    msgParts.push(`mínimo de ${minVal}`);
  }
  if (maxVal) {
    conds.push(`string-length(.) <= ${maxVal}`);
    msgParts.push(`máximo de ${maxVal}`);
  }

  if (conds.length > 0) {
    const formula = conds.join(' and ');
    if (prevEl) prevEl.textContent = formula;
    if (msgInput && (!msgInput.value || msgInput.value.includes('caracteres'))) {
      msgInput.value = `O texto deve ter ${msgParts.join(' e ')} caracteres.`;
    }
  } else {
    if (prevEl) prevEl.textContent = '(Nenhuma regra ativa)';
  }
};

window.syncManualNumRules = () => {
  const minVal = document.getElementById('q-settings-num-min')?.value.trim();
  const maxVal = document.getElementById('q-settings-num-max')?.value.trim();
  const prevEl = document.getElementById('q-settings-formula-preview');
  const msgInput = document.getElementById('q-settings-constraint-msg');

  let conds = [];
  if (minVal) conds.push(`. >= ${minVal}`);
  if (maxVal) conds.push(`. <= ${maxVal}`);

  if (conds.length > 0) {
    const formula = conds.join(' and ');
    if (prevEl) prevEl.textContent = formula;
    if (msgInput && (!msgInput.value || msgInput.value.includes('valor deve estar') || msgInput.value.includes('Valor'))) {
      if (minVal && maxVal) msgInput.value = `O valor deve estar entre ${minVal} e ${maxVal}.`;
      else if (minVal) msgInput.value = `O valor deve ser maior ou igual a ${minVal}.`;
      else msgInput.value = `O valor deve ser menor ou igual a ${maxVal}.`;
    }
  } else {
    if (prevEl) prevEl.textContent = '(Nenhuma regra ativa)';
  }
};

window.syncManualMultRules = () => {
  const minSel = parseInt(document.getElementById('q-settings-min-sel')?.value, 10);
  const maxSel = parseInt(document.getElementById('q-settings-max-sel')?.value, 10);
  const prevEl = document.getElementById('q-settings-formula-preview');
  const msgInput = document.getElementById('q-settings-constraint-msg');

  let conds = [];
  if (!isNaN(minSel) && !isNaN(maxSel) && minSel === maxSel) {
    conds.push(`count-selected(.) = ${minSel}`);
  } else {
    if (!isNaN(minSel)) conds.push(`count-selected(.) >= ${minSel}`);
    if (!isNaN(maxSel)) conds.push(`count-selected(.) <= ${maxSel}`);
  }

  if (conds.length > 0) {
    const formula = conds.join(' and ');
    if (prevEl) prevEl.textContent = formula;
    if (msgInput && (!msgInput.value || msgInput.value.includes('opções') || msgInput.value.includes('opção'))) {
      if (!isNaN(minSel) && !isNaN(maxSel) && minSel === maxSel) {
        msgInput.value = `Selecione exatamente ${minSel} opção(ões).`;
      } else if (!isNaN(minSel) && !isNaN(maxSel)) {
        msgInput.value = `Selecione entre ${minSel} e ${maxSel} opções.`;
      } else if (!isNaN(maxSel)) {
        msgInput.value = `Selecione no máximo ${maxSel} opções.`;
      } else {
        msgInput.value = `Selecione pelo menos ${minSel} opção(ões).`;
      }
    }
  } else {
    if (prevEl) prevEl.textContent = '(Nenhuma regra ativa)';
  }
};

window.syncManualConstraintOp = () => {
  const op = document.getElementById('q-settings-constraint-op')?.value;
  const val = document.getElementById('q-settings-constraint-val')?.value.trim();
  const prevEl = document.getElementById('q-settings-formula-preview');
  if (op && val) {
    if (prevEl) prevEl.textContent = `. ${op} ${val}`;
  }
};

window.saveQuestionSettings = () => {
  const idx = parseInt(document.getElementById('q-settings-id').value, 10);
  const q = state.activeForm.questions[idx];
  if (!q) return;

  const msgInputVal = document.getElementById('q-settings-constraint-msg').value.trim();
  const isText = q.type === 'text';
  const isNum = q.type === 'integer' || q.type === 'decimal' || q.type === 'number';
  const isMult = q.type === 'select_multiple' || q.type === 'multiple_choice';

  // Evaluate which rule was defined
  if (isText) {
    const minVal = document.getElementById('q-settings-text-min')?.value.trim();
    const maxVal = document.getElementById('q-settings-text-max')?.value.trim();
    let conds = [];
    if (minVal) conds.push(`string-length(.) >= ${minVal}`);
    if (maxVal) conds.push(`string-length(.) <= ${maxVal}`);
    
    if (conds.length > 0) {
      q.constraint = conds.join(' and ');
    } else {
      // Check if standard operator was used
      const op = document.getElementById('q-settings-constraint-op')?.value;
      const val = document.getElementById('q-settings-constraint-val')?.value.trim();
      if (op && val) q.constraint = `. ${op} '${val}'`;
      else if (q.constraint && q.constraint.includes('string-length')) delete q.constraint;
    }
  } else if (isNum) {
    const minVal = document.getElementById('q-settings-num-min')?.value.trim();
    const maxVal = document.getElementById('q-settings-num-max')?.value.trim();
    let conds = [];
    if (minVal) conds.push(`. >= ${minVal}`);
    if (maxVal) conds.push(`. <= ${maxVal}`);

    if (conds.length > 0) {
      q.constraint = conds.join(' and ');
    } else {
      const op = document.getElementById('q-settings-constraint-op')?.value;
      const val = document.getElementById('q-settings-constraint-val')?.value.trim();
      if (op && val) q.constraint = `. ${op} ${val}`;
      else if (q.constraint && q.constraint.includes('.')) delete q.constraint;
    }
  } else if (isMult) {
    const minSel = parseInt(document.getElementById('q-settings-min-sel')?.value, 10);
    const maxSel = parseInt(document.getElementById('q-settings-max-sel')?.value, 10);
    if (!isNaN(minSel)) q.min_selections = minSel; else delete q.min_selections;
    if (!isNaN(maxSel)) q.max_selections = maxSel; else delete q.max_selections;
    
    let conds = [];
    if (!isNaN(minSel) && !isNaN(maxSel) && minSel === maxSel) {
      conds.push(`count-selected(.) = ${minSel}`);
    } else {
      if (!isNaN(minSel)) conds.push(`count-selected(.) >= ${minSel}`);
      if (!isNaN(maxSel)) conds.push(`count-selected(.) <= ${maxSel}`);
    }
    if (conds.length > 0) {
      q.constraint = conds.join(' and ');
    } else if (q.constraint && q.constraint.includes('count-selected')) {
      delete q.constraint;
    }
  } else {
    // Other question types (date, geopoint, etc.)
    const op = document.getElementById('q-settings-constraint-op')?.value;
    const val = document.getElementById('q-settings-constraint-val')?.value.trim();
    if (op && val) {
      q.constraint = `. ${op} ${val}`;
    }
  }

  // Save or delete constraint message
  if (msgInputVal && q.constraint) {
    q.constraint_message = msgInputVal;
  } else if (!q.constraint) {
    delete q.constraint_message;
  }

  // Choice Filter
  if (q.type === 'select_one' || q.type === 'single_choice' || isMult) {
    const cfVal = document.getElementById('q-settings-cf-formula')?.value.trim();
    if (cfVal) q.choice_filter = cfVal; else delete q.choice_filter;
  }

  // Range
  if (q.type === 'range') {
    if (!q.parameters) q.parameters = {};
    q.parameters.start = parseInt(document.getElementById('q-settings-range-start')?.value, 10) || 1;
    q.parameters.end = parseInt(document.getElementById('q-settings-range-end')?.value, 10) || 10;
    q.parameters.step = parseFloat(document.getElementById('q-settings-range-step')?.value) || 1;
  }

  // Calculate
  if (q.type === 'calculate') {
    if (!q.parameters) q.parameters = {};
    q.parameters.calculation = document.getElementById('q-settings-calc-formula')?.value.trim();
  }

  closeQuestionSettingsModal();
  renderBuilderQuestions();
  showToast('success', 'Regras de validação salvas com sucesso!');
};
window.confirmDeleteSkipRule = (qi, ri) => { showConfirm('Remover Regra', 'Deseja remover esta regra de pulo?', () => { state.activeForm.questions[qi].skipRules.splice(ri,1); renderBuilderQuestions(); }, { type:'warning' }); };
window.duplicateQuestion = (idx) => {
  const clone = JSON.parse(JSON.stringify(state.activeForm.questions[idx]));
  clone.id = clone.id + '_CPY';
  state.activeForm.questions.splice(idx+1, 0, clone);
  renderBuilderQuestions();
};
window.confirmDeleteQuestion = (idx) => {
  showConfirm('Excluir Pergunta', `Tem certeza que deseja excluir a pergunta ${idx+1}? Esta ação não pode ser desfeita.`, () => { state.activeForm.questions.splice(idx,1); renderBuilderQuestions(); }, { type:'danger', confirmText:'Excluir' });
};

async function saveActiveForm() {
  const title = document.getElementById('form-edit-title').value.trim();
  const status = document.getElementById('form-edit-status').value;
  if (!title) { showToast('warning', 'O nome do formulário não pode ficar vazio.'); return; }
  // Validate questions have text
  for (const q of state.activeForm.questions) {
    if (!q.text.trim()) { showToast('warning', 'Todas as perguntas precisam ter um texto.'); return; }
  }
  state.activeForm.title = title;
  state.activeForm.status = status;
  const btn = document.getElementById('btn-save-form');
  setButtonLoading(btn, true);
  try {
    state.activeForm.questions.forEach(q => {
      if (q.constraint && (!q.constraint_message || q.constraint_message.trim() === '')) {
        q.constraint_message = 'Valor inválido de acordo com as regras.';
      }
    });
    const payload = { 
      id: state.activeForm.id || undefined, 
      title, 
      status, 
      category: state.activeForm.category || 'geral',
      year: state.activeForm.year || new Date().getFullYear(),
      questions: state.activeForm.questions, 
      settings: state.activeForm.settings || {} 
    };
    const result = await apiFetch('/api/forms', { method:'POST', body:JSON.stringify(payload) });
    if (result.success) {
      showToast('success', `Formulário "${title}" salvo com sucesso!`);
      loadFormIntoBuilder(result.form);
      const warningsDiv = document.getElementById('skip-logic-errors');
      if (result.validation && result.validation.length > 0) {
        warningsDiv.classList.add('visible');
        warningsDiv.innerHTML = `<h4><i class="fa-solid fa-triangle-exclamation"></i> Avisos de Lógica (${result.validation.length})</h4><ul>${result.validation.map(e => `<li>${e.message}</li>`).join('')}</ul>`;
        showToast('warning', 'Foram encontrados avisos na lógica do formulário.');
      } else { warningsDiv.classList.remove('visible'); }
      await loadServerData();
      renderFormBuilderList();
    }
  } catch (err) { showToast('error', 'Erro ao salvar: ' + err.message); }
  setButtonLoading(btn, false);
}

// ===================== sys BUTTON HANDLERS =====================
window.closeFormBuilder = () => {
  if (state.activeProjectFormId) {
    switchTab('view-project-details');
    // Force refresh of the data just in case the form changed
    openProject(state.activeProjectFormId);
  } else {
    switchTab('view-dashboard');
  }
};

window.previewActiveForm = () => {
  if (!state.activeForm || !state.activeForm.questions || state.activeForm.questions.length === 0) {
    showToast('warning', 'Adicione pelo menos uma pergunta ao formulário antes de abrir no simulador.');
    return;
  }
  state.simActiveForm = JSON.parse(JSON.stringify(state.activeForm));
  state.simAnswers = {};
  state.simCurrentQuestionIdx = 0;
  switchTab('view-mobile-sim');
  renderMobileScreen();
  showToast('success', `Questionário carregado no simulador de campo.`);
};

window.toggleCollapseQuestions = () => {
  const container = document.getElementById('builder-questions-list');
  const isCollapsed = container.classList.toggle('sys-collapsed-view');
  showToast('info', isCollapsed ? 'Perguntas recolhidas (Visão em lista).' : 'Perguntas expandidas.');
};

window.duplicateActiveForm = () => {
  if (!state.activeForm.id) {
    showToast('warning', 'Salve o projeto original primeiro antes de duplicar.');
    return;
  }
  showConfirm('Duplicar Projeto', 'Deseja criar uma cópia exata deste formulário?', () => {
    const clone = JSON.parse(JSON.stringify(state.activeForm));
    delete clone.id;
    clone.title = clone.title + ' (Cópia)';
    clone.status = 'draft';
    loadFormIntoBuilder(clone);
    saveActiveForm();
  });
};

window.publishActiveVersion = async function() {
  const formId = state.activeForm && state.activeForm.id ? state.activeForm.id : state.activeProjectFormId;
  if (!formId) {
    if (state.activeForm) {
      state.activeForm.status = 'published';
      await saveActiveForm();
    }
    return;
  }

  showConfirm('Publicar Versão em Campo', 'Deseja congelar e publicar esta versão para coleta oficial no aplicativo ODK Collect?', async () => {
    try {
      showToast('info', 'Validando questionário e publicando versão...');
      const titleInput = document.getElementById('form-edit-title');
      if (titleInput && titleInput.value.trim()) {
        state.activeForm.title = titleInput.value.trim();
      }
      state.activeForm.status = 'published';

      const res = await fetch(`/api/forms/${formId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao publicar formulário.');

      showToast('success', `Questionário publicado com sucesso! Versão V${data.version || state.activeForm.version || 1} já está disponível para os celulares.`);
      await loadServerData();
      const updatedForm = state.forms.find(f => f.id === formId);
      if (updatedForm) {
        state.activeForm = JSON.parse(JSON.stringify(updatedForm));
        loadFormIntoBuilder(updatedForm);
      }
      if (typeof renderProjectVersionsTab === 'function') {
        renderProjectVersionsTab(formId);
      }
    } catch (err) {
      showToast('error', 'Erro ao publicar: ' + err.message);
    }
  });
};

window.createNewFormVersion = async function() {
  const formId = state.activeProjectFormId || (state.activeForm && state.activeForm.id);
  if (!formId) {
    showToast('warning', 'Salve o projeto antes de ramificar uma versão.');
    return;
  }

  showConfirm('Criar Nova Versão (Branch)', 'Isso criará uma nova versão como Rascunho (V+1), permitindo alterar perguntas e lógica com total segurança sem quebrar as entrevistas já coletadas da versão anterior. Deseja continuar?', async () => {
    try {
      showToast('info', 'Criando nova versão...');
      const res = await fetch(`/api/forms/${formId}/new-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao gerar nova versão.');

      showToast('success', `Nova Versão V${data.version} criada em modo Rascunho! Você pode editá-la livremente.`);
      await loadServerData();
      const updatedForm = state.forms.find(f => f.id === formId);
      if (updatedForm) {
        state.activeForm = JSON.parse(JSON.stringify(updatedForm));
        loadFormIntoBuilder(updatedForm);
      }
      if (typeof renderProjectVersionsTab === 'function') {
        renderProjectVersionsTab(formId);
      }
    } catch (err) {
      showToast('error', 'Erro ao ramificar versão: ' + err.message);
    }
  });
};

window.toggleArchiveActiveProject = async function() {
  const formId = state.activeProjectFormId || (state.activeForm && state.activeForm.id);
  if (!formId) return;

  const currentForm = state.forms.find(f => f.id === formId);
  const isArchived = currentForm && currentForm.status === 'archived';
  const actionTitle = isArchived ? 'Reativar Projeto' : 'Arquivar Projeto';
  const actionMsg = isArchived 
    ? 'Deseja desarquivar este projeto e reabri-lo como Publicado para coletas de campo?'
    : 'Deseja arquivar este projeto? Novas submissões do aplicativo móvel serão bloqueadas, mas todos os dados, microdados e relatórios permanecerão 100% seguros e consultáveis.';

  showConfirm(actionTitle, actionMsg, async () => {
    try {
      const endpoint = isArchived ? `/api/forms/${formId}/unarchive` : `/api/forms/${formId}/archive`;
      const res = await fetch(endpoint, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao alterar estado do projeto.');

      showToast('success', isArchived ? 'Projeto reativado com sucesso!' : 'Projeto arquivado com sucesso.');
      await loadServerData();
      renderDashboard();
      if (typeof renderProjectVersionsTab === 'function') {
        renderProjectVersionsTab(formId);
      }
      const badgeTop = document.getElementById('pd-status-badge-top');
      if (badgeTop) {
        badgeTop.innerHTML = !isArchived 
          ? '<span class="sys-status-badge" style="background:rgba(71,85,105,0.4); color:#94a3b8;"><i class="fa-solid fa-box-archive"></i> Arquivado</span>'
          : '<span class="sys-status-badge" style="background:rgba(16,185,129,0.15); color:#34d399;"><span class="status-pulse-dot"></span> Publicado</span>';
      }
    } catch (err) {
      showToast('error', 'Erro: ' + err.message);
    }
  });
};

window.renderProjectVersionsTab = async function(formId) {
  if (!formId) return;
  const form = state.forms.find(f => f.id === formId);
  if (!form) return;

  const statusBadge = document.getElementById('proj-ver-status-badge');
  const numberBadge = document.getElementById('proj-ver-number-badge');
  const titleEl = document.getElementById('proj-ver-title');
  const descEl = document.getElementById('proj-ver-desc');
  const fieldStatusEl = document.getElementById('metric-field-status');
  const questionsCountEl = document.getElementById('metric-questions-count');
  const interviewsVerEl = document.getElementById('metric-interviews-this-ver');
  const btnPublish = document.getElementById('btn-tab-publish');
  const btnArchive = document.getElementById('btn-tab-archive');

  const curVer = form.version || 1;
  const curStatus = form.status || 'draft';
  const qCount = form.questions ? form.questions.length : 0;
  const intsThisVer = state.interviews.filter(i => i.form_id === formId && parseInt(i.form_version) === parseInt(curVer)).length;

  if (titleEl) titleEl.textContent = form.title;
  if (numberBadge) numberBadge.textContent = `VERSÃO ${curVer} (V${curVer})`;
  if (questionsCountEl) questionsCountEl.textContent = `${qCount} perguntas`;
  if (interviewsVerEl) interviewsVerEl.textContent = `${intsThisVer} coletas`;

  if (statusBadge) {
    if (curStatus === 'published') {
      statusBadge.className = 'badge badge-success';
      statusBadge.textContent = 'PUBLICADO';
      if (descEl) descEl.textContent = `Esta versão está congelada e ativa para coleta de campo. As entrevistas submetidas pelo aplicativo ficam registradas como V${curVer}.`;
      if (fieldStatusEl) {
        fieldStatusEl.innerHTML = '<span class="status-pulse-dot" style="display:inline-block; margin-right:4px;"></span> Aberto & Coletando';
        fieldStatusEl.style.color = '#10b981';
      }
      if (btnPublish) btnPublish.style.display = 'none';
      if (btnArchive) {
        btnArchive.innerHTML = '<i class="fa-solid fa-box-archive"></i> Arquivar Projeto';
        btnArchive.className = 'btn btn-sm btn-outline';
      }
    } else if (curStatus === 'archived') {
      statusBadge.className = 'badge badge-secondary';
      statusBadge.textContent = 'ARQUIVADO';
      if (descEl) descEl.textContent = `Este projeto foi arquivado e o campo foi encerrado. Nenhuma coleta nova pode ser enviada, mas o histórico permanece preservado para auditoria.`;
      if (fieldStatusEl) {
        fieldStatusEl.textContent = 'Campo Encerrado (Fechado)';
        fieldStatusEl.style.color = '#94a3b8';
      }
      if (btnPublish) btnPublish.style.display = 'none';
      if (btnArchive) {
        btnArchive.innerHTML = '<i class="fa-solid fa-box-open"></i> Reativar Projeto';
        btnArchive.className = 'btn btn-sm btn-success';
      }
    } else {
      statusBadge.className = 'badge badge-warning';
      statusBadge.textContent = 'RASCUNHO (DRAFT)';
      if (descEl) descEl.textContent = `Esta versão está sob edição ou teste no simulador. Ela NÃO aparece para os entrevistadores no ODK Collect até que você clique em "Publicar Versão".`;
      if (fieldStatusEl) {
        fieldStatusEl.textContent = 'Em Construção (Oculto no Campo)';
        fieldStatusEl.style.color = '#f59e0b';
      }
      if (btnPublish) btnPublish.style.display = 'inline-flex';
      if (btnArchive) {
        btnArchive.innerHTML = '<i class="fa-solid fa-box-archive"></i> Arquivar Projeto';
        btnArchive.className = 'btn btn-sm btn-outline';
      }
    }
  }

  // Populate History Table
  const tbody = document.getElementById('project-versions-tbody');
  if (tbody) {
    try {
      const res = await fetch(`/api/forms/${formId}/version-history`);
      if (res.ok) {
        const histData = await res.json();
        const statsMap = {};
        (histData.versionStats || []).forEach(s => {
          statsMap[s.form_version] = s.interview_count;
        });

        let rowsHtml = '';
        for (let v = curVer; v >= 1; v--) {
          const isCurrent = v === curVer;
          const vCount = statsMap[v] || (isCurrent ? intsThisVer : 0);
          const statusPill = isCurrent
            ? (curStatus === 'published' ? '<span class="badge badge-success">Ativa em Campo</span>' : (curStatus === 'archived' ? '<span class="badge badge-secondary">Arquivada</span>' : '<span class="badge badge-warning">Rascunho Atual</span>'))
            : '<span class="badge" style="background:rgba(255,255,255,0.08); color:var(--text-muted);">Snapshot Congelado</span>';
          
          rowsHtml += `
            <tr>
              <td><span style="font-weight:700; color:#38bdf8;">Versão ${v} (V${v})</span> ${isCurrent ? '<span style="font-size:0.75rem; color:#10b981; margin-left:4px;">(Atual)</span>' : ''}</td>
              <td>${statusPill}</td>
              <td>${qCount} perguntas</td>
              <td><span style="font-weight:700; color:${vCount > 0 ? '#10b981' : 'var(--text-muted)'};">${vCount} entrevistas</span></td>
              <td>${form.updated_at ? new Date(form.updated_at).toLocaleString('pt-BR') : '-'}</td>
              <td>
                <div style="display:flex; gap:0.4rem;">
                  <button class="btn btn-xs btn-outline" onclick="sysEditForm()" title="Abrir no editor"><i class="fa-solid fa-pen"></i></button>
                  <button class="btn btn-xs btn-outline" onclick="exportXLSForm()" title="Exportar XLSForm desta versão"><i class="fa-solid fa-file-excel"></i></button>
                </div>
              </td>
            </tr>
          `;
        }
        tbody.innerHTML = rowsHtml;
      }
    } catch (e) {
      console.warn('Erro ao carregar histórico de versões:', e);
    }
  }
};

window.createProjectFromTemplate = function(templateKey) {
  const templates = {
    ibge_demografico: {
      title: 'Pesquisa Demográfica Padrão IBGE 2026',
      category: 'mercado',
      questions: [
        { id: 'q_genero', type: 'select_one', text: 'Qual é o sexo/gênero do entrevistado?', required: true, options: [{ name: 'masculino', label: 'Masculino' }, { name: 'feminino', label: 'Feminino' }, { name: 'outro', label: 'Outro / Não declarado' }] },
        { id: 'q_idade', type: 'select_one', text: 'Em qual faixa etária você se enquadra?', required: true, options: [{ name: '16_24', label: '16 a 24 anos' }, { name: '25_34', label: '25 a 34 anos' }, { name: '35_44', label: '35 a 44 anos' }, { name: '45_59', label: '45 a 59 anos' }, { name: '60_mais', label: '60 anos ou mais' }] },
        { id: 'q_escolaridade', type: 'select_one', text: 'Qual é o seu grau de instrução completo?', required: true, options: [{ name: 'analfabeto_primario', label: 'Analfabeto / Primário incompleto' }, { name: 'fundamental', label: 'Ensino Fundamental completo' }, { name: 'medio', label: 'Ensino Médio completo' }, { name: 'superior', label: 'Ensino Superior completo ou pós' }] },
        { id: 'q_renda', type: 'select_one', text: 'Qual é a renda familiar mensal total da sua casa?', required: true, options: [{ name: 'ate_2sm', label: 'Até 2 salários mínimos' }, { name: '2_a_5sm', label: 'De 2 a 5 salários mínimos' }, { name: '5_a_10sm', label: 'De 5 a 10 salários mínimos' }, { name: 'mais_10sm', label: 'Mais de 10 salários mínimos' }] },
        { id: 'q_raca', type: 'select_one', text: 'Como você se autodeclara segundo o IBGE?', required: true, options: [{ name: 'branca', label: 'Branca' }, { name: 'parda', label: 'Parda' }, { name: 'preta', label: 'Preta' }, { name: 'amarela', label: 'Amarela' }, { name: 'indigena', label: 'Indígena' }] }
      ]
    },
    eleitoral_tse: {
      title: 'Pesquisa de Intenção de Voto & Rejeição Eleitoral TSE',
      category: 'eleitoral',
      questions: [
        { id: 'q_espontanea', type: 'text', text: 'Se a eleição para Prefeitura/Governo fosse hoje, em quem você votaria? (Espontânea)', required: true },
        { id: 'q_estimulada', type: 'select_one', text: 'E se os candidatos fossem estes, em quem você votaria? (Estimulada)', required: true, options: [{ name: 'cand_a', label: 'Candidato Alfa' }, { name: 'cand_b', label: 'Candidato Bravo' }, { name: 'cand_c', label: 'Candidato Charlie' }, { name: 'branco_nulo', label: 'Em Branco / Anularia' }, { name: 'indeciso', label: 'Não sabe / Indeciso' }] },
        { id: 'q_rejeicao', type: 'select_multiple', text: 'E entre estes candidatos, em qual você NÃO VOTARIA DE JEITO NENHUM? (Rejeição)', required: true, options: [{ name: 'cand_a', label: 'Candidato Alfa' }, { name: 'cand_b', label: 'Candidato Bravo' }, { name: 'cand_c', label: 'Candidato Charlie' }, { name: 'rejeita_nenhum', label: 'Não rejeita nenhum' }, { name: 'rejeita_todos', label: 'Rejeita todos' }] },
        { id: 'q_certeza', type: 'select_one', text: 'A sua decisão de voto já é definitiva ou ainda pode mudar até o dia da eleição?', required: true, options: [{ name: 'definitivo', label: 'Já é definitivo' }, { name: 'pode_mudar', label: 'Ainda pode mudar' }, { name: 'nao_sabe', label: 'Não sabe responder' }] }
      ]
    },
    avaliacao_governo: {
      title: 'Avaliação de Desempenho e Serviços Governamentais',
      category: 'governo',
      questions: [
        { id: 'q_aprov_prefeito', type: 'select_one', text: 'Como você avalia a administração do Prefeito/Governador até o momento?', required: true, options: [{ name: 'otima', label: 'Ótima' }, { name: 'boa', label: 'Boa' }, { name: 'regular', label: 'Regular' }, { name: 'ruim', label: 'Ruim' }, { name: 'pessima', label: 'Péssima' }, { name: 'nao_opina', label: 'Não sabe / Não opina' }] },
        { id: 'q_saude', type: 'select_one', text: 'Como você classifica o atendimento nos postos de saúde e UPAs da sua região?', required: true, options: [{ name: 'bom', label: 'Bom / Excelente' }, { name: 'regular', label: 'Regular' }, { name: 'ruim', label: 'Ruim / Péssimo' }] },
        { id: 'q_seguranca', type: 'select_one', text: 'Qual a sua percepção quanto à segurança e policiamento no seu bairro?', required: true, options: [{ name: 'seguro', label: 'Sensação de Segurança' }, { name: 'inseguro', label: 'Sensação de Insegurança' }] },
        { id: 'q_prioridade', type: 'text', text: 'Qual o principal problema da sua cidade que deveria ser prioridade número um?', required: false }
      ]
    },
    nps_satisfacao: {
      title: 'Pesquisa de Satisfação de Clientes & NPS 0-10',
      category: 'satisfacao',
      questions: [
        { id: 'q_nps', type: 'integer', text: 'Em uma escala de 0 a 10, o quanto você recomendaria nossos serviços para um amigo ou colega?', required: true },
        { id: 'q_motivo_nps', type: 'text', text: 'Qual o motivo principal da sua nota?', required: true },
        { id: 'q_atendimento', type: 'select_one', text: 'Como você avalia a agilidade do nosso atendimento presencial ou telefônico?', required: true, options: [{ name: 'muito_satisfeito', label: 'Muito Satisfeito' }, { name: 'satisfeito', label: 'Satisfeito' }, { name: 'neutro', label: 'Neutro' }, { name: 'insatisfeito', label: 'Insatisfeito' }] },
        { id: 'q_melhoria', type: 'text', text: 'O que nós poderíamos fazer para tornar a sua experiência nota 10?', required: false }
      ]
    },
    termo_lgpd: {
      title: 'Bloco de Consentimento e Conformidade LGPD',
      category: 'geral',
      questions: [
        { id: 'q_lgpd_termo', type: 'select_one', text: 'Você aceita participar voluntariamente desta pesquisa de opinião pública, com seus dados anonimizados conforme a Lei 13.709/2018 (LGPD)?', required: true, options: [{ name: 'sim_aceito', label: 'Sim, concordo e autorizo' }, { name: 'nao_recuso', label: 'Não aceito participar' }] },
        { id: 'q_tel_contato', type: 'text', text: 'Telefone para controle de qualidade da checagem (opcional):', required: false, relevant: "${q_lgpd_termo} = 'sim_aceito'" }
      ]
    },
    auditoria_gps_audio: {
      title: 'Protocolo de Auditoria Antifraude (GPS, Áudio e Foto)',
      category: 'auditoria',
      questions: [
        { id: 'q_gps', type: 'geopoint', text: 'Coordenada Geográfica de Auditoria do Local da Entrevista', required: true },
        { id: 'q_audio_audit', type: 'audio', text: 'Gravação de Áudio Oculta para Validação Antifraude', required: true },
        { id: 'q_foto_fachada', type: 'image', text: 'Registro Fotográfico do Local da Coleta', required: false }
      ]
    }
  };

  const keyAliases = {
    demografico: 'ibge_demografico',
    eleitoral: 'eleitoral_tse',
    governamental: 'avaliacao_governo',
    nps: 'nps_satisfacao',
    auditoria_campo: 'auditoria_gps_audio',
    termo_lgpd: 'termo_lgpd'
  };
  const resolvedKey = keyAliases[templateKey] || templateKey;
  const tpl = templates[resolvedKey];
  if (!tpl) {
    showToast('error', 'Modelo não encontrado.');
    return;
  }

  showConfirm('Criar Projeto do Modelo', `Deseja criar um novo projeto completo a partir do modelo "${tpl.title}"?`, async () => {
    try {
      const newPrj = {
        title: tpl.title,
        category: tpl.category,
        year: new Date().getFullYear(),
        status: 'draft',
        version: 1,
        questions: tpl.questions,
        settings: {
          audit_location: true,
          audit_audio: templateKey === 'auditoria_gps_audio' || templateKey === 'eleitoral_tse'
        }
      };

      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPrj)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar projeto a partir do modelo.');

      showToast('success', `Projeto "${tpl.title}" criado com sucesso! Abrindo o questionário...`);
      await loadServerData();
      const formId = data.id || (data.form && data.form.id);
      const createdForm = (state.forms || []).find(f => f.id === formId) || data.form || { id: formId, ...newPrj };
      state.activeProjectFormId = formId;
      loadFormIntoBuilder(createdForm);
      renderFormBuilderList();
      switchTab('view-form-builder');
    } catch (err) {
      showToast('error', 'Erro ao instanciar modelo: ' + err.message);
    }
  });
};

window.showComingSoonToast = (feature) => {
  showToast('info', `A funcionalidade "${feature}" será liberada na próxima versão.`);
};

window.openFormSettings = () => {
  document.getElementById('form-settings-id').value = state.activeForm.id || 'Ainda não salvo (Rascunho)';
  
  const catEl = document.getElementById('form-settings-category');
  if (catEl) catEl.value = state.activeForm.category || (state.activeForm.settings && state.activeForm.settings.category) || 'geral';

  const yearEl = document.getElementById('form-settings-year');
  if (yearEl) yearEl.value = state.activeForm.year || (state.activeForm.settings && state.activeForm.settings.year) || new Date().getFullYear();

  if (state.activeForm.settings) {
    document.getElementById('form-settings-audit-audio').checked = !!state.activeForm.settings.audit_audio;
    document.getElementById('form-settings-audit-location').checked = !!state.activeForm.settings.audit_location;
    document.getElementById('form-settings-quotas').value = state.activeForm.settings.quotas ? JSON.stringify(state.activeForm.settings.quotas, null, 2) : '';
  } else {
    document.getElementById('form-settings-audit-audio').checked = false;
    document.getElementById('form-settings-audit-location').checked = false;
    document.getElementById('form-settings-quotas').value = '';
  }
  
  document.getElementById('form-settings-modal').classList.add('active');
};

window.saveFormSettings = () => {
  if (!state.activeForm.settings) state.activeForm.settings = {};
  state.activeForm.settings.audit_audio = document.getElementById('form-settings-audit-audio').checked;
  state.activeForm.settings.audit_location = document.getElementById('form-settings-audit-location').checked;
  
  const catEl = document.getElementById('form-settings-category');
  if (catEl) {
    state.activeForm.category = catEl.value;
    state.activeForm.settings.category = catEl.value;
  }
  const yearEl = document.getElementById('form-settings-year');
  if (yearEl) {
    const yVal = parseInt(yearEl.value, 10) || new Date().getFullYear();
    state.activeForm.year = yVal;
    state.activeForm.settings.year = yVal;
  }

  try {
    const qVal = document.getElementById('form-settings-quotas').value.trim();
    if (qVal) {
      state.activeForm.settings.quotas = JSON.parse(qVal);
    } else {
      delete state.activeForm.settings.quotas;
    }
  } catch(e) {
    showToast('error', 'Formato JSON inválido para Cotas. Verifique a sintaxe.');
    return;
  }
  
  document.getElementById('form-settings-modal').classList.remove('active');
  showToast('success', 'Configurações globais salvas com sucesso!');
};

// ===================== MOBILE SIMULATOR =====================
function initMobileSimulator() {
  const toggleNet = document.getElementById('sim-toggle-network');
  if (toggleNet) {
    toggleNet.addEventListener('change', (e) => {
      state.simIsOnline = e.target.checked;
      const badge = document.getElementById('net-status-text');
      if (badge) badge.textContent = state.simIsOnline ? 'Conectado (Online)' : 'Desconectado (Offline)';
      if (state.simIsOnline) syncOfflineQueue();
      renderMobileScreen();
    });
  }

  const btnDown = document.getElementById('sim-btn-download-templates');
  if (btnDown) btnDown.addEventListener('click', downloadTemplates);

  const btnSync = document.getElementById('sim-btn-sync-queue');
  if (btnSync) btnSync.addEventListener('click', syncOfflineQueue);

  const cachedQueue = localStorage.getItem('guiadata_offline_queue');
  if (cachedQueue) {
    try {
      state.simOfflineQueue = JSON.parse(cachedQueue);
      const countEl = document.getElementById('sim-offline-queue-count');
      if (countEl) countEl.textContent = state.simOfflineQueue.length;
    } catch(e) {}
  }
  renderMobileScreen();
}

function downloadTemplates() {
  if (!state.simIsOnline) { showToast('error', 'Conecte à internet para baixar os formulários.'); return; }
  const published = state.forms.filter(f => f.status === 'published');
  localStorage.setItem('guiadata_sim_templates', JSON.stringify(published));
  showToast('success', `${published.length} formulário(s) baixado(s) para o celular.`);
  renderMobileScreen();
}

function syncOfflineQueue() {
  if (state.simOfflineQueue.length === 0) { showToast('info', 'Nenhuma pesquisa pendente.'); return; }
  if (!state.simIsOnline) { showToast('warning', 'Conecte à internet para enviar.'); return; }
  const total = state.simOfflineQueue.length;
  showToast('info', `Enviando ${total} pesquisa(s)...`);
  Promise.all(state.simOfflineQueue.map(p => apiFetch('/api/interviews', { method:'POST', body:JSON.stringify(p) }).catch(() => null)))
    .then(async (results) => {
      const ok = results.filter(r => r && r.success).length;
      showToast('success', `${ok} de ${total} pesquisa(s) enviada(s)!`);
      state.simOfflineQueue = state.simOfflineQueue.slice(ok);
      localStorage.setItem('guiadata_offline_queue', JSON.stringify(state.simOfflineQueue));
      document.getElementById('sim-offline-queue-count').textContent = state.simOfflineQueue.length;
      await loadServerData(); renderDashboard(); renderMobileScreen();
    });
}

function renderMobileScreen() {
  const screen = document.getElementById('phone-screen-body');
  const header = document.getElementById('phone-header-bar');
  if (!screen || !header) return;

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  header.innerHTML = `
    <div style="font-weight: 700; font-size: 0.8rem; color: #fff; letter-spacing: -0.2px;">${timeStr}</div>
    <div style="display: flex; align-items: center; gap: 7px; font-size: 0.72rem; color: #fff;">
      <i class="fa-solid fa-signal" style="font-size: 0.65rem;"></i>
      <i class="fa-solid fa-wifi" style="font-size: 0.65rem;"></i>
      <div style="display: flex; align-items: center; gap: 3px;">
        <span style="font-size: 0.65rem; font-weight: 700;">98%</span>
        <i class="fa-solid fa-battery-full" style="color: #10b981; font-size: 0.85rem;"></i>
      </div>
    </div>
  `;
  screen.innerHTML = '';

  if (!state.simActiveForm) {
    // Form selection view
    let opts = '<option value="">-- Selecione o questionário --</option>';
    state.forms.forEach(t => { opts += `<option value="${t.id}">${t.title} (V${t.version})</option>`; });
    const warn = state.forms.length === 0 ? '<div style="margin-top:1rem;padding:0.75rem;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);border-radius:8px;font-size:0.75rem;color:#fbbf24;text-align:center;"><i class="fa-solid fa-circle-exclamation"></i> Nenhum formulário disponível.</div>' : '';
    screen.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:1rem;">
        <div style="text-align:center;margin-bottom:1.5rem;">
          <div style="width:60px;height:60px;background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.3);border-radius:18px;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem auto;font-size:1.8rem;color:var(--primary);box-shadow:0 0 20px rgba(56,189,248,0.2);">
            <i class="fa-solid fa-mobile-screen"></i>
          </div>
          <h4 style="font-size:1.15rem;font-weight:700;color:#fff;margin-bottom:0.3rem;">ODK Collect Preview</h4>
          <p style="font-size:0.78rem;color:var(--text-secondary);margin:0;">Simule a experiência do pesquisador em campo no Android.</p>
        </div>
        <select class="form-select" id="sim-select-form" style="margin-bottom:1rem;background:#090e1a;color:#fff;">${opts}</select>
        <button class="btn btn-primary" style="width:100%;padding:0.75rem;font-weight:700;justify-content:center;gap:0.5rem;" onclick="simStartInterview()"><i class="fa-solid fa-play"></i> Iniciar Coleta Simulada</button>
        ${warn}
      </div>`;
    setTimeout(() => { const s = document.getElementById('sim-select-form'); if (s) { s.value = state.simSelectedFormId; s.addEventListener('change', e => state.simSelectedFormId = e.target.value); } }, 10);
  } else {
    const qList = state.simActiveForm.questions;
    const ci = state.simCurrentQuestionIdx;
    if (ci < qList.length) {
      // Question view
      const q = qList[ci];
      const isLast = ci === qList.length - 1;
      let inputHtml = '';
      if (q.type === 'text') inputHtml = `<input type="text" id="sim-ans-${q.id}" class="form-input" style="margin-top:0.75rem; background:#070b14; color:#fff;" value="${state.simAnswers[q.id]||''}" placeholder="Digite a resposta..." />`;
      else if (q.type === 'number' || q.type === 'integer' || q.type === 'decimal') inputHtml = `<input type="number" id="sim-ans-${q.id}" class="form-input" style="margin-top:0.75rem; background:#070b14; color:#fff;" value="${state.simAnswers[q.id]||''}" ${q.type==='integer'?'step="1"':''} placeholder="Digite um valor numérico..." />`;
      else if (q.type === 'single_choice' || q.type === 'select_one') {
        inputHtml = '<div style="margin-top:0.75rem; display:flex; flex-direction:column; gap:0.5rem;">';
        if(q.options) q.options.forEach(opt => { 
          const val = typeof opt==='object'?opt.label:opt; 
          const chk = state.simAnswers[q.id]===val?'checked':''; 
          inputHtml += `<label style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;background:rgba(255,255,255,0.04);border:1px solid var(--glass-border);border-radius:10px;font-size:0.88rem;color:#f8fafc;cursor:pointer;transition:all 0.2s;"><input type="radio" name="sim-rad-${q.id}" value="${val}" ${chk} style="accent-color:var(--primary);transform:scale(1.2);" /> ${val}</label>`; 
        });
        inputHtml += '</div>';
      } else if (q.type === 'multiple_choice' || q.type === 'select_multiple') {
        const arr = state.simAnswers[q.id] || [];
        inputHtml = '<div style="margin-top:0.75rem; display:flex; flex-direction:column; gap:0.5rem;">';
        if(q.options) q.options.forEach(opt => { 
          const val = typeof opt==='object'?opt.label:opt; 
          const chk = arr.includes(val)?'checked':''; 
          inputHtml += `<label style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;background:rgba(255,255,255,0.04);border:1px solid var(--glass-border);border-radius:10px;font-size:0.88rem;color:#f8fafc;cursor:pointer;transition:all 0.2s;"><input type="checkbox" name="sim-chk-${q.id}" value="${val}" ${chk} style="accent-color:var(--primary);transform:scale(1.2);" /> ${val}</label>`; 
        });
        inputHtml += '</div>';
      } else if (q.type === 'geopoint') {
        const val = state.simAnswers[q.id] || '';
        inputHtml = `
          <div style="margin-top:0.75rem;padding:1.25rem;background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);border-radius:12px;text-align:center;">
            <i class="fa-solid fa-location-dot" style="font-size:2rem;color:var(--primary);margin-bottom:0.6rem;display:block;"></i>
            <div style="display:flex; flex-direction:column; gap:0.5rem;">
              <button type="button" class="btn btn-sm btn-primary" onclick="simCaptureRealGps('${q.id}')" style="justify-content:center; gap:0.4rem;">
                <i class="fa-solid fa-satellite-dish"></i> Capturar GPS Real do Celular
              </button>
              <div style="display:flex; gap:0.4rem; justify-content:center;">
                <button type="button" class="btn btn-sm btn-outline" onclick="simSetPresetGps('${q.id}', '-3.1190, -60.0217', 'Manaus (Centro)')" style="font-size:0.72rem; padding:0.25rem 0.5rem;">Manaus</button>
                <button type="button" class="btn btn-sm btn-outline" onclick="simSetPresetGps('${q.id}', '-23.5505, -46.6333', 'São Paulo (SP)')" style="font-size:0.72rem; padding:0.25rem 0.5rem;">São Paulo</button>
                <button type="button" class="btn btn-sm btn-outline" onclick="simSetPresetGps('${q.id}', '-15.7975, -47.8919', 'Brasília (DF)')" style="font-size:0.72rem; padding:0.25rem 0.5rem;">Brasília</button>
              </div>
            </div>
            <input type="hidden" id="sim-ans-${q.id}" value="${val}">
            <div id="sim-gps-display-${q.id}" style="font-size:0.75rem;margin-top:0.6rem;color:${val?'var(--success)':'var(--text-muted)'};font-weight:600;">
              ${val ? `<i class="fa-solid fa-check"></i> Coordenadas: ${val}` : '<i class="fa-solid fa-location-crosshairs"></i> Nenhuma coordenada capturada'}
            </div>
          </div>`;
      } else if (q.type === 'image' || q.type === 'video') {
        const val = state.simAnswers[q.id] || '';
        const icon = q.type === 'image' ? 'fa-camera' : 'fa-video';
        inputHtml = `<div style="margin-top:0.75rem;padding:1.25rem;background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);border-radius:12px;text-align:center;"><i class="fa-solid ${icon}" style="font-size:2rem;color:var(--primary);margin-bottom:0.6rem;display:block;"></i><input type="hidden" id="sim-ans-${q.id}" value="${val?val:'midia_capturada.jpg'}"><button class="btn btn-sm btn-outline" onclick="document.getElementById('sim-ans-${q.id}').value='arquivo_simulado.${q.type==='video'?'mp4':'jpg'}';this.innerHTML='<i class=\\'fa-solid fa-check\\'></i> Anexo Confirmado';this.classList.add('btn-success');"><i class="fa-solid fa-paperclip"></i> Capturar ou Anexar Mídia</button>${val?'<div style="font-size:0.75rem;margin-top:0.5rem;color:var(--success);font-weight:600;"><i class="fa-solid fa-check"></i> Arquivo anexado</div>':''}</div>`;
      } else if (q.type === 'audio_record' || q.type === 'audio') {
        const isRec = state.simIsRecording;
        inputHtml = `
          <div class="sim-audio-widget" style="background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);border-radius:12px;padding:1rem; text-align:center;">
            <p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.5rem;">
              ${isRec ? '<span style="color:var(--red); font-weight:700;"><i class="fa-solid fa-circle fa-beat"></i> Gravando microfone em tempo real...</span>' : 'Pressione para testar a gravação de áudio:'}
            </p>
            <div class="wave-container ${isRec ? 'recording' : ''}" style="margin: 0.5rem auto 1rem auto;">
              <span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span>
            </div>
            <button type="button" class="btn ${isRec ? 'btn-danger' : 'btn-primary'}" onclick="simToggleRealRecord()" style="margin: 0 auto; justify-content:center; gap:0.5rem; font-size:0.8rem; padding:0.4rem 1rem;">
              <i class="fa-solid ${isRec ? 'fa-stop' : 'fa-microphone'}"></i> ${isRec ? 'Parar Gravação' : 'Gravar Áudio'}
            </button>
            <div id="sim-audio-player-container" style="margin-top:0.75rem;">
              ${state.simAudioFile ? `
                <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:8px; padding:0.5rem; font-size:0.75rem; color:#34d399;">
                  <i class="fa-solid fa-circle-check"></i> Áudio Gravado com Sucesso!
                  <audio controls src="${state.simAudioFile}" style="width:100%; height:32px; margin-top:0.4rem; outline:none;"></audio>
                </div>
              ` : '<span style="color:var(--text-muted); font-size:0.75rem;">Nenhum áudio gravado ainda.</span>'}
            </div>
            <input type="hidden" id="sim-ans-${q.id}" value="${state.simAudioFile||''}">
          </div>`;
      }

      // Validation error banner if any
      const errorBanner = state.simValidationError ? `
        <div style="background:rgba(239,68,68,0.15); border:1px solid var(--red); border-radius:8px; padding:0.6rem 0.8rem; margin-top:0.75rem; font-size:0.78rem; color:#fca5a5; display:flex; align-items:center; gap:0.5rem;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:1rem; flex-shrink:0;"></i>
          <span>${state.simValidationError}</span>
        </div>
      ` : '';

      screen.innerHTML = `
        <div style="flex:1;display:flex;flex-direction:column;padding:0.5rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">
            <span style="font-size:0.72rem;color:var(--primary);font-weight:700;text-transform:uppercase;">Questão ${ci+1} de ${qList.length}</span>
            <span style="font-size:0.72rem;color:var(--text-muted);">${((ci+1)/qList.length*100).toFixed(0)}%</span>
          </div>
          <div class="progress-bar" style="height:5px;background:rgba(255,255,255,0.08);margin-bottom:1rem;">
            <div class="progress-fill blue" style="width:${((ci+1)/qList.length*100).toFixed(0)}%;background:linear-gradient(90deg,var(--primary),#10b981);"></div>
          </div>
          <div style="background:rgba(15,23,42,0.6);border:1px solid var(--glass-border);border-radius:14px;padding:1.25rem;margin-bottom:1rem;">
            <h4 style="font-size:1.05rem;line-height:1.4;color:#fff;margin-bottom:0.25rem;font-weight:600;">${q.text}</h4>
            ${q.hint ? `<p style="font-size:0.75rem; color:var(--text-muted); margin:0 0 0.5rem 0;">${q.hint}</p>` : ''}
            ${inputHtml}
            ${errorBanner}
          </div>
          <div style="display:flex;gap:0.6rem;margin-top:auto;padding-top:1rem;">
            <button class="btn btn-outline" style="flex:1;justify-content:center;" onclick="simPrev()"><i class="fa-solid fa-arrow-left"></i> Voltar</button>
            <button class="btn btn-primary" style="flex:2;justify-content:center;font-weight:700;" onclick="simNext()">${isLast?'<i class="fa-solid fa-circle-check"></i> Concluir':'Avançar <i class="fa-solid fa-arrow-right"></i>'}</button>
          </div>
          <button class="btn btn-sm" style="margin-top:0.75rem;width:100%;border:none;background:transparent;color:var(--danger);font-size:0.75rem;justify-content:center;" onclick="simAbort()"><i class="fa-solid fa-xmark"></i> Cancelar Preview</button>
        </div>`;
    } else {
      // Confirmation view with option to save into database
      screen.innerHTML = `
        <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:0.75rem;text-align:center;">
          <i class="fa-solid fa-circle-check" style="font-size:3rem;color:var(--success);margin-bottom:0.75rem;"></i>
          <h3 style="margin-bottom:0.3rem; color:#fff;">Entrevista Concluída!</h3>
          <p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:1rem;">Todas as validações e lógicas de pulo foram aprovadas.</p>
          <div style="background:var(--bg-page);padding:0.75rem;border-radius:8px;margin-bottom:1rem;font-size:0.75rem;text-align:left;max-height:140px;overflow-y:auto; border:1px solid var(--border);">
            ${Object.entries(state.simAnswers).map(([k,v])=>`<div><strong style="color:var(--cyan);">${k}:</strong> ${Array.isArray(v)?v.join(', '):v}</div>`).join('')}
            ${state.simAudioFile?`<div style="color:#34d399;"><i class="fa-solid fa-microphone"></i> <strong>Áudio anexado</strong></div>`:''}
          </div>
          <div style="display:flex; flex-direction:column; gap:0.5rem;">
            <button class="btn btn-success" style="width:100%; justify-content:center; font-weight:700;" onclick="simSaveRealSubmission()">
              <i class="fa-solid fa-cloud-arrow-up"></i> Gravar no Banco de Dados (Gerar Dado Real)
            </button>
            <button class="btn btn-outline" style="width:100%; justify-content:center;" onclick="simReset()">
              <i class="fa-solid fa-rotate-left"></i> Apenas Fechar Simulador
            </button>
          </div>
        </div>`;
    }
  }
}

// Geolocation Helpers for Simulator
window.simCaptureRealGps = function(qId) {
  const display = document.getElementById(`sim-gps-display-${qId}`);
  const input = document.getElementById(`sim-ans-${qId}`);
  if (display) display.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Acessando satélites GPS...';

  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const acc = pos.coords.accuracy ? pos.coords.accuracy.toFixed(1) : '5.0';
        const str = `${lat}, ${lng}`;
        if (input) input.value = str;
        state.simAnswers[qId] = str;
        if (display) {
          display.style.color = 'var(--success)';
          display.innerHTML = `<i class="fa-solid fa-check"></i> GPS Fixado: ${str} (Precisão: ${acc}m)`;
        }
        showToast('success', `GPS capturado com precisão de ${acc}m!`);
      },
      (err) => {
        window.simSetPresetGps(qId, '-3.1190, -60.0217', 'Manaus (Centro)');
        showToast('info', 'Permissão GPS não concedida. Ponto padrão (Manaus) utilizado.');
      },
      { timeout: 7000, enableHighAccuracy: true }
    );
  } else {
    window.simSetPresetGps(qId, '-3.1190, -60.0217', 'Manaus (Centro)');
  }
};

window.simSetPresetGps = function(qId, coords, name) {
  const input = document.getElementById(`sim-ans-${qId}`);
  const display = document.getElementById(`sim-gps-display-${qId}`);
  if (input) input.value = coords;
  state.simAnswers[qId] = coords;
  if (display) {
    display.style.color = 'var(--success)';
    display.innerHTML = `<i class="fa-solid fa-check"></i> ${name}: ${coords}`;
  }
  showToast('info', `Ponto GPS fixado: ${name}`);
};

// Real Audio Recording in Simulator
let simMediaRecorder = null;
let simAudioChunks = [];

window.simToggleRealRecord = async function() {
  if (state.simIsRecording) {
    // Stop recording
    if (simMediaRecorder && simMediaRecorder.state !== 'inactive') {
      simMediaRecorder.stop();
    }
    state.simIsRecording = false;
  } else {
    // Start recording
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        simAudioChunks = [];
        simMediaRecorder = new MediaRecorder(stream);
        
        simMediaRecorder.ondataavailable = e => {
          if (e.data.size > 0) simAudioChunks.push(e.data);
        };

        simMediaRecorder.onstop = () => {
          const blob = new Blob(simAudioChunks, { type: 'audio/webm' });
          state.simAudioFile = URL.createObjectURL(blob);
          stream.getTracks().forEach(t => t.stop());
          renderMobileScreen();
          showToast('success', 'Gravação concluída com sucesso!');
        };

        simMediaRecorder.start();
        state.simIsRecording = true;
        renderMobileScreen();
      } else {
        throw new Error('Microfone não suportado no navegador');
      }
    } catch (err) {
      // Fallback to simulated audio
      state.simIsRecording = true;
      renderMobileScreen();
      setTimeout(() => {
        state.simIsRecording = false;
        state.simAudioFile = '/audio-vault/mock_sample.webm';
        renderMobileScreen();
        showToast('info', 'Áudio de auditoria gerado (Modo Simulado).');
      }, 2500);
    }
  }
};

window.simStartInterview = function() {
  const select = document.getElementById('sim-select-form');
  if (!select || !select.value) { showToast('warning', 'Selecione um formulário para testar.'); return; }
  const form = state.forms.find(f => f.id === select.value);
  if (form) { 
    state.simActiveForm = form; 
    state.simAnswers = {}; 
    state.simCurrentQuestionIdx = 0; 
    state.simAudioFile = null; 
    state.simIsRecording = false; 
    state.simValidationError = null;
    renderMobileScreen(); 
  }
};

window.simAbort = function() { showConfirm('Cancelar Preview', 'Tem certeza que deseja sair do simulador?', () => simReset(), { type:'danger', confirmText:'Sim, sair' }); };

function simReset() { 
  state.simActiveForm = null; 
  state.simAnswers = {}; 
  state.simCurrentQuestionIdx = 0; 
  state.simAudioFile = null; 
  state.simIsRecording = false; 
  state.simValidationError = null;
  renderMobileScreen(); 
}

function evaluateSimLogic(logicArray) {
  if (!logicArray || logicArray.length === 0) return true;
  for (let l of logicArray) {
    if (!l.targetId) continue;
    const ans = state.simAnswers[l.targetId];
    if (ans === undefined) return false;
    let numAns = parseFloat(ans);
    let numVal = parseFloat(l.val);
    let isNum = !isNaN(numAns) && !isNaN(numVal);
    
    if (l.op === '=') { if (ans != l.val) return false; }
    else if (l.op === '!=') { if (ans == l.val) return false; }
    else if (l.op === '>') { if (!isNum || numAns <= numVal) return false; }
    else if (l.op === '<') { if (!isNum || numAns >= numVal) return false; }
    else if (l.op === '>=') { if (!isNum || numAns < numVal) return false; }
    else if (l.op === '<=') { if (!isNum || numAns > numVal) return false; }
  }
  return true;
}

function validateSimConstraint(q, val) {
  if (!q.constraint) return null;
  const c = q.constraint;

  // CPF regex
  if (c.includes('^[0-9]{11}$')) {
    if (!/^[0-9]{11}$/.test(val)) {
      return q.constraint_message || 'CPF inválido. Digite exatamente 11 dígitos numéricos.';
    }
  }

  // Phone regex
  if (c.includes('^[0-9]{10,11}$')) {
    if (!/^[0-9]{10,11}$/.test(val)) {
      return q.constraint_message || 'Telefone inválido. Digite DDD + número (10 ou 11 dígitos).';
    }
  }

  // Email regex
  if (c.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      return q.constraint_message || 'Por favor, informe um endereço de e-mail válido.';
    }
  }

  // Min characters
  const minMatch = c.match(/string-length\(\.\)\s*>=\s*(\d+)/);
  if (minMatch) {
    const minLen = parseInt(minMatch[1], 10);
    if (String(val).length < minLen) {
      return q.constraint_message || `O texto deve ter no mínimo ${minLen} caracteres.`;
    }
  }

  // Number range
  const rangeMatch = c.match(/\.\s*>=\s*(-?\d+(?:\.\d+)?)\s+and\s+\.\s*<=\s*(-?\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    const num = parseFloat(val);
    const minN = parseFloat(rangeMatch[1]);
    const maxN = parseFloat(rangeMatch[2]);
    if (isNaN(num) || num < minN || num > maxN) {
      return q.constraint_message || `O valor deve estar entre ${minN} e ${maxN}.`;
    }
  }

  // Positive
  if (c === '. > 0') {
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) {
      return q.constraint_message || 'O valor deve ser obrigatoriamente maior que zero.';
    }
  }

  // Multiple selection limits
  if (Array.isArray(val)) {
    const exactMatch = c.match(/count-selected\(\.\)\s*=\s*(\d+)/);
    if (exactMatch) {
      const count = parseInt(exactMatch[1], 10);
      if (val.length !== count) return q.constraint_message || `Selecione exatamente ${count} opção(ões).`;
    }
    const maxMatch = c.match(/count-selected\(\.\)\s*<=\s*(\d+)/);
    if (maxMatch) {
      const maxC = parseInt(maxMatch[1], 10);
      if (val.length > maxC) return q.constraint_message || `Você pode escolher no máximo ${maxC} opções.`;
    }
  }

  return null;
}

window.simPrev = function() {
  state.simValidationError = null;
  let prevIdx = state.simCurrentQuestionIdx - 1;
  while (prevIdx >= 0) {
    const q = state.simActiveForm.questions[prevIdx];
    if (evaluateSimLogic(q._logic)) {
      state.simCurrentQuestionIdx = prevIdx;
      renderMobileScreen();
      return;
    }
    prevIdx--;
  }
  state.simActiveForm = null; 
  renderMobileScreen();
};

window.simNext = function() {
  const q = state.simActiveForm.questions[state.simCurrentQuestionIdx];
  let val = '';
  if (q.type === 'text' || q.type === 'number' || q.type === 'integer' || q.type === 'decimal' || q.type === 'geopoint' || q.type === 'image' || q.type === 'video') { 
    const el = document.getElementById(`sim-ans-${q.id}`); 
    val = el ? el.value.trim() : ''; 
  } else if (q.type === 'single_choice' || q.type === 'select_one') { 
    const r = document.querySelector(`input[name="sim-rad-${q.id}"]:checked`); 
    val = r ? r.value : ''; 
  } else if (q.type === 'multiple_choice' || q.type === 'select_multiple') { 
    val = Array.from(document.querySelectorAll(`input[name="sim-chk-${q.id}"]:checked`)).map(c => c.value); 
  } else if (q.type === 'audio_record' || q.type === 'audio') { 
    val = state.simAudioFile || document.getElementById(`sim-ans-${q.id}`)?.value || ''; 
  }
  
  if (q.required && (!val || (Array.isArray(val) && val.length === 0))) { 
    state.simValidationError = 'Esta questão é obrigatória para prosseguir.';
    renderMobileScreen();
    return; 
  }

  // Validate constraint
  const constraintErr = validateSimConstraint(q, val);
  if (constraintErr) {
    state.simValidationError = constraintErr;
    renderMobileScreen();
    return;
  }

  state.simValidationError = null;
  state.simAnswers[q.id] = val;
  
  // Find next visible question
  let nextIdx = state.simCurrentQuestionIdx + 1;
  while (nextIdx < state.simActiveForm.questions.length) {
    const nextQ = state.simActiveForm.questions[nextIdx];
    if (evaluateSimLogic(nextQ._logic)) {
      break;
    }
    nextIdx++;
  }
  
  state.simCurrentQuestionIdx = nextIdx;
  renderMobileScreen();
};

window.simSaveRealSubmission = async function() {
  if (!state.simActiveForm) return;
  
  let lat = -3.1190;
  let lng = -60.0217;
  
  // Find if GPS was recorded
  for (const [k, v] of Object.entries(state.simAnswers)) {
    if (typeof v === 'string' && v.includes(',')) {
      const parts = v.split(',');
      const pLat = parseFloat(parts[0]);
      const pLng = parseFloat(parts[1]);
      if (!isNaN(pLat) && !isNaN(pLng)) {
        lat = pLat;
        lng = pLng;
        break;
      }
    }
  }

  const payload = {
    form_id: state.simActiveForm.id,
    researcher_id: state.activeUserId || 'sim_usr',
    device_id: 'Simulador Mobile',
    latitude: lat,
    longitude: lng,
    audio_url: state.simAudioFile || null,
    data: state.simAnswers
  };

  try {
    showToast('info', 'Registrando entrevista no banco de dados...');
    const res = await apiFetch('/api/interviews', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    if (res && res.success) {
      showToast('success', 'Entrevista de teste gravada com sucesso! Atualizando relatórios...');
      await loadServerData();
      renderDashboard();
      if (typeof renderMapMarkers === 'function') renderMapMarkers();
      if (typeof renderReportsTable === 'function') renderReportsTable();
      if (typeof renderCharts === 'function') renderCharts();
      simReset();
    } else {
      showToast('error', 'Falha ao registrar: ' + (res?.message || 'Erro desconhecido'));
    }
  } catch (err) {
    showToast('error', 'Erro ao salvar no banco: ' + err.message);
  }
};


// ===================== AI ANALYSIS =====================
window.runAiAnalysis = async function() {
  const formId = state.activeProjectFormId;
  if (!formId) {
    showToast('warning', 'Selecione um projeto na aba Projetos primeiro.');
    return;
  }

  const status = document.getElementById('ai-status');
  const container = document.getElementById('ai-results-container');
  status.innerHTML = '<span style="color:var(--primary);"><i class="fa-solid fa-spinner fa-spin"></i> Analisando dados...</span>';
  container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin" style="opacity:1;"></i><h4>Processando verificação...</h4><p>Analisando metadados, consistência de GPS e velocidade de coleta.</p></div>';
  
  try {
    const res = await apiFetch(`/api/analytics/quality/${formId}`);
    status.innerHTML = '<span style="color:var(--success);"><i class="fa-solid fa-check"></i> Verificação concluída.</span>';
    
    container.innerHTML = '';
    if (!res.results || res.results.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Nenhuma coleta encontrada para análise.</p></div>';
      return;
    }
    
    res.results.forEach(r => {
      let cssClass = r.type === 'danger' ? 'anomaly' : (r.type === 'warning' ? 'warning' : 'ok');
      let color = `var(--${r.type === 'ok' ? 'success' : r.type})`;
      container.innerHTML += `
        <div class="ai-result-card ${cssClass}">
          <h4 style="color:${color};"><i class="${r.icon}"></i> ${r.title}</h4>
          <p>${r.message}</p>
        </div>
      `;
    });
    
    showToast('success', 'Verificação de qualidade finalizada.');
  } catch (err) {
    status.innerHTML = '<span style="color:var(--danger);"><i class="fa-solid fa-xmark"></i> Falha na análise.</span>';
    container.innerHTML = `<div class="empty-state" style="color:var(--danger);"><p>Erro: ${err.message}</p></div>`;
  }
};

// ===================== LOGS =====================
async function fetchLogs() {
  const container = document.getElementById('log-console-container');
  if (state.activeRole !== 'DEV' && state.activeRole !== 'Admin') { container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-lock"></i><h4>Acesso restrito</h4><p>Apenas perfis de Administrador ou Suporte Técnico (DEV) podem visualizar os registros.</p></div>'; return; }
  try {
    const logs = await apiFetch('/api/logs');
    state.logs = logs;
    if (!logs || logs.length === 0) { container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-shield-halved"></i><h4>Nenhum registro</h4><p>Os eventos de segurança aparecerão aqui.</p></div>'; return; }
    let html = '<table class="data-table"><thead><tr><th>Data/Hora</th><th>Severidade</th><th>Tipo</th><th>Comando</th><th>Perfil</th></tr></thead><tbody>';
    logs.forEach(l => {
      html += `<tr><td style="font-size:0.78rem;">${new Date(l.timestamp).toLocaleString('pt-BR')}</td><td><span class="severity-badge sev-${l.severity}">${l.severity}</span></td><td style="font-size:0.82rem;">${l.type}</td><td style="font-family:var(--font-mono);font-size:0.78rem;">${l.command_requested||'-'}</td><td>${l.user_role||'-'}</td></tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) { container.innerHTML = `<div style="color:var(--danger);">Erro ao carregar registros: ${err.message}</div>`; }
}

// ===================== DATA EXPORTER =====================
function initDataExporter() {
  const btn = document.getElementById('btn-export-data');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const formId = state.activeProjectFormId || 'todos';
    showToast('info', 'Gerando planilha Excel (.xlsx) com abas limpas e repeats...');
    window.location.href = `/api/export/xlsx/${formId}`;
  });
}

// ===================== TEAM =====================
async function loadTeam() {
  const usersTable = document.getElementById('users-tbody');
  try {
    const users = await apiFetch('/api/users');
    const routes = await apiFetch('/api/routes');
    const forms = await apiFetch('/api/forms');
    
    if(usersTable) {
      usersTable.innerHTML = '';
      users.filter(u => u.status !== 'deleted').forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${u.name}</strong><br><span style="font-size:0.75rem;color:var(--text-muted);">${u.email}</span></td>
          <td><span class="badge badge-info">${ROLE_LABELS[u.role]||u.role}</span></td>
          <td>
            <button class="btn-icon" style="color:var(--primary)" onclick="editUser('${u.id}')" title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
            <button class="btn-icon" style="color:var(--danger)" onclick="deleteUser('${u.id}')" title="Remover"><i class="fa-solid fa-trash"></i></button>
          </td>
        `;
        usersTable.appendChild(tr);
      });
    }

    
    const resSelect = document.getElementById('route-form-researcher');
    if(resSelect) {
      resSelect.innerHTML = users.filter(u => u.status !== 'deleted' && u.role === 'Researcher').map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    }
  } catch(err) {
    showToast('error', 'Erro ao carregar equipe.');
  }
}

async function loadProjectAccess() {
  if (!state.activeProjectFormId) return;
  const routesTable = document.getElementById('routes-tbody');
  if (!routesTable) return;
  try {
    const routes = await apiFetch('/api/routes');
    const projectRoutes = routes.filter(r => r.form_id === state.activeProjectFormId);
    
    routesTable.innerHTML = '';
    if (projectRoutes.length === 0) {
      routesTable.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum pesquisador atribuído a este projeto.</td></tr>';
      return;
    }
    
    projectRoutes.forEach(r => {
      const date = new Date(r.created_at).toLocaleDateString('pt-BR');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${r.researcher_name}</strong></td>
        <td>${date}</td>
        <td>
          <button class="btn-icon" style="color:var(--danger)" onclick="deleteRoute('${r.id}')" title="Remover Acesso"><i class="fa-solid fa-trash"></i></button>
        </td>
      `;
      routesTable.appendChild(tr);
    });
    
    // Certifique-se de popular o select de pesquisadores se ainda não estiver
    const users = await apiFetch('/api/users');
    const resSelect = document.getElementById('route-form-researcher');
    if (resSelect && resSelect.options.length === 0) {
      resSelect.innerHTML = users.filter(u => u.status !== 'deleted' && u.role === 'Researcher').map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    }
  } catch(err) {
    showToast('error', 'Erro ao carregar acessos do projeto.');
  }
}

window.openUserModal = function() {
  document.getElementById('user-form-id').value = '';
  document.getElementById('user-form-name').value = '';
  document.getElementById('user-form-email').value = '';
  document.getElementById('user-form-role').value = 'Researcher';
  document.getElementById('user-form-password').value = '';
  document.getElementById('user-modal-title').textContent = 'Novo Usuário';
  document.getElementById('user-modal').classList.add('active');
};
window.closeUserModal = function() { document.getElementById('user-modal').classList.remove('active'); };
window.saveUser = async function() {
  const id = document.getElementById('user-form-id').value;
  const name = document.getElementById('user-form-name').value;
  const email = document.getElementById('user-form-email').value;
  const role = document.getElementById('user-form-role').value;
  const password = document.getElementById('user-form-password').value;
  
  if(!name || !email) { showToast('warning', 'Preencha nome e e-mail.'); return; }
  
  try {
    if(id) {
      await apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify({ name, email, role, password }) });
      showToast('success', 'Usuário atualizado!');
    } else {
      if(!password) { showToast('warning', 'A senha inicial é obrigatória.'); return; }
      await apiFetch('/api/users', { method: 'POST', body: JSON.stringify({ name, email, role, password }) });
      showToast('success', 'Usuário criado!');
    }
    closeUserModal();
    loadTeam();
  } catch(err) { showToast('error', err.message); }
};
window.editUser = async function(id) {
  try {
    const users = await apiFetch('/api/users');
    const u = users.find(x => x.id === id);
    if(u) {
      document.getElementById('user-form-id').value = u.id;
      document.getElementById('user-form-name').value = u.name;
      document.getElementById('user-form-email').value = u.email;
      document.getElementById('user-form-role').value = u.role;
      document.getElementById('user-form-password').value = '';
      document.getElementById('user-modal-title').textContent = 'Editar Usuário';
      document.getElementById('user-modal').classList.add('active');
    }
  } catch(err) {}
};
window.deleteUser = function(id) {
  showConfirm('Remover Usuário', 'Tem certeza que deseja desativar este usuário?', async () => {
    try {
      await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
      showToast('success', 'Usuário removido.');
      loadTeam();
    } catch(err) { showToast('error', err.message); }
  });
};

window.openRouteModal = async function() {
  if (!state.activeProjectFormId) {
    showToast('error', 'Nenhum projeto selecionado.');
    return;
  }
  document.getElementById('route-modal').classList.add('active');
  await renderAssignedResearchers();
};

window.renderAssignedResearchers = async function() {
  const container = document.getElementById('assigned-researchers-list');
  if(!container) return;
  container.innerHTML = '<div style="text-align:center;color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Carregando acessos...</div>';
  try {
     const routes = await apiFetch('/api/routes');
     const projectRoutes = routes.filter(r => r.form_id === state.activeProjectFormId);
     if (projectRoutes.length === 0) {
        container.innerHTML = '<div style="font-size:0.85rem;color:#64748b;text-align:center;">Nenhum pesquisador atribuído a este projeto ainda.</div>';
     } else {
        container.innerHTML = '<div style="font-size:0.85rem;margin-bottom:0.75rem;font-weight:600;color:var(--text-secondary);">Pesquisadores com Acesso:</div><div style="display:flex;flex-wrap:wrap;gap:0.5rem;">' + 
           projectRoutes.map(r => `<span class="badge badge-info" style="font-size:0.75rem;padding:0.4rem 0.6rem;"><i class="fa-solid fa-user"></i> ${r.researcher_name || r.researcher_id} (${r.city || 'Sem local'}) <i class="fa-solid fa-xmark" style="cursor:pointer;margin-left:8px;font-size:0.9rem;" onclick="removeRoute('${r.id}')" title="Remover Acesso"></i></span>`).join('') +
        '</div>';
     }
  } catch(e) {
     container.innerHTML = '<div style="color:red;font-size:0.8rem;">Erro ao carregar atribuições.</div>';
  }
};

window.removeRoute = function(routeId) {
  showConfirm('Remover Acesso', 'Tem certeza que deseja remover o acesso deste pesquisador ao projeto?', async () => {
    try {
      await apiFetch(`/api/routes/${routeId}`, { method: 'DELETE' });
      showToast('success', 'Acesso removido com sucesso.');
      await renderAssignedResearchers();
    } catch (err) {
      showToast('error', 'Erro ao remover acesso: ' + err.message);
    }
  });
};

window.closeRouteModal = function() { document.getElementById('route-modal').classList.remove('active'); };

window.saveRoute = async function() {
  const researcher_id = document.getElementById('route-form-researcher').value;
  const city = document.getElementById('route-form-city').value;
  const form_id = state.activeProjectFormId;
  
  if(!researcher_id || !form_id) { showToast('warning', 'Selecione o pesquisador.'); return; }
  if(!city) { showToast('warning', 'Informe a cidade/localidade.'); return; }
  
  try {
    const btn = event ? event.currentTarget : null;
    if (btn) setButtonLoading(btn, true);
    await apiFetch('/api/routes', { method: 'POST', body: JSON.stringify({ researcher_id, form_id, city }) });
    showToast('success', 'Acesso habilitado para o projeto!');
    document.getElementById('route-form-city').value = '';
    await renderAssignedResearchers();
  } catch(err) {
    showToast('error', 'Erro ao atribuir: ' + err.message);
  } finally {
    const btn = event ? event.currentTarget : null;
    if (btn) setButtonLoading(btn, false);
  }
};

window.deleteRoute = function(id) {
  showConfirm('Remover Acesso', 'O pesquisador não terá mais acesso a este projeto no aplicativo. Continuar?', async () => {
    try {
      await apiFetch(`/api/routes/${id}`, { method: 'DELETE' });
      showToast('success', 'Acesso removido com sucesso.');
      loadProjectAccess();
    } catch(err) { showToast('error', err.message); }
  }, { type: 'danger' });
};

// ===================== ODK URL COPY =====================
window.copyOdkUrl = function() {
  const url = document.getElementById('odk-server-url').textContent;
  navigator.clipboard.writeText(url).then(() => showToast('success', 'Endereço copiado!')).catch(() => showToast('info', 'Copie manualmente: ' + url));
};

// ===================== ROLES & PERMISSIONS =====================
async function loadRoles() {
  const tbody = document.getElementById('roles-tbody');
  if (!tbody) return;
  try {
    const roles = await apiFetch('/api/roles');
    tbody.innerHTML = '';
    if (roles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhum cargo customizado criado.</td></tr>';
      return;
    }
    roles.forEach(role => {
      const permsArray = Array.isArray(role.permissions) ? role.permissions : String(role.permissions || '').split(',');
      const perms = permsArray.filter(p=>p).map(p => `<span class="badge badge-info" style="margin:2px;">${p}</span>`).join('');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${role.name}</strong></td>
        <td>${perms}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deleteRole('${role.id}')"><i class="fa-solid fa-trash"></i></button></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    showToast('error', 'Erro ao carregar cargos: ' + err.message);
  }
}

window.saveNewRole = async function() {
  const name = document.getElementById('role-form-name').value;
  const checkboxes = document.querySelectorAll('.role-perm-cb:checked');
  const permissions = Array.from(checkboxes).map(cb => cb.value).join(',');
  
  if (!name || !permissions) {
    showToast('warning', 'Preencha o nome do cargo e selecione pelo menos uma permissão.');
    return;
  }
  
  try {
    await apiFetch('/api/roles', { method: 'POST', body: JSON.stringify({ name, permissions }) });
    showToast('success', 'Cargo criado com sucesso!');
    document.getElementById('role-form-name').value = '';
    document.querySelectorAll('.role-perm-cb').forEach(cb => cb.checked = false);
    loadRoles();
  } catch (err) {
    showToast('error', 'Erro ao salvar cargo: ' + err.message);
  }
};

window.deleteRole = function(id) {
  showConfirm('Excluir Cargo', 'Tem certeza que deseja apagar este cargo? Usuários com este cargo perderão os acessos.', async () => {
    try {
      await apiFetch(`/api/roles/${id}`, { method: 'DELETE' });
      showToast('success', 'Cargo apagado com sucesso!');
      loadRoles();
    } catch(err) {
      showToast('error', 'Erro ao apagar cargo: ' + err.message);
    }
  }, { type: 'danger', confirmText: 'Apagar' });
};

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', async () => {
  // Navigation
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    if (item.dataset.target) {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab(item.dataset.target);
      });
    }
  });

  // Mobile sidebar toggle
  document.getElementById('sidebar-toggle-mobile') && document.getElementById('sidebar-toggle-mobile').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('mobile-open');
  });

  // Authentication Check
  const savedUser = localStorage.getItem('auth_user');
  if (savedUser) {
    const u = JSON.parse(savedUser);
    state.activeRole = u.role;
    state.activeUserId = u.id;
    state.activeUserName = u.name;
    document.querySelector('.sidebar').style.display = 'flex';
    document.querySelector('.main-content').style.marginLeft = 'var(--sidebar-w)';
    switchTab('view-dashboard');
    await loadServerData();
    updateUserUI();
    applyRoleRestrictions();
    renderDashboard();
    initFormBuilder();
    renderFormBuilderList();
    if (state.forms.length > 0) loadFormIntoBuilder(state.forms[0]);
    initMobileSimulator();
    initDataExporter();
    renderAudioReviewList();
    if (typeof window.initWebSocket === 'function') window.initWebSocket();
  } else {
    document.querySelector('.sidebar').style.display = 'none';
    document.querySelector('.main-content').style.marginLeft = '0';
    switchTab('view-login');
  }



  // Refresh logs button
  document.getElementById('btn-refresh-logs') && document.getElementById('btn-refresh-logs').addEventListener('click', fetchLogs);

  // Reports Events
  const btnExportReports = document.getElementById('btn-export-reports');
  if (btnExportReports) {
    btnExportReports.addEventListener('click', () => {
      const btnExportMain = document.getElementById('btn-export-data');
      if (btnExportMain) btnExportMain.click();
    });
  }
  ['report-filter-form','report-filter-researcher','report-filter-status','report-filter-date'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('change', renderReportsTable);
  });

  // Init map on first map tab visit
  const mapNav = document.getElementById('nav-map');
  if (mapNav) {
    const initMapOnce = () => { setTimeout(() => initMap(), 200); mapNav.removeEventListener('click', initMapOnce); };
    mapNav.addEventListener('click', initMapOnce);
  }

  // Try loading logs quietly
  try { state.logs = await apiFetch('/api/logs'); } catch {}
  renderDashboard();
  
  // Load roles panel if accessible
  const rolesNav = document.querySelector('.nav-item[data-target="view-roles"]');
  if (rolesNav) {
    rolesNav.addEventListener('click', () => loadRoles());
  }
});

window.addLibraryQuestion = function(type) {
  let q = {
    id: 'q_' + Math.random().toString(36).substr(2, 9),
    type: 'text',
    text: '',
    options: [],
    required: false,
    relevant: '',
    constraint: '',
    constraint_message: ''
  };

  if (type === 'age') {
    q.type = 'number';
    q.text = 'Qual a sua idade?';
    q.constraint = '. >= 0 and . <= 120';
    q.constraint_message = 'Idade inválida.';
  } else if (type === 'gender') {
    q.type = 'select_one';
    q.text = 'Qual o seu gênero?';
    q.options = ['Masculino', 'Feminino', 'Outro', 'Prefiro não informar'];
  } else if (type === 'income') {
    q.type = 'decimal';
    q.text = 'Qual a sua renda familiar mensal?';
    q.constraint = '. >= 0';
    q.constraint_message = 'A renda não pode ser negativa.';
  } else if (type === 'gps') {
    q.type = 'geopoint';
    q.text = 'Capturar Coordenadas GPS';
  }

  state.activeForm.questions.push(q);
  renderBuilderQuestions();
  document.getElementById('question-library-modal').classList.remove('active');
  showToast('success', 'Pergunta adicionada da biblioteca!');
};

// ===================== PIPING MODAL =====================
window.openPipingModal = function(idx) {
  document.getElementById('piping-target-idx').value = idx;
  const select = document.getElementById('piping-source-q');
  select.innerHTML = '';
  
  let hasValidQuestions = false;
  for (let i = 0; i < idx; i++) {
    const prevQ = state.activeForm.questions[i];
    if (prevQ.text && !prevQ.type.startsWith('begin_') && !prevQ.type.startsWith('end_') && prevQ.type !== 'note') {
      select.innerHTML += `<option value="${prevQ.id}">${i+1}. ${prevQ.text}</option>`;
      hasValidQuestions = true;
    }
  }
  
  if (!hasValidQuestions) {
    showToast('warning', 'Não há perguntas válidas anteriores para inserir.');
    return;
  }
  
  document.getElementById('piping-modal').classList.add('active');
};

window.applyPiping = function() {
  const targetIdx = parseInt(document.getElementById('piping-target-idx').value, 10);
  const sourceId = document.getElementById('piping-source-q').value;
  
  if (!sourceId) return;
  
  const q = state.activeForm.questions[targetIdx];
  q.text = (q.text || '') + ' ${' + sourceId + '}';
  
  document.getElementById('piping-modal').classList.remove('active');
  renderBuilderQuestions();
  showToast('success', 'Variável inserida com sucesso!');
};

// ===================== CONVERSATIONAL SKIP LOGIC MODAL =====================
window.openAdvLogicModal = function(idx) {
  document.getElementById('adv-logic-q-idx').value = idx;
  const q = state.activeForm.questions[idx];
  const subtitleEl = document.getElementById('adv-logic-modal-subtitle');
  if (subtitleEl) subtitleEl.textContent = `Definindo quando exibir: Pergunta ${idx+1} (${q.text || q.id || 'Sem Título'})`;
  
  const select = document.getElementById('adv-logic-target-q');
  select.innerHTML = '';
  for (let i = 0; i < idx; i++) {
    const prevQ = state.activeForm.questions[i];
    if (prevQ.text || prevQ.id) {
      select.innerHTML += `<option value="${prevQ.id}">${i+1}. ${prevQ.text || prevQ.id}</option>`;
    }
  }
  
  if (idx === 0) {
    showToast('warning', 'A primeira pergunta é sempre exibida (não há perguntas anteriores para criar condição).');
    return;
  }

  if (!q._logic) {
    q._logic = [];
    if (q.relevant) {
      q._logic.push({ raw: q.relevant });
    }
  }

  document.getElementById('adv-logic-join').value = 'and';
  window.updateAdvLogicOperatorsAndValues();
  renderAdvLogicList(idx);
  document.getElementById('advanced-logic-modal').classList.add('active');
};

window.applyQuickLogicPreset = function(type) {
  const idx = parseInt(document.getElementById('adv-logic-q-idx').value, 10);
  const q = state.activeForm.questions[idx];
  if (!q || idx <= 0) return;

  if (type === 'clear') {
    q._logic = [];
    delete q.relevant;
    renderAdvLogicList(idx);
    showToast('info', 'Regras removidas. Esta pergunta sempre será exibida.');
    return;
  }

  const prevQ = state.activeForm.questions[idx - 1];
  if (!prevQ) return;
  if (!q._logic) q._logic = [];

  if (type === 'sim') {
    let choiceVal = 'sim';
    if (prevQ.options && prevQ.options.length > 0) {
      const match = prevQ.options.find(o => {
        const val = typeof o === 'string' ? o : (o.name || o.value || '');
        const lbl = typeof o === 'string' ? o : (o.label || '');
        return /^(sim|yes|s|1)$/i.test(val) || /^(sim|yes)$/i.test(lbl);
      });
      if (match) choiceVal = typeof match === 'string' ? match : (match.name || match.value);
      else choiceVal = typeof prevQ.options[0] === 'string' ? prevQ.options[0] : (prevQ.options[0].name || prevQ.options[0].value);
    }
    const syntax = `\${${prevQ.id}} = '${choiceVal}'`;
    q._logic.push({
      targetId: prevQ.id,
      target: prevQ.text || prevQ.id,
      op: '=',
      val: choiceVal,
      valLabel: 'Sim (' + choiceVal + ')',
      join: 'and',
      raw: syntax
    });
    showToast('success', `Atalho aplicado: Exibir se responder SIM na anterior.`);
  } else if (type === 'nao') {
    let choiceVal = 'nao';
    if (prevQ.options && prevQ.options.length > 0) {
      const match = prevQ.options.find(o => {
        const val = typeof o === 'string' ? o : (o.name || o.value || '');
        const lbl = typeof o === 'string' ? o : (o.label || '');
        return /^(nao|não|no|n|0|2)$/i.test(val) || /^(nao|não|no)$/i.test(lbl);
      });
      if (match) choiceVal = typeof match === 'string' ? match : (match.name || match.value);
      else choiceVal = typeof prevQ.options[prevQ.options.length - 1] === 'string' ? prevQ.options[prevQ.options.length - 1] : (prevQ.options[prevQ.options.length - 1].name || prevQ.options[prevQ.options.length - 1].value);
    }
    const syntax = `\${${prevQ.id}} = '${choiceVal}'`;
    q._logic.push({
      targetId: prevQ.id,
      target: prevQ.text || prevQ.id,
      op: '=',
      val: choiceVal,
      valLabel: 'Não (' + choiceVal + ')',
      join: 'and',
      raw: syntax
    });
    showToast('success', `Atalho aplicado: Exibir se responder NÃO na anterior.`);
  } else if (type === 'maior_18') {
    let target = state.activeForm.questions.slice(0, idx).find(item => 
      /idade|ano|nasc|age/i.test(item.id) || /idade|nascimento/i.test(item.text)
    ) || prevQ;
    const syntax = `\${${target.id}} >= 18`;
    q._logic.push({
      targetId: target.id,
      target: target.text || target.id,
      op: '>=',
      val: '18',
      valLabel: 'Maior de 18 anos',
      join: 'and',
      raw: syntax
    });
    showToast('success', `Atalho aplicado: Exibir se idade for maior ou igual a 18 anos.`);
  }

  // Rebuild relevant string
  let relevantStr = '';
  q._logic.forEach((rule, i) => {
    if (i === 0) relevantStr = `(${rule.raw})`;
    else relevantStr += ` ${rule.join || 'and'} (${rule.raw})`;
  });
  q.relevant = relevantStr;
  renderAdvLogicList(idx);
};

window.updateAdvLogicOperatorsAndValues = function() {
  const targetId = document.getElementById('adv-logic-target-q').value;
  const opSelect = document.getElementById('adv-logic-op');
  const valContainer = document.getElementById('adv-logic-val-container');
  
  if (!targetId || !opSelect || !valContainer) return;
  const targetQ = state.activeForm.questions.find(q => q.id === targetId);
  if (!targetQ) return;
  
  const isSelect = targetQ.type === 'select_one' || targetQ.type === 'select_multiple' || targetQ.type === 'single_choice' || targetQ.type === 'multiple_choice';
  const isNumber = targetQ.type === 'integer' || targetQ.type === 'decimal' || targetQ.type === 'number' || targetQ.type === 'range';
  
  // Filter operators
  if (isSelect || targetQ.type === 'text') {
    Array.from(opSelect.options).forEach(opt => {
      opt.style.display = (opt.value === '=' || opt.value === '!=') ? 'block' : 'none';
    });
    if (opSelect.value === '>' || opSelect.value === '<' || opSelect.value === '>=' || opSelect.value === '<=') opSelect.value = '=';
  } else {
    Array.from(opSelect.options).forEach(opt => { opt.style.display = 'block'; });
  }
  
  // Dynamic Input
  if (isSelect && targetQ.options && targetQ.options.length > 0) {
    let optionsHtml = targetQ.options.map(o => {
      const val = typeof o === 'string' ? o : (o.name || o.value || '');
      const lbl = typeof o === 'string' ? o : (o.label || val);
      return `<option value="${val}">${lbl}</option>`;
    }).join('');
    valContainer.innerHTML = `<select class="form-select" id="adv-logic-val" style="width:100%; font-size:0.78rem;">${optionsHtml}</select>`;
  } else if (isNumber) {
    valContainer.innerHTML = `<input type="number" class="form-input" id="adv-logic-val" placeholder="Valor numérico" style="width:100%; font-size:0.78rem;" />`;
  } else {
    valContainer.innerHTML = `<input type="text" class="form-input" id="adv-logic-val" placeholder="Texto esperado" style="width:100%; font-size:0.78rem;" />`;
  }
};

window.addAdvLogicCondition = function() {
  const idx = parseInt(document.getElementById('adv-logic-q-idx').value, 10);
  const q = state.activeForm.questions[idx];
  const targetId = document.getElementById('adv-logic-target-q').value;
  const targetQ = state.activeForm.questions.find(que => que.id === targetId);
  const targetText = targetQ ? targetQ.text : targetId;
  const join = document.getElementById('adv-logic-join').value;
  const op = document.getElementById('adv-logic-op').value;
  
  const valElement = document.getElementById('adv-logic-val') || document.getElementById('adv-logic-val-text');
  if (!valElement) return;
  const val = valElement.value.trim();
  let valLabel = val;
  if (valElement.tagName === 'SELECT') {
    valLabel = valElement.options[valElement.selectedIndex]?.text || val;
  }
  
  if (!targetId || !val) {
    showToast('warning', 'Preencha o valor da condição para adicionar a regra.');
    return;
  }

  if (!q._logic) q._logic = [];

  let syntax = '';
  if (op === '=') syntax = `\${${targetId}} = '${val}'`;
  else if (op === '!=') syntax = `\${${targetId}} != '${val}'`;
  else syntax = `\${${targetId}} ${op} ${val}`;

  q._logic.push({ targetId, target: targetText, op, val, valLabel, join, raw: syntax });
  
  // Build relevant string
  let relevantStr = '';
  q._logic.forEach((rule, i) => {
    if (i === 0) {
      relevantStr = `(${rule.raw})`;
    } else {
      relevantStr += ` ${rule.join || 'and'} (${rule.raw})`;
    }
  });
  q.relevant = relevantStr;
  
  if (valElement.tagName === 'INPUT') valElement.value = '';
  renderAdvLogicList(idx);
  showToast('success', 'Condição adicionada com sucesso!');
};

window.removeAdvLogicCondition = function(idx, logicIdx) {
  const q = state.activeForm.questions[idx];
  if (!q._logic) return;
  q._logic.splice(logicIdx, 1);
  let relevantStr = '';
  q._logic.forEach((rule, i) => {
    if (i === 0) {
      relevantStr = `(${rule.raw})`;
    } else {
      relevantStr += ` ${rule.join || 'and'} (${rule.raw})`;
    }
  });
  if (q._logic.length > 0) {
    q.relevant = relevantStr;
  } else {
    delete q.relevant;
  }
  renderAdvLogicList(idx);
  showToast('info', 'Condição removida.');
};

window.renderAdvLogicList = function(idx) {
  const q = state.activeForm.questions[idx];
  const tbody = document.getElementById('adv-logic-list');
  const countEl = document.getElementById('adv-logic-rules-count');
  tbody.innerHTML = '';
  
  const rulesCount = q._logic ? q._logic.length : 0;
  if (countEl) {
    countEl.textContent = rulesCount === 0 ? '0 regras (Sempre visível)' : `${rulesCount} regra(s) ativa(s)`;
    countEl.style.color = rulesCount === 0 ? 'var(--t-low)' : 'var(--cyan)';
  }

  if (!q._logic || q._logic.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:1.2rem; color:var(--t-low); font-size:0.8rem;"><i class="fa-solid fa-lock-open" style="margin-right:0.4rem; color:var(--emerald);"></i> Esta pergunta sempre será exibida (nenhuma restrição de pulo).</td></tr>';
    return;
  }

  q._logic.forEach((rule, i) => {
    let joinBadge = i === 0 ? '' : `<span class="badge" style="background:rgba(56,189,248,0.15); color:var(--cyan); font-weight:700; margin-right:0.5rem; font-size:0.7rem;">${rule.join === 'or' ? 'OU' : 'E'}</span>`;
    let display = rule.target ? `${joinBadge}<span style="font-weight:600; color:var(--t-high);">[${rule.target}]</span> <span style="color:var(--amber); font-weight:bold;">${rule.op}</span> <span style="font-weight:600; color:var(--cyan);">${rule.valLabel || rule.val}</span>` : `${joinBadge}<code>${rule.raw}</code>`;
    
    tbody.innerHTML += `
      <tr>
        <td style="font-size:0.82rem; padding:0.6rem 0.75rem;">${display}</td>
        <td style="text-align:center;"><button type="button" class="btn btn-sm" style="color:var(--red); background:rgba(248,113,113,0.1); border:none; border-radius:var(--r-xs); padding:0.3rem 0.5rem; cursor:pointer;" onclick="removeAdvLogicCondition(${idx}, ${i})" title="Remover regra"><i class="fa-solid fa-trash"></i></button></td>
      </tr>
    `;
  });
};

window.closeAdvLogicModal = function() {
  document.getElementById('advanced-logic-modal').classList.remove('active');
  renderBuilderQuestions();
  showToast('success', 'Regras de exibição salvas com sucesso!');
};

// ===================== DASHBOARD BULK ACTIONS =====================
window.archiveSelectedProjects = function() {
  const checkboxes = document.querySelectorAll('.proj-checkbox:checked');
  if (checkboxes.length === 0) {
    showToast('warning', 'Selecione pelo menos um projeto para arquivar.');
    return;
  }
  showConfirm('Arquivar Projetos', `Tem certeza que deseja arquivar ${checkboxes.length} projeto(s)? Eles não receberão novas coletas.`, async () => {
    try {
      for (const cb of checkboxes) {
        await apiFetch(`/api/forms/${cb.value}/archive`, { method: 'PATCH' });
      }
      showToast('success', 'Projetos arquivados com sucesso.');
      await loadServerData();
      renderDashboard();
    } catch (err) {
      showToast('error', 'Erro ao arquivar projetos: ' + err.message);
    }
  });
};

window.dashboardShareSelected = function() {
  const checkboxes = document.querySelectorAll('.proj-checkbox:checked');
  if (checkboxes.length === 0) {
    showToast('warning', 'Selecione um projeto para gerenciar acessos.');
    return;
  }
  if (checkboxes.length > 1) {
    showToast('warning', 'Selecione apenas um projeto para compartilhar.');
    return;
  }
  const formId = checkboxes[0].value;
  state.activeProjectFormId = formId;
  openRouteModal();
};

window.deleteSelectedProjects = function() {
  const checkboxes = document.querySelectorAll('.proj-checkbox:checked');
  if (checkboxes.length === 0) {
    showToast('warning', 'Selecione pelo menos um projeto para excluir.');
    return;
  }
  showConfirm('Excluir Projetos', `Tem certeza que deseja excluir ${checkboxes.length} projeto(s)? Todos os dados serão perdidos.`, async () => {
    try {
      for (const cb of checkboxes) {
        await apiFetch(`/api/forms/${cb.value}`, { method: 'DELETE' });
      }
      showToast('success', 'Projetos excluídos com sucesso.');
      await loadServerData();
      renderDashboard();
    } catch (err) {
      showToast('error', 'Erro ao excluir projetos: ' + err.message);
    }
  });
};

// ===================== WEBSOCKETS =====================
let wsClient = null;
window.initWebSocket = function() {
  if (wsClient) return;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  wsClient = new WebSocket(wsUrl);
  
  wsClient.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.topic === 'new_submission') {
        const payload = data.payload;
        if (state.activeProjectFormId === payload.form_id) {
          showToast('info', 'Nova coleta recebida! Atualizando painel...');
          
          // Soft reload data
          const [users, forms, interviews] = await Promise.all([
            apiFetch('/api/users'), apiFetch('/api/forms'), apiFetch('/api/interviews')
          ]);
          state.users = users || [];
          state.forms = forms || [];
          state.interviews = interviews || [];
          
          // Re-render project components silently
          if (state.map) renderMapMarkers();
          renderCharts();
          renderReportsTable();
          renderAudioReviewList();
          
          // Refresh dashboard stats if viewing dashboard
          if (document.getElementById('view-dashboard').classList.contains('active')) {
            renderDashboard();
          }
        }
      }
    } catch(err) {
      console.error('WS parse error', err);
    }
  };
  
  wsClient.onclose = () => {
    wsClient = null;
    setTimeout(window.initWebSocket, 5000);
  };
};

// ===================== QUICK TEMPLATES =====================
window.insertQuickTemplate = function(type) {
  if (!state.activeForm.questions) state.activeForm.questions = [];
  let newQuestions = [];

  if (type === 'demografico') {
    newQuestions = [
      {
        id: 'genero',
        text: 'Qual o seu sexo / gênero registrado?',
        type: 'select_one',
        required: true,
        options: [
          { name: 'masculino', label: 'Masculino' },
          { name: 'feminino', label: 'Feminino' },
          { name: 'outro', label: 'Outro / Não declarado' }
        ]
      },
      {
        id: 'faixa_etaria',
        text: 'Qual é a sua faixa etária?',
        type: 'select_one',
        required: true,
        options: [
          { name: '16_24', label: '16 a 24 anos' },
          { name: '25_34', label: '25 a 34 anos' },
          { name: '35_44', label: '35 a 44 anos' },
          { name: '45_59', label: '45 a 59 anos' },
          { name: '60_mais', label: '60 anos ou mais' }
        ]
      },
      {
        id: 'escolaridade',
        text: 'Qual é o seu grau de instrução / escolaridade concluído?',
        type: 'select_one',
        required: true,
        options: [
          { name: 'fundamental', label: 'Ensino Fundamental' },
          { name: 'medio', label: 'Ensino Médio' },
          { name: 'superior', label: 'Ensino Superior' },
          { name: 'pos_graduacao', label: 'Pós-Graduação / Mestrado / Doutorado' }
        ]
      },
      {
        id: 'renda_familiar',
        text: 'Qual a renda familiar mensal aproximada da sua residência?',
        type: 'select_one',
        required: false,
        options: [
          { name: 'ate_1_sm', label: 'Até 1 salário mínimo' },
          { name: 'de_1_a_2_sm', label: 'Mais de 1 até 2 salários mínimos' },
          { name: 'de_2_a_5_sm', label: 'Mais de 2 até 5 salários mínimos' },
          { name: 'mais_5_sm', label: 'Mais de 5 salários mínimos' },
          { name: 'sem_rendimento', label: 'Sem rendimento fixo / Não sabe' }
        ]
      }
    ];
  } else if (type === 'nps') {
    newQuestions = [
      {
        id: 'nps_score',
        text: 'Em uma escala de 0 a 10, qual a probabilidade de você recomendar esta gestão / serviço a um amigo ou familiar?',
        type: 'select_one',
        required: true,
        options: [
          { name: '0', label: '0 - De forma alguma' },
          { name: '1', label: '1' },
          { name: '2', label: '2' },
          { name: '3', label: '3' },
          { name: '4', label: '4' },
          { name: '5', label: '5 - Neutro' },
          { name: '6', label: '6' },
          { name: '7', label: '7' },
          { name: '8', label: '8' },
          { name: '9', label: '9' },
          { name: '10', label: '10 - Com certeza absoluta' }
        ]
      },
      {
        id: 'nps_motivo',
        text: 'Qual o principal motivo para a sua avaliação/nota atribuída?',
        hint: 'Descreva livremente o que mais impactou sua percepção.',
        type: 'text',
        required: false
      }
    ];
  } else if (type === 'auditoria_campo') {
    newQuestions = [
      {
        id: 'gps_coleta',
        text: 'Coordenadas Geográficas da Coleta (GPS Obrigatório)',
        hint: 'Aguarde precisão de satélite inferior a 10m no smartphone.',
        type: 'geopoint',
        required: true
      },
      {
        id: 'foto_fachada',
        text: 'Registro Fotográfico do Ponto / Fachada Residencial',
        hint: 'Tire uma foto clara do local ou residência pesquisada.',
        type: 'image',
        required: true
      },
      {
        id: 'audio_auditoria',
        text: 'Gravação de Áudio de Auditoria de Campo (Controle de Qualidade)',
        hint: 'Áudio gravado durante a abordagem para validação estatística.',
        type: 'audio_record',
        required: false
      }
    ];
  } else if (type === 'termo_lgpd') {
    newQuestions = [
      {
        id: 'termo_lgpd_info',
        text: 'Aviso de Privacidade e Conformidade LGPD (Lei 13.709/2018)',
        hint: 'Informamos que suas respostas são confidenciais, protegidas por criptografia e consolidadas exclusivamente para fins estatísticos e de amostragem populacional.',
        type: 'note',
        required: false
      },
      {
        id: 'consentimento_pesquisa',
        text: 'O(A) senhor(a) concorda livremente em participar desta pesquisa?',
        type: 'select_one',
        required: true,
        options: [
          { name: 'sim_concordo', label: 'Sim, concordo e autorizo a entrevista' },
          { name: 'nao_recusa', label: 'Não aceito participar (Encerrar entrevista)' }
        ]
      }
    ];
  }

  // Ensure unique IDs
  const existingIds = new Set(state.activeForm.questions.map(q => q.id));
  newQuestions.forEach(q => {
    let finalId = q.id;
    let counter = 1;
    while (existingIds.has(finalId)) {
      finalId = `${q.id}_${counter++}`;
    }
    existingIds.add(finalId);
    q.id = finalId;
    state.activeForm.questions.push(q);
  });

  renderBuilderQuestions();
  showToast('success', `Template rápido aplicado! ${newQuestions.length} perguntas adicionadas.`);
  
  const container = document.querySelector('.sys-workspace-body');
  if (container) container.scrollTop = container.scrollHeight;
};

// ===================== BATCH OPTIONS MODAL =====================
window.openBatchOptionsModal = function(idx) {
  document.getElementById('batch-options-target-idx').value = idx;
  const textarea = document.getElementById('batch-options-textarea');
  if (textarea) textarea.value = '';
  document.getElementById('batch-options-modal').classList.add('active');
  if (textarea) textarea.focus();
};

window.confirmBatchOptions = function() {
  const idx = parseInt(document.getElementById('batch-options-target-idx').value, 10);
  const q = state.activeForm.questions[idx];
  if (!q) {
    document.getElementById('batch-options-modal').classList.remove('active');
    return;
  }
  const rawText = (document.getElementById('batch-options-textarea').value || '').trim();
  if (!rawText) {
    showToast('warning', 'Cole ou digite ao menos uma opção.');
    return;
  }
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) {
    showToast('warning', 'Nenhuma linha válida encontrada.');
    return;
  }

  if (!q.options) q.options = [];
  
  lines.forEach(line => {
    let safeName = line
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!safeName || !isNaN(safeName[0])) safeName = 'opt_' + safeName;
    
    let uniqueName = safeName;
    let count = 1;
    while (q.options.some(opt => (typeof opt === 'object' ? opt.name : opt) === uniqueName)) {
      uniqueName = `${safeName}_${count++}`;
    }
    q.options.push({ name: uniqueName, label: line });
  });

  document.getElementById('batch-options-modal').classList.remove('active');
  renderBuilderQuestions();
  showToast('success', `${lines.length} opções adicionadas com sucesso!`);
};

// ===================== ODK QR CODE AUTO-CONFIG =====================
window.openOdkQrModal = function() {
  const origin = window.location.origin;
  const odkEndpoint = `${origin}/api`;
  const container = document.getElementById('odk-qr-container');
  const urlText = document.getElementById('odk-qr-url-text');
  
  if (urlText) urlText.textContent = odkEndpoint;
  
  const odkConfig = JSON.stringify({
    general: {
      server_url: odkEndpoint,
      formlist_url: `${odkEndpoint}/forms`,
      submission_url: `${odkEndpoint}/submissions`,
      username: 'pesquisador_campo'
    },
    admin: {}
  });

  if (container) {
    container.innerHTML = `
      <div style="background:white; padding:12px; border-radius:12px; display:inline-block; box-shadow: 0 4px 20px rgba(0,0,0,0.4);">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(odkConfig)}&margin=0" 
             alt="QR Code ODK Collect" 
             style="width:200px; height:200px; display:block;"
             onerror="this.onerror=null; this.src='https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(odkEndpoint)}';" />
      </div>
      <div style="margin-top:0.75rem; font-size:0.8rem; color:var(--text-secondary);">
        <i class="fa-solid fa-mobile-screen-button"></i> Compatível com <b>ODK Collect</b> e <b>KoboCollect</b>
      </div>
    `;
  }
  
  document.getElementById('odk-qr-modal').classList.add('active');
};

window.copyOdkUrl = function() {
  const url = `${window.location.origin}/api`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('success', 'URL do servidor ODK copiada com sucesso!');
  }).catch(() => {
    showToast('info', `URL: ${url}`);
  });
};

// ===================== CLOUD TELEMETRY & GOOGLE DRIVE =====================
async function loadCloudStatus() {
  try {
    const data = await apiFetch('/api/cloud/status');
    if (!data || !data.success) return;

    // Cloudflare Edge
    const cfBadge = document.getElementById('cf-status-badge');
    if (cfBadge && data.cloudflare) cfBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${data.cloudflare.status}`;

    const cfLatency = document.getElementById('cf-latency');
    if (cfLatency && data.cloudflare) cfLatency.textContent = data.cloudflare.latency;

    const cfLocation = document.getElementById('cf-edge-location');
    if (cfLocation && data.cloudflare) cfLocation.textContent = `${data.cloudflare.edgeLocation} (${data.cloudflare.protocol})`;

    // Google Drive
    const gdBadge = document.getElementById('gdrive-status-badge');
    if (gdBadge && data.googleDrive) gdBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${data.googleDrive.status}`;

    const gdFiles = document.getElementById('gdrive-files-count');
    if (gdFiles && data.googleDrive) gdFiles.textContent = `${data.googleDrive.totalFilesSynced} arquivos sincronizados`;

    const gdLabel = document.getElementById('gdrive-quota-text') || document.getElementById('gdrive-storage-label');
    if (gdLabel && data.googleDrive) gdLabel.textContent = `${data.googleDrive.usedGb} GB / ${data.googleDrive.totalQuotaGb} GB (${data.googleDrive.percentUsed}%)`;

    const gdBar = document.getElementById('gdrive-quota-bar') || document.getElementById('gdrive-storage-bar');
    if (gdBar && data.googleDrive) gdBar.style.width = `${Math.max(5, data.googleDrive.percentUsed)}%`;

    const gdSync = document.getElementById('gdrive-last-sync');
    if (gdSync && data.googleDrive) gdSync.textContent = data.googleDrive.lastSync;

    const gdAcc = document.getElementById('gdrive-account');
    if (gdAcc && data.googleDrive) gdAcc.textContent = data.googleDrive.account || 'nuvem.auditoria@guiadata.corp';

    const gdAudios = document.getElementById('gdrive-audios');
    if (gdAudios) gdAudios.textContent = `${(data.googleDrive && data.googleDrive.totalFilesSynced) || (state.interviews ? state.interviews.length : 0)} áudios sincronizados`;

    const gdInts = document.getElementById('gdrive-interviews');
    if (gdInts) gdInts.textContent = `${state.interviews ? state.interviews.length : 0} entrevistas em nuvem`;
  } catch (err) {
    console.warn('Erro ao carregar telemetria de nuvem:', err);
  }
}

window.syncGoogleDriveNow = async function() {
  const btn = document.getElementById('btn-sync-drive-manual') || document.getElementById('btn-sync-gdrive');
  const oldText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Sincronizando...';
    btn.disabled = true;
  }
  try {
    const res = await apiFetch('/api/cloud/sync-drive', { method: 'POST' });
    if (res && res.success) {
      showToast('success', res.message || 'Mídias e áudios de campo sincronizados no Google Drive com sucesso!');
      await loadCloudStatus();
    }
  } catch (err) {
    showToast('error', 'Falha ao sincronizar: ' + err.message);
  } finally {
    if (btn) {
      btn.innerHTML = oldText;
      btn.disabled = false;
    }
  }
};

// =====================================================================
// ENTERPRISE SUITE (R$ 10.000/MÊS) JAVASCRIPT LOGIC
// =====================================================================

window.currentCrossTabResult = null;

window.initExecutiveSuite = async function() {
  try {
    // Populate form dropdowns across executive tabs
    const forms = state.forms && state.forms.length > 0 ? state.forms : (await apiFetch('/api/forms') || []);
    state.forms = forms;

    const crossTabSelect = document.getElementById('exec-crosstab-form');
    const forensicSelect = document.getElementById('exec-forensic-form');
    const lgpdSelect = document.getElementById('exec-lgpd-form');

    const optionsHtml = forms.map(f => `<option value="${f.id}">${f.title || f.id} (${f.status})</option>`).join('');

    if (crossTabSelect) {
      crossTabSelect.innerHTML = optionsHtml;
      if (forms.length > 0) loadFormQuestionsForCrossTab(forms[0].id);
    }
    if (forensicSelect) forensicSelect.innerHTML = optionsHtml;
    if (lgpdSelect) lgpdSelect.innerHTML = optionsHtml;

    // Load initial data for active tabs
    await loadSlaStatus();
    await loadVipTickets();
    await loadAuditTrailEvents();
    await loadWhiteLabelSettings();
  } catch (err) {
    console.warn('Erro ao inicializar Central Executiva:', err);
  }
};

window.switchExecTab = function(tabId) {
  document.querySelectorAll('.exec-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-exectab') === tabId);
  });
  document.querySelectorAll('.exec-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === tabId);
    content.style.display = content.id === tabId ? 'block' : 'none';
  });

  if (tabId === 'exec-tab-crosstab' && !window.currentCrossTabResult) {
    runExecCrossTab();
  }
  if (tabId === 'exec-tab-forensic') {
    runExecForensicAudit();
  }
  if (tabId === 'exec-tab-audit') loadAuditTrailEvents();
  if (tabId === 'exec-tab-sla') { loadSlaStatus(); loadVipTickets(); }
  if (tabId === 'exec-tab-whitelabel') loadWhiteLabelSettings();
};

window.loadFormQuestionsForCrossTab = function(formId) {
  const form = (state.forms || []).find(f => f.id === formId);
  const rowSelect = document.getElementById('exec-crosstab-row');
  const colSelect = document.getElementById('exec-crosstab-col');
  if (!form || !rowSelect || !colSelect) return;

  const questions = form.questions || [];
  const validQs = questions.filter(q => q.type !== 'geopoint' && q.type !== 'audio' && q.type !== 'image');

  if (validQs.length === 0) {
    rowSelect.innerHTML = '<option value="">Nenhuma pergunta elegível</option>';
    colSelect.innerHTML = '<option value="">Nenhuma pergunta elegível</option>';
    return;
  }

  const rowHtml = validQs.map((q, i) => `<option value="${q.id}" ${i === 0 ? 'selected' : ''}>${q.title || q.text || q.label || q.id}</option>`).join('');
  const colHtml = validQs.map((q, i) => `<option value="${q.id}" ${i === 1 ? 'selected' : (i === 0 ? 'selected' : '')}>${q.title || q.text || q.label || q.id}</option>`).join('');

  rowSelect.innerHTML = rowHtml;
  colSelect.innerHTML = colHtml;
};

window.runExecCrossTab = async function() {
  const formId = document.getElementById('exec-crosstab-form')?.value;
  const rowVarId = document.getElementById('exec-crosstab-row')?.value;
  const colVarId = document.getElementById('exec-crosstab-col')?.value;

  if (!formId || !rowVarId || !colVarId) {
    return showToast('warning', 'Selecione o projeto e ambas as variáveis para o cruzamento.');
  }

  try {
    const res = await apiFetch(`/api/analytics/cross-tab/${formId}`, {
      method: 'POST',
      body: JSON.stringify({ rowVarId, colVarId })
    });

    window.currentCrossTabResult = res;

    // Show KPI Cards
    const kpiBox = document.getElementById('exec-crosstab-kpis');
    if (kpiBox) kpiBox.style.display = 'grid';
    document.getElementById('exec-crosstab-n').textContent = res.totalResponses;
    document.getElementById('exec-crosstab-me').textContent = res.marginOfError;
    document.getElementById('exec-crosstab-chi').textContent = `${res.chiSquare.statistic} (gl=${res.chiSquare.df})`;
    document.getElementById('exec-crosstab-sig').textContent = res.chiSquare.significant ? 'Significante (p < 0.05)' : 'Não Significante (p >= 0.05)';
    document.getElementById('exec-crosstab-sig').style.color = res.chiSquare.significant ? '#10b981' : '#f59e0b';

    // Render Matrix Table
    const thead = document.getElementById('exec-crosstab-thead');
    const tbody = document.getElementById('exec-crosstab-tbody');
    const resultCard = document.getElementById('exec-crosstab-result-card');
    if (resultCard) resultCard.style.display = 'block';

    let headerHtml = `<tr><th>${res.rowLabel} \\ ${res.colLabel}</th>`;
    res.colCategories.forEach(col => {
      headerHtml += `<th>${col}</th>`;
    });
    headerHtml += `<th>TOTAL LINHA</th></tr>`;
    thead.innerHTML = headerHtml;

    let bodyHtml = '';
    res.rowCategories.forEach(row => {
      bodyHtml += `<tr><td style="font-weight:700; color:#fff;">${row}</td>`;
      res.colCategories.forEach(col => {
        const cell = res.cells[row][col] || { count: 0, rowPct: 0, colPct: 0 };
        // Determine heatmap intensity class (0-4)
        const intensity = Math.min(4, Math.floor(cell.rowPct / 20));
        bodyHtml += `
          <td class="crosstab-cell crosstab-heat-${intensity}">
            <div class="crosstab-count">${cell.count}</div>
            <span class="crosstab-subtext">${cell.rowPct}% linha | ${cell.colPct}% col</span>
          </td>
        `;
      });
      const rowTotal = res.rowTotals[row] || 0;
      const rowPct = res.grandTotal > 0 ? ((rowTotal / res.grandTotal) * 100).toFixed(1) : 0;
      bodyHtml += `<td style="font-weight:800; color:var(--cyan); text-align:center;">${rowTotal} <span style="font-size:0.7rem; color:var(--t-low); display:block;">(${rowPct}%)</span></td></tr>`;
    });

    // Total Row
    bodyHtml += `<tr style="border-top:2px solid var(--border); font-weight:800; background:rgba(255,255,255,0.03);">
      <td style="color:var(--cyan);">TOTAL COLUNA</td>`;
    res.colCategories.forEach(col => {
      const colTotal = res.colTotals[col] || 0;
      const colPct = res.grandTotal > 0 ? ((colTotal / res.grandTotal) * 100).toFixed(1) : 0;
      bodyHtml += `<td style="text-align:center; color:var(--cyan);">${colTotal} <span style="font-size:0.7rem; color:var(--t-low); display:block;">(${colPct}%)</span></td>`;
    });
    bodyHtml += `<td style="text-align:center; color:#10b981; font-size:1.05rem;">${res.grandTotal} (100%)</td></tr>`;
    tbody.innerHTML = bodyHtml;

    showToast('success', `Tabulação cruzada calculada com sucesso (${res.totalResponses} entrevistas analisadas).`);
  } catch (err) {
    showToast('error', 'Falha ao cruzar dados: ' + err.message);
  }
};

window.exportCrossTabCsv = function() {
  if (!window.currentCrossTabResult) {
    return showToast('warning', 'Execute um cruzamento antes de exportar.');
  }
  const res = window.currentCrossTabResult;
  let csv = `"${res.rowLabel}" / "${res.colLabel}",` + res.colCategories.map(c => `"${c}"`).join(',') + ',"TOTAL"\n';

  res.rowCategories.forEach(r => {
    const rowValues = res.colCategories.map(c => {
      const cell = res.cells[r][c];
      return `"${cell.count} (${cell.rowPct}%)"`;
    });
    csv += `"${r}",` + rowValues.join(',') + `,"${res.rowTotals[r]}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `CrossTab_${res.rowVarId}_vs_${res.colVarId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('success', 'Planilha de cruzamento estatístico exportada com sucesso!');
};

window.runExecForensicAudit = async function() {
  const formId = document.getElementById('exec-forensic-form')?.value;
  if (!formId) return showToast('warning', 'Selecione um projeto para auditar.');

  try {
    const res = await apiFetch(`/api/analytics/forensic-audit/${formId}`);
    const resultsBox = document.getElementById('exec-forensic-results');
    if (resultsBox) resultsBox.style.display = 'block';

    const trustScoreEl = document.getElementById('exec-forensic-trust-score');
    trustScoreEl.textContent = `${res.globalTrustScore}%`;
    trustScoreEl.style.color = res.globalTrustScore >= 90 ? '#10b981' : (res.globalTrustScore >= 70 ? '#f59e0b' : '#ef4444');

    document.getElementById('exec-forensic-total').textContent = res.totalInterviews;
    document.getElementById('exec-forensic-certified').textContent = res.certifiedCount;
    document.getElementById('exec-forensic-flagged').textContent = res.flaggedCount;

    document.getElementById('exec-forensic-seal').textContent = res.forensicReport.sealNumber;
    document.getElementById('exec-forensic-date').textContent = new Date(res.forensicReport.issuedAt).toLocaleString('pt-BR');
    document.getElementById('exec-forensic-conclusion').textContent = res.forensicReport.conclusion;

    const tbody = document.getElementById('exec-forensic-tbody');
    if (tbody) {
      if (res.inspections.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--t-low);">Nenhuma coleta registrada para este formulário.</td></tr>';
      } else {
        tbody.innerHTML = res.inspections.map(item => {
          const statusClass = item.status === 'CERTIFIED_VALID' ? 'trust-certified' : (item.status === 'WARNING_REVIEW' ? 'trust-warning' : 'trust-flagged');
          const statusLabel = item.status === 'CERTIFIED_VALID' ? 'Aprovada' : (item.status === 'WARNING_REVIEW' ? 'Alerta' : 'Expurgo');
          const flagsText = item.flags.length > 0 ? item.flags.map(f => `<span class="badge badge-warning" style="font-size:0.68rem; margin-right:3px;">${f.code}</span>`).join('') : '<span style="color:#10b981; font-size:0.78rem;"><i class="fa-solid fa-check"></i> Sem anomalias</span>';

          return `
            <tr>
              <td><code>${item.interviewId}</code></td>
              <td>${item.researcherId}</td>
              <td style="font-size:0.75rem; color:var(--t-mid);">${item.deviceId}</td>
              <td><span class="trust-score-badge ${statusClass}">${item.trustScore}%</span></td>
              <td><span class="trust-score-badge ${statusClass}">${statusLabel}</span></td>
              <td>${flagsText}</td>
            </tr>
          `;
        }).join('');
      }
    }

    showToast('success', `Perícia forense concluída: Trust Score Geral de ${res.globalTrustScore}%.`);
  } catch (err) {
    showToast('error', 'Falha na perícia: ' + err.message);
  }
};

window.checkAuditTrailIntegrity = async function() {
  const banner = document.getElementById('exec-audit-status-banner');
  try {
    const res = await apiFetch('/api/audit-trail/verify');
    if (banner) {
      banner.style.display = 'block';
      if (res.isValid) {
        banner.style.background = 'rgba(16,185,129,0.15)';
        banner.style.border = '1px solid rgba(16,185,129,0.4)';
        banner.style.color = '#34d399';
        banner.innerHTML = `<i class="fa-solid fa-circle-check"></i> <b>Cadeia Criptográfica Íntegra:</b> ${res.statusText} <br><span style="font-family:var(--mono); font-size:0.7rem; color:var(--t-low);">HEAD HASH: ${res.headHash || 'GENESIS'}</span>`;
      } else {
        banner.style.background = 'rgba(239,68,68,0.15)';
        banner.style.border = '1px solid rgba(239,68,68,0.4)';
        banner.style.color = '#f87171';
        banner.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <b>VIOLAÇÃO DE INTEGRIDADE DETECTADA:</b> ${res.statusText}`;
      }
    }
  } catch (err) {
    showToast('error', 'Falha ao verificar cadeia: ' + err.message);
  }
};

window.loadAuditTrailEvents = async function() {
  const tbody = document.getElementById('exec-audit-tbody');
  if (!tbody) return;
  try {
    const events = await apiFetch('/api/audit-trail');
    if (!events || events.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--t-low);">Nenhum evento registrado ainda.</td></tr>';
      return;
    }
    tbody.innerHTML = events.map(ev => `
      <tr>
        <td style="font-size:0.75rem; white-space:nowrap;">${new Date(ev.created_at).toLocaleString('pt-BR')}</td>
        <td><b>${ev.actor_name}</b> <span style="font-size:0.7rem; color:var(--t-low);">(${ev.actor_role})</span></td>
        <td><span class="badge badge-info" style="font-size:0.7rem;">${ev.action}</span></td>
        <td><code>${ev.resource}</code></td>
        <td style="font-size:0.75rem; color:var(--t-mid);">${ev.ip || '127.0.0.1'}</td>
        <td style="font-family:var(--mono); font-size:0.72rem; color:var(--cyan);" title="Hash Completo: ${ev.hash}">
          ${ev.hash.substring(0, 16)}...
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.warn('Erro ao carregar trilha de auditoria:', err);
  }
};

window.executeLgpdAnonymization = function() {
  const formId = document.getElementById('exec-lgpd-form')?.value;
  if (!formId) return showToast('warning', 'Selecione um projeto para anonimizar.');

  showConfirmModal('Sanitização LGPD', 'Atenção: Os dados identificáveis (nomes, CPFs, telefones e GPS exato) das entrevistas deste projeto serão anonimizados irreversivelmente. Deseja prosseguir?', {
    confirmText: 'Anonimizar Agora',
    type: 'danger'
  }, async () => {
    try {
      const res = await apiFetch(`/api/lgpd/anonymize/${formId}`, { method: 'POST' });
      const msgBox = document.getElementById('exec-lgpd-result-msg');
      if (msgBox) {
        msgBox.style.display = 'block';
        msgBox.style.color = '#34d399';
        msgBox.innerHTML = `<i class="fa-solid fa-shield-check"></i> ${res.message}`;
      }
      showToast('success', res.message);
      await loadServerData();
    } catch (err) {
      showToast('error', 'Falha na anonimização: ' + err.message);
    }
  });
};

window.loadSlaStatus = async function() {
  try {
    const res = await apiFetch('/api/system/sla-status');
    const slaEl = document.getElementById('exec-sla-current');
    const uptimeEl = document.getElementById('exec-sla-uptime');
    const latencyEl = document.getElementById('exec-sla-latency');
    const statusEl = document.getElementById('exec-sla-status');

    if (slaEl) slaEl.textContent = res.slaCurrent;
    if (uptimeEl) uptimeEl.textContent = res.uptimeHuman;
    if (latencyEl) latencyEl.textContent = `${res.apiLatencyMs}ms`;
    if (statusEl) statusEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> OPERACIONAL`;
  } catch (err) {
    console.warn('Erro ao carregar SLA:', err);
  }
};

window.loadVipTickets = async function() {
  const tbody = document.getElementById('exec-tickets-tbody');
  if (!tbody) return;
  try {
    const tickets = await apiFetch('/api/support/tickets');
    if (!tickets || tickets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--t-low);">Nenhum chamado aberto na central VIP.</td></tr>';
      return;
    }
    tbody.innerHTML = tickets.map(t => {
      const sevClass = t.severity === 'P1' ? 'badge-p1' : (t.severity === 'P2' ? 'badge-p2' : 'badge-p3');
      const statusClass = t.status === 'open' ? 'badge-status-open' : 'badge-status-resolved';
      const deadline = new Date(t.sla_deadline).toLocaleString('pt-BR');
      return `
        <tr>
          <td><code>${t.id}</code></td>
          <td><span class="badge ${sevClass}">${t.severity}</span></td>
          <td><b>${t.title}</b></td>
          <td>${t.client_name}</td>
          <td style="color:#fbbf24; font-weight:600;">${deadline}</td>
          <td><span class="badge ${statusClass}">${t.status.toUpperCase()}</span></td>
          <td style="font-size:0.75rem; color:var(--t-low);">${new Date(t.created_at).toLocaleTimeString('pt-BR')}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.warn('Erro ao carregar tickets:', err);
  }
};

window.openVipTicketModal = function() {
  const modal = document.getElementById('vip-ticket-modal');
  if (modal) modal.classList.add('active');
};

window.submitVipTicket = async function() {
  const severity = document.getElementById('ticket-form-severity')?.value;
  const title = document.getElementById('ticket-form-title')?.value.trim();
  const description = document.getElementById('ticket-form-desc')?.value.trim();

  if (!title) return showToast('warning', 'Preencha o título do chamado.');

  try {
    const res = await apiFetch('/api/support/tickets', {
      method: 'POST',
      body: JSON.stringify({ severity, title, description, clientName: state.activeUser ? state.activeUser.name : 'Cliente Corporativo' })
    });
    showToast('success', `Chamado [${res.id}] aberto com sucesso! Prazo SLA imediato registrado.`);
    document.getElementById('vip-ticket-modal')?.classList.remove('active');
    document.getElementById('ticket-form-title').value = '';
    document.getElementById('ticket-form-desc').value = '';
    await loadVipTickets();
  } catch (err) {
    showToast('error', 'Falha ao abrir chamado: ' + err.message);
  }
};

window.loadWhiteLabelSettings = async function() {
  try {
    const res = await apiFetch('/api/settings/white-label');
    if (!res) return;
    const orgInput = document.getElementById('wl-org-name');
    const logoInput = document.getElementById('wl-logo-url');
    const primInput = document.getElementById('wl-primary-color');
    const accInput = document.getElementById('wl-accent-color');
    const repInput = document.getElementById('wl-report-header');

    if (orgInput) orgInput.value = res.org_name || '';
    if (logoInput) logoInput.value = res.logo_url || '';
    if (primInput) primInput.value = res.primary_color || '#38bdf8';
    if (accInput) accInput.value = res.accent_color || '#10b981';
    if (repInput) repInput.value = res.report_header || '';
  } catch (err) {
    console.warn('Erro ao carregar white-label:', err);
  }
};

window.saveWhiteLabelSettings = async function() {
  const org_name = document.getElementById('wl-org-name')?.value.trim();
  const logo_url = document.getElementById('wl-logo-url')?.value.trim();
  const primary_color = document.getElementById('wl-primary-color')?.value;
  const accent_color = document.getElementById('wl-accent-color')?.value;
  const report_header = document.getElementById('wl-report-header')?.value.trim();

  try {
    const res = await apiFetch('/api/settings/white-label', {
      method: 'POST',
      body: JSON.stringify({ org_name, logo_url, primary_color, accent_color, report_header })
    });
    showToast('success', res.message || 'Identidade corporativa atualizada com sucesso!');
  } catch (err) {
    showToast('error', 'Falha ao salvar marca: ' + err.message);
  }
};

// =========================================================================
// ADVANCED QA & ENGINEERING EXTENSIONS (QUOTAS, CODEBOOK, AUDIO, TEAM, GEO)
// =========================================================================

// --- 1. QUOTA STUDIO & PROGRESS ---
let studioQuotas = [];

window.openQuotaStudioModal = async function() {
  const formId = state.activeProjectFormId;
  if (!formId) {
    showToast('warning', 'Selecione um projeto primeiro.');
    return;
  }

  const modal = document.getElementById('quota-studio-modal');
  if (!modal) return;

  const form = state.forms.find(f => f.id === formId);
  const qSelect = document.getElementById('qs-select-question');
  qSelect.innerHTML = '<option value="">-- Selecione uma Pergunta --</option>';

  let questions = [];
  if (form) {
    try {
      questions = typeof form.questions_json === 'string' ? JSON.parse(form.questions_json) : (form.questions_json || []);
    } catch { questions = []; }
  }

  questions.forEach(q => {
    const opt = document.createElement('option');
    opt.value = q.id;
    opt.textContent = `${q.id}: ${q.text}`;
    opt.dataset.options = JSON.stringify(q.options || []);
    qSelect.appendChild(opt);
  });

  try {
    const res = await apiFetch(`/api/forms/${formId}/quotas`);
    studioQuotas = res.quotas || [];
  } catch {
    studioQuotas = [];
  }

  window.onQuotaQuestionSelected();
  renderStudioQuotasTable();
  modal.classList.add('active');
};

window.closeQuotaStudioModal = function() {
  document.getElementById('quota-studio-modal')?.classList.remove('active');
};

window.onQuotaQuestionSelected = function() {
  const qSelect = document.getElementById('qs-select-question');
  const optSelect = document.getElementById('qs-select-option');
  if (!qSelect || !optSelect) return;

  optSelect.innerHTML = '';
  const selectedOption = qSelect.options[qSelect.selectedIndex];
  if (!selectedOption || !selectedOption.dataset.options) return;

  try {
    const options = JSON.parse(selectedOption.dataset.options);
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      optSelect.appendChild(opt);
    });
  } catch {}
};

window.addQuotaFromStudio = function() {
  const qSelect = document.getElementById('qs-select-question');
  const optSelect = document.getElementById('qs-select-option');
  const targetInput = document.getElementById('qs-input-target');

  const qId = qSelect.value;
  const qText = qSelect.options[qSelect.selectedIndex]?.textContent || qId;
  const val = optSelect.value;
  const target = parseInt(targetInput.value, 10);

  if (!qId || !val || isNaN(target) || target <= 0) {
    showToast('warning', 'Preencha a pergunta, a opção e uma meta válida.');
    return;
  }

  if (studioQuotas.some(q => q.question_id === qId && q.target_value === val)) {
    showToast('warning', 'Esta cota já foi adicionada.');
    return;
  }

  studioQuotas.push({
    id: `q_${qId}_${Date.now()}`,
    question_id: qId,
    question_text: qText,
    target_value: val,
    target_count: target,
    current_count: 0,
    percent: 0,
    status: 'open'
  });

  renderStudioQuotasTable();
  showToast('info', `Cota para "${val}" inserida com sucesso.`);
};

window.removeQuotaFromStudio = function(index) {
  studioQuotas.splice(index, 1);
  renderStudioQuotasTable();
};

function renderStudioQuotasTable() {
  const tbody = document.getElementById('qs-quotas-tbody');
  if (!tbody) return;

  if (studioQuotas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Nenhuma cota configurada neste projeto.</td></tr>';
    return;
  }

  tbody.innerHTML = studioQuotas.map((q, idx) => {
    const pct = q.percent || 0;
    const badgeClass = q.status === 'locked' ? 'badge-quota-locked' : (q.status === 'near_limit' ? 'badge-quota-near' : 'badge-quota-open');
    const statusLabel = q.status === 'locked' ? 'Encerrada' : (q.status === 'near_limit' ? 'Quase Cheia' : 'Aberta');

    return `
      <tr>
        <td><strong>${q.question_text || q.question_id}</strong></td>
        <td><code>${q.target_value}</code></td>
        <td style="text-align:center;">
          <div style="font-weight:600; font-size:0.8rem;">${q.current_count || 0} / ${q.target_count} (${pct}%)</div>
          <div class="quota-track" style="margin-top:2px;">
            <div class="quota-bar ${q.status === 'locked' ? 'bar-locked' : 'bar-open'}" style="width:${pct}%;"></div>
          </div>
        </td>
        <td style="text-align:center;"><span class="${badgeClass}">${statusLabel}</span></td>
        <td style="text-align:center;">
          <button type="button" class="btn btn-xs btn-outline" style="color:var(--danger); border-color:var(--danger);" onclick="removeQuotaFromStudio(${idx})">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.saveQuotasFromStudio = async function() {
  const formId = state.activeProjectFormId;
  if (!formId) return;

  try {
    await apiFetch(`/api/forms/${formId}/quotas`, {
      method: 'POST',
      body: JSON.stringify({ quotas: studioQuotas })
    });

    showToast('success', 'Cotas amostrais salvas e aplicadas com sucesso!');
    window.closeQuotaStudioModal();
    await window.renderQuotasProgress(formId);
  } catch (err) {
    showToast('error', 'Falha ao salvar cotas: ' + err.message);
  }
};

window.renderQuotasProgress = async function(formId) {
  const container = document.getElementById('quota-progress-container');
  const card = document.getElementById('quota-progress-card');
  if (!container || !card) return;

  try {
    const res = await apiFetch(`/api/forms/${formId}/quotas`);
    if (!res.quotas || res.quotas.length === 0) {
      container.innerHTML = '<p class="text-muted" style="text-align:center; padding:1rem;">Nenhuma cota cadastrada. Clique em "Gerenciar Cotas" para definir metas de representatividade.</p>';
      return;
    }

    card.style.display = 'block';
    container.innerHTML = res.quotas.map(q => {
      const pct = q.percent || 0;
      const barClass = q.status === 'locked' ? 'bar-locked' : (q.status === 'near_limit' ? 'bar-near' : 'bar-open');
      const badgeClass = q.status === 'locked' ? 'badge-quota-locked' : (q.status === 'near_limit' ? 'badge-quota-near' : 'badge-quota-open');
      const statusText = q.status === 'locked' ? '🔒 COTA ENCERRADA (100%)' : (q.status === 'near_limit' ? '⚠️ QUASE ESGOTADA' : '🟢 ABERTA');

      return `
        <div class="quota-card-item">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
            <div>
              <strong style="color:var(--text-primary); font-size:0.9rem;">${q.question_text || q.question_id}:</strong>
              <span style="color:var(--primary); font-weight:700; margin-left:4px;">${q.target_value}</span>
            </div>
            <span class="${badgeClass}">${statusText}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-muted); margin-top:4px;">
            <span>Coletado: <b>${q.current_count}</b> de ${q.target_count} entrevistas</span>
            <span><b>${pct}%</b> concluído (Restam: ${q.remaining})</span>
          </div>
          <div class="quota-track">
            <div class="quota-bar ${barClass}" style="width:${pct}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.warn('Erro ao renderizar progresso de cotas:', err);
  }
};

// --- 2. CODEBOOK, SPSS & R EXPORTS ---
window.openCodebookWindow = function() {
  const formId = state.activeProjectFormId;
  if (!formId) return showToast('warning', 'Selecione um projeto primeiro.');
  window.open(`/api/export/${formId}/codebook?format=html`, '_blank');
};

window.downloadSpssSyntax = function() {
  const formId = state.activeProjectFormId;
  if (!formId) return showToast('warning', 'Selecione um projeto primeiro.');
  window.location.href = `/api/export/${formId}/spss-syntax`;
  showToast('info', 'Download da sintaxe IBM SPSS (.sps) iniciado.');
};

window.downloadRScript = function() {
  const formId = state.activeProjectFormId;
  if (!formId) return showToast('warning', 'Selecione um projeto primeiro.');
  window.location.href = `/api/export/${formId}/r-script`;
  showToast('info', 'Download do script de análise R (.R) iniciado.');
};

// --- 3. FORENSIC AUDIO SUPERVISION WORKFLOW ---
let currentAuditingInterviewId = null;

window.openAudioModal = function(url, interviewId, auditStatus) {
  const modal = document.getElementById('audio-modal');
  const player = document.getElementById('audio-player-element');
  currentAuditingInterviewId = interviewId || null;

  if (modal && player) {
    player.src = url;
    player.playbackRate = 1.0;
    
    document.querySelectorAll('.audio-speed-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.audio-speed-btn[onclick*="1.0"]')?.classList.add('active');

    const invSpan = document.getElementById('audio-modal-inv-id');
    if (invSpan) invSpan.textContent = interviewId || 'Amostra Direta';

    const statusBadge = document.getElementById('audio-modal-status-badge');
    if (statusBadge) {
      const st = auditStatus || 'pending';
      statusBadge.textContent = st === 'approved' ? 'Aprovada' : (st === 'rejected' ? 'Rejeitada' : 'Pendente');
      statusBadge.style.background = st === 'approved' ? 'rgba(16,185,129,0.2)' : (st === 'rejected' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)');
      statusBadge.style.color = st === 'approved' ? '#10b981' : (st === 'rejected' ? '#ef4444' : '#fff');
    }

    modal.classList.add('active');
    player.play().catch(e => console.log('Auto-play blocked:', e));
  }
};

window.setAudioPlaybackSpeed = function(speed) {
  const player = document.getElementById('audio-player-element');
  if (player) player.playbackRate = speed;

  document.querySelectorAll('.audio-speed-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.includes(speed.toFixed(speed % 1 === 0 ? 1 : 2) + 'x') || btn.textContent.includes(speed + 'x'));
  });
};

window.submitAudioAuditReview = async function(status) {
  if (!currentAuditingInterviewId) {
    showToast('warning', 'Nenhuma entrevista identificada para auditoria.');
    return;
  }

  try {
    await apiFetch(`/api/interviews/${currentAuditingInterviewId}/audit-review`, {
      method: 'POST',
      body: JSON.stringify({ status, notes: `Auditoria pericial de áudio realizada pelo supervisor em ${new Date().toLocaleString('pt-BR')}` })
    });

    showToast(status === 'approved' ? 'success' : 'warning', `Entrevista [${currentAuditingInterviewId}] marcada como: ${status.toUpperCase()}!`);
    window.closeAudioModal();

    if (state.activeProjectFormId) {
      await window.renderQuotasProgress(state.activeProjectFormId);
    }
    await loadInterviews();
  } catch (err) {
    showToast('error', 'Falha ao gravar parecer: ' + err.message);
  }
};

// --- 4. FIELD TEAM SUBNAV & LEADERBOARD ---
window.switchTeamSubTab = function(subtab) {
  const usersTab = document.getElementById('team-subtab-users');
  const lbTab = document.getElementById('team-subtab-leaderboard');
  const btnUsers = document.getElementById('btn-subnav-team-users');
  const btnLb = document.getElementById('btn-subnav-team-leaderboard');

  if (subtab === 'users') {
    if (usersTab) usersTab.style.display = 'block';
    if (lbTab) lbTab.style.display = 'none';
    btnUsers?.classList.add('active');
    btnLb?.classList.remove('active');
  } else {
    if (usersTab) usersTab.style.display = 'none';
    if (lbTab) lbTab.style.display = 'block';
    btnLb?.classList.add('active');
    btnUsers?.classList.remove('active');
    loadTeamProductivityLeaderboard();
  }
};

window.loadTeamProductivityLeaderboard = async function() {
  try {
    const res = await apiFetch('/api/analytics/team-productivity');
    if (!res) return;
    const researchers = res.researchers || (Array.isArray(res) ? res : []);
    const activeToday = researchers.filter(r => r.is_active_today).length;
    const totalCollected = researchers.reduce((acc, r) => acc + r.total_interviews, 0);
    const avgApproval = researchers.length > 0
      ? Math.round(researchers.reduce((acc, r) => acc + r.approval_rate, 0) / researchers.length)
      : 100;

    const kpiActive = document.getElementById('kpi-team-active-today');
    const kpiTotal = document.getElementById('kpi-team-total-collected');
    const kpiRate = document.getElementById('kpi-team-approval-rate');

    if (kpiActive) kpiActive.textContent = activeToday;
    if (kpiTotal) kpiTotal.textContent = totalCollected;
    if (kpiRate) kpiRate.textContent = `${avgApproval}%`;

    const tbody = document.getElementById('team-leaderboard-tbody');
    if (!tbody) return;

    if (researchers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">Nenhum pesquisador registrado na equipe de campo.</td></tr>';
      return;
    }

    tbody.innerHTML = researchers.map((r, i) => {
      let medalClass = 'rank-normal';
      if (i === 0 && r.total_interviews > 0) medalClass = 'rank-gold';
      else if (i === 1 && r.total_interviews > 0) medalClass = 'rank-silver';
      else if (i === 2 && r.total_interviews > 0) medalClass = 'rank-bronze';

      const statusBadge = r.is_active_today
        ? '<span class="badge" style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:700;"><i class="fa-solid fa-circle" style="font-size:0.5rem; margin-right:4px;"></i> Coletando Hoje</span>'
        : '<span class="badge" style="background:rgba(148,163,184,0.1); color:#94a3b8;">Inativo</span>';

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center;">
              <span class="interviewer-rank-badge ${medalClass}">${i + 1}</span>
              <div>
                <strong style="color:var(--text-primary); font-size:0.9rem;">${r.name}</strong>
                <div style="font-size:0.75rem; color:var(--text-muted);">${r.email}</div>
              </div>
            </div>
          </td>
          <td style="text-align:center;"><b style="color:var(--primary);">${r.today_interviews}</b></td>
          <td style="text-align:center; font-weight:700; color:var(--text-primary); font-size:1rem;">${r.total_interviews}</td>
          <td style="text-align:center; color:#10b981; font-weight:600;">${r.approved_interviews}</td>
          <td style="text-align:center; color:#ef4444; font-weight:600;">${r.rejected_interviews}</td>
          <td style="text-align:center; color:#f59e0b; font-weight:600;">${r.pending_interviews}</td>
          <td style="text-align:center;">
            <span class="badge" style="background:rgba(56,189,248,0.1); color:var(--primary); font-weight:700;">${r.approval_rate}%</span>
          </td>
          <td style="text-align:center;">${statusBadge}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.warn('Erro ao carregar leaderboard de equipe:', err);
  }
};

// --- 5. GEOSPATIAL & CLUSTERING MAP METRICS ---
window.loadGeospatialMetrics = async function(formId) {
  if (!formId) return;

  try {
    const res = await apiFetch(`/api/analytics/geospatial/${formId}`);
    if (!res) return;

    const elTotal = document.getElementById('geo-total-points');
    const elDisp = document.getElementById('geo-dispersion-radius');
    const elArea = document.getElementById('geo-coverage-area');
    const elBadge = document.getElementById('geo-quality-badge');
    const alertBox = document.getElementById('spatial-cluster-alert');
    const alertDesc = document.getElementById('spatial-cluster-desc');

    if (elTotal) elTotal.textContent = res.total_points || 0;
    if (elDisp) elDisp.textContent = `${res.dispersion_radius_km || 0} km`;
    if (elArea) elArea.textContent = `${res.coverage_area_km2 || 0} km²`;

    if (elBadge) {
      let badgeHtml = '<span class="badge" style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:700;">🟢 Dispersão Normal</span>';
      if (res.dispersion_quality === 'AGRUPAMENTO_EXCESSIVO') {
        badgeHtml = '<span class="badge" style="background:rgba(239,68,68,0.15); color:#ef4444; font-weight:700;">🚨 Agrupamento Suspeito</span>';
      } else if (res.dispersion_quality === 'NO_GPS') {
        badgeHtml = '<span class="badge" style="background:rgba(245,158,11,0.15); color:#f59e0b;">Sem GPS Suficiente</span>';
      }
      elBadge.innerHTML = badgeHtml;
    }

    if (alertBox) {
      if (res.clusters_detected && res.clusters_detected.length > 0) {
        alertBox.style.display = 'block';
        if (alertDesc) {
          alertDesc.textContent = `${res.clusters_detected.length} agrupamento(s) suspeito(s) identificado(s): ${res.clusters_detected[0].description}`;
        }
      } else {
        alertBox.style.display = 'none';
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar métricas geoespaciais:', err);
  }
};

// =========================================================================
// ODK XML VIEWER, GROUP BUILDER & HELPER EXTENSIONS
// =========================================================================

window.openXmlViewer = function() {
  const form = state.activeForm;
  if (!form || !form.id) {
    return showToast('warning', 'Selecione ou crie um formulário primeiro para visualizar o XML.');
  }

  let xmlModal = document.getElementById('xml-viewer-modal');
  if (!xmlModal) {
    xmlModal = document.createElement('div');
    xmlModal.className = 'modal-overlay';
    xmlModal.id = 'xml-viewer-modal';
    xmlModal.innerHTML = `
      <div class="modal-box" style="max-width: 650px; width: 90%;">
        <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span><i class="fa-solid fa-code" style="color:var(--primary); margin-right:8px;"></i> Código Fonte OpenRosa / XForm XML</span>
          <button class="btn-icon" onclick="document.getElementById('xml-viewer-modal').classList.remove('active')">&times;</button>
        </div>
        <p style="font-size:0.8rem; color:var(--text-muted); margin:0.5rem 0 1rem 0;">
          Estrutura XML em padrão OpenRosa 1.0 para compatibilidade nativa com ODK Collect, KoboCollect e Enketo.
        </p>
        <pre id="xml-viewer-code" style="background:#040711; color:#38bdf8; padding:1rem; border-radius:8px; border:1px solid var(--glass-border); max-height:360px; overflow:auto; font-size:0.78rem; font-family:var(--font-mono); user-select:all;"></pre>
        <div class="modal-actions" style="margin-top:1rem; display:flex; justify-content:space-between; align-items:center;">
          <button class="btn btn-outline btn-sm" onclick="copyXmlCode()"><i class="fa-solid fa-copy"></i> Copiar XML</button>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('xml-viewer-modal').classList.remove('active')">Fechar</button>
        </div>
      </div>
    `;
    document.body.appendChild(xmlModal);
  }

  const formId = form.id || 'form_survey';
  const title = form.title || 'Pesquisa GuiaData';
  const questions = form.questions || [];
  
  let binds = '';
  let body = '';
  questions.forEach(q => {
    binds += `      <bind nodeset="/data/${q.id}" type="${q.type === 'number' || q.type === 'integer' ? 'int' : 'string'}" ${q.required ? 'required="yes()"' : ''} />\n`;
    if (q.type === 'single_choice' || q.type === 'select_one') {
      body += `    <select1 ref="/data/${q.id}">\n      <label>${q.title || q.text || q.id}</label>\n`;
      (q.options || []).forEach((opt, idx) => {
        const val = typeof opt === 'object' ? (opt.label || opt.name) : opt;
        body += `      <item><label>${val}</label><value>opt_${idx + 1}</value></item>\n`;
      });
      body += `    </select1>\n`;
    } else {
      body += `    <input ref="/data/${q.id}">\n      <label>${q.title || q.text || q.id}</label>\n    </input>\n`;
    }
  });

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<h:html xmlns="http://www.w3.org/2002/xforms"
        xmlns:h="http://www.w3.org/1999/xhtml"
        xmlns:ev="http://www.w3.org/2001/xml-events"
        xmlns:xsd="http://www.w3.org/2001/XMLSchema"
        xmlns:jr="http://openrosa.org/javarosa">
  <h:head>
    <h:title>${title}</h:title>
    <model>
      <instance>
        <data id="${formId}" version="${form.version || 1}">
${questions.map(q => `          <${q.id} />`).join('\n')}
        </data>
      </instance>
${binds}    </model>
  </h:head>
  <h:body>
${body}  </h:body>
</h:html>`;

  document.getElementById('xml-viewer-code').textContent = xmlContent;
  xmlModal.classList.add('active');
};

window.copyXmlCode = function() {
  const code = document.getElementById('xml-viewer-code')?.textContent || '';
  navigator.clipboard.writeText(code).then(() => {
    showToast('success', 'Código XML OpenRosa copiado para a área de transferência!');
  }).catch(() => {
    showToast('info', 'Selecione e copie o texto manualmente.');
  });
};

window.testOdkConnection = async function() {
  const resultEl = document.getElementById('odk-test-result');
  if (resultEl) resultEl.innerHTML = '<span style="color:var(--primary);"><i class="fa-solid fa-spinner fa-spin"></i> Testando servidor ODK...</span>';
  try {
    const res = await fetch('/formList');
    if (res.ok) {
      if (resultEl) {
        resultEl.innerHTML = '<span style="color:#10b981; font-weight:700;"><i class="fa-solid fa-circle-check"></i> Servidor Ativo (OpenRosa 200 OK)</span>';
      }
      showToast('success', 'Servidor ODK Collect operacional e respondendo perfeitamente!');
    } else {
      throw new Error(`Status HTTP ${res.status}`);
    }
  } catch (err) {
    if (resultEl) {
      resultEl.innerHTML = `<span style="color:#ef4444;"><i class="fa-solid fa-circle-xmark"></i> Erro: ${err.message}</span>`;
    }
    showToast('error', 'Falha ao conectar no servidor ODK: ' + err.message);
  }
};

window.openGroupModal = function() {
  document.getElementById('question-type-modal')?.classList.remove('active');
  const modal = document.getElementById('group-modal');
  if (modal) {
    const nameInput = document.getElementById('group-modal-name');
    if (nameInput) nameInput.value = '';
    modal.classList.add('active');
  }
};

window.confirmCreateGroup = function() {
  const name = document.getElementById('group-modal-name')?.value.trim();
  const type = document.getElementById('group-modal-type')?.value || 'group';
  if (!name) return showToast('warning', 'Informe o nome da seção.');
  
  const qId = 'sec_' + (state.activeForm.questions.length + 1);
  const newQ = {
    id: qId,
    title: name,
    text: name,
    type: type,
    options: [],
    required: false
  };
  state.activeForm.questions.push(newQ);
  renderBuilderQuestions();
  document.getElementById('group-modal')?.classList.remove('active');
  showToast('success', `Seção "${name}" criada com sucesso!`);
};

window.loadInterviews = async function() {
  await loadServerData();
};

window.showConfirmModal = showConfirm;



