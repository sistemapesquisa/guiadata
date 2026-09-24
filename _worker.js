/**
 * GuiaData — Cloudflare Pages Fullstack Worker
 * REST API + OpenRosa Protocol (/formList, /submission) + Cloudflare D1 + Google Drive
 * Pasta Google Drive Vinculada: 1IH2cWAAtNLuUfzeaVpDmv4pn6p3AQozQ
 * Conta Vinculada: sistemagithub@gmail.com
 */

const GOOGLE_DRIVE_FOLDER_ID = "1IH2cWAAtNLuUfzeaVpDmv4pn6p3AQozQ";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS Preflight
    if (request.method === 'OPTIONS') {
      return handleCors();
    }

    try {
      // 1. OPENROSA PROTOCOL (ODK Collect Mobile)
      if (path === '/formList' || path === '/api/formList' || path === '/odk/formList') {
        return await handleOpenRosaFormList(request, env, url);
      }

      if (path.startsWith('/api/odk/forms/')) {
        const formId = path.split('/').pop();
        return await handleOpenRosaFormDownload(formId, env);
      }

      if (path === '/submission' || path === '/api/submission' || path === '/odk/submission') {
        if (request.method === 'HEAD') {
          return new Response(null, {
            status: 204,
            headers: {
              'X-OpenRosa-Version': '1.0',
              'X-OpenRosa-Accept-Content-Length': '104857600'
            }
          });
        }
        if (request.method === 'POST') {
          return await handleOpenRosaSubmission(request, env);
        }
      }

      // 2. API REST: PROJETOS
      if (path === '/api/projects') {
        if (request.method === 'GET') {
          if (!env.DB) return jsonResponse(getMockProjects());
          const { results } = await env.DB.prepare(
            `SELECT p.*, 
                    (SELECT COUNT(*) FROM submissions s WHERE s.project_id = p.id) as total_coletas,
                    (SELECT COUNT(*) FROM forms f WHERE f.project_id = p.id) as total_formularios
             FROM projects p ORDER BY p.updated_at DESC`
          ).all();
          return jsonResponse(results);
        }
        if (request.method === 'POST') {
          const body = await request.json();
          const id = 'proj_' + crypto.randomUUID().substring(0, 8);
          if (env.DB) {
            await env.DB.prepare(
              `INSERT INTO projects (id, name, description, client_name, sample_size, status) 
               VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(id, body.name, body.description || '', body.client_name || '', body.sample_size || 0, 'planejamento').run();
          }
          return jsonResponse({ success: true, id }, 201);
        }
      }

      // Detalhes do Projeto
      if (path.startsWith('/api/projects/') && path.split('/').length === 4) {
        const projectId = path.split('/')[3];
        if (!env.DB) return jsonResponse({ id: projectId, name: 'Projeto GuiaData' });
        const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first();
        if (!project) return jsonResponse({ error: 'Projeto não encontrado' }, 404);
        return jsonResponse(project);
      }

      // 3. API REST: COLETAS / SUBMISSÕES DO PROJETO
      if (path.startsWith('/api/projects/') && path.endsWith('/submissions')) {
        const parts = path.split('/');
        const projectId = parts[3];
        if (!env.DB) return jsonResponse([]);
        const { results } = await env.DB.prepare(
          `SELECT s.*, u.name as researcher_name, f.title as form_title
           FROM submissions s
           LEFT JOIN users u ON s.researcher_id = u.id
           LEFT JOIN forms f ON s.form_id = f.id
           WHERE s.project_id = ? ORDER BY s.submitted_at DESC LIMIT 500`
        ).bind(projectId).all();
        return jsonResponse(results);
      }

      // 4. API REST: STATUS DA NUVEM & GOOGLE DRIVE
      if (path === '/api/cloud/status') {
        return jsonResponse({
          system: 'GuiaData 3.5 Cloud',
          status: 'online',
          edge: 'Cloudflare Pages / Workers',
          database: env.DB ? 'Cloudflare D1 (Conectado)' : 'Mock Mode (Configure o D1)',
          gdrive: {
            folder_id: env.GOOGLE_DRIVE_FOLDER_ID || GOOGLE_DRIVE_FOLDER_ID,
            account: 'sistemagithub@gmail.com',
            status: 'Ativo'
          },
          timestamp: new Date().toISOString()
        });
      }

      // 5. STATIC ASSETS FALLBACK (Cloudflare Pages serve o Frontend HTML/CSS/JS)
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }

      return jsonResponse({ error: 'Endpoint não encontrado no GuiaData' }, 404);

    } catch (err) {
      return jsonResponse({ error: err.message, stack: err.stack }, 500);
    }
  }
};

async function handleOpenRosaFormList(request, env, url) {
  let forms = [];
  if (env.DB) {
    const { results } = await env.DB.prepare(
      `SELECT id, title, version FROM forms WHERE status = 'publicado' ORDER BY title ASC`
    ).all();
    forms = results;
  } else {
    forms = [{ id: 'form_eleicao_2026', title: 'Pesquisa Eleitoral GuiaData 2026', version: '1.0' }];
  }

  const baseUrl = `${url.protocol}//${url.host}`;
  let xml = `<?xml version='1.0' encoding='UTF-8' ?>\n<xforms xmlns="http://openrosa.org/xforms/xformsList">\n`;
  for (const form of forms) {
    xml += `  <xform>\n    <formID>${escapeXml(form.id)}</formID>\n    <name>${escapeXml(form.title)}</name>\n    <version>${form.version}</version>\n    <downloadUrl>${baseUrl}/api/odk/forms/${form.id}</downloadUrl>\n  </xform>\n`;
  }
  xml += `</xforms>`;

  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'X-OpenRosa-Version': '1.0' }
  });
}

async function handleOpenRosaFormDownload(formId, env) {
  let xml = null;
  if (env.DB) {
    const form = await env.DB.prepare('SELECT xform_xml FROM forms WHERE id = ?').bind(formId).first();
    if (form) xml = form.xform_xml;
  }
  if (!xml) {
    xml = `<?xml version="1.0"?>\n<h:html xmlns="http://www.w3.org/2002/xforms"><h:head><h:title>GuiaData Form</h:title></h:head><h:body/></h:html>`;
  }
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'X-OpenRosa-Version': '1.0' }
  });
}

async function handleOpenRosaSubmission(request, env) {
  const formData = await request.formData();
  const xmlFile = formData.get('xml_submission_file');
  const xmlText = xmlFile ? await xmlFile.text() : '';
  const submissionId = 'sub_' + crypto.randomUUID().substring(0, 10);

  if (env.DB) {
    await env.DB.prepare(
      `INSERT INTO submissions (id, project_id, form_id, form_version, researcher_id, data_json, status)
       VALUES (?, 'proj_default', 'form_default', 1, 'pesquisador_app', ?, 'aprovado')`
    ).bind(submissionId, JSON.stringify({ rawXml: xmlText })).run();
  }

  const responseXml = `<?xml version='1.0' encoding='UTF-8' ?>\n<OpenRosaResponse xmlns="http://openrosa.org/OpenRosaResponse">\n    <message nature="submit_success">Coleta registrada no GuiaData com sucesso!</message>\n</OpenRosaResponse>`;
  return new Response(responseXml, {
    status: 201,
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'X-OpenRosa-Version': '1.0' }
  });
}

function handleCors() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-OpenRosa-Version'
    }
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
  });
}

function escapeXml(str) {
  return (str || '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function getMockProjects() {
  return [
    {
      id: "proj_eleicao_2026",
      name: "Pesquisa Eleitoral Majoritária 2026",
      description: "Levantamento de intenção de voto municipal e estadual.",
      client_name: "Instituto Opinião & Análise",
      sample_size: 1500,
      total_coletas: 840,
      status: "em_coleta"
    },
    {
      id: "proj_consumo_varejo",
      name: "Índice de Confiança do Consumidor e Varejo",
      description: "Pesquisa de hábitos de compra e satisfação do comércio.",
      client_name: "Associação Comercial",
      sample_size: 600,
      total_coletas: 600,
      status: "concluido"
    }
  ];
}
