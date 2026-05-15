const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_ORIGINS = new Set([
  'https://track.cyanidesugar3dprints.com',
  'https://client-side-dashboard.pages.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://track.cyanidesugar3dprints.com';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200, origin = '') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

async function supabaseFetch(env, path, params = '') {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}${params}`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase error ${res.status}`);
  return res.json();
}

async function supabasePatch(env, path, params, body) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}${params}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase patch error ${res.status}`);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const { pathname, searchParams } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // ── GET /api/track?id=<uuid> ─────────────────────────────────────────────
    if (request.method === 'GET' && pathname === '/api/track') {
      const id = searchParams.get('id') || '';
      if (!UUID_RE.test(id)) return json({ error: 'Invalid order ID' }, 400, origin);

      let project, photos, invoices, updates, approval;
      try {
        const projects = await supabaseFetch(
          env, 'projects',
          `?id=eq.${id}&tracking_enabled=eq.true&select=title,status,total_units,completed_units,public_note,assigned_camera_url,estimated_completion,delivery_status,tracking_number&limit=1`
        );
        if (!projects.length) return json({ error: 'Order not found' }, 404, origin);
        project = projects[0];

        [photos, invoices, updates, approval] = await Promise.all([
          supabaseFetch(env, 'project_photos', `?project_id=eq.${id}&select=id,url,caption,uploaded_at&order=uploaded_at.asc`),
          supabaseFetch(env, 'invoices', `?project_id=eq.${id}&select=invoice_number,status,amount,issue_date,due_date,paid_date&order=issue_date.asc`),
          supabaseFetch(env, 'project_updates', `?project_id=eq.${id}&select=id,message,created_at&order=created_at.desc`),
          supabaseFetch(env, 'project_approvals', `?project_id=eq.${id}&select=id,file_url,file_caption,approval_status,approval_note,approved_at,created_at&order=created_at.desc&limit=1`),
        ]);
      } catch (e) {
        console.error('Tracking API error:', e);
        return json({ error: 'Service unavailable' }, 503, origin);
      }

      return json({
        ...project,
        photos:   photos   || [],
        invoices: invoices || [],
        updates:  updates  || [],
        approval: (approval && approval.length) ? approval[0] : null,
      }, 200, origin);
    }

    // ── POST /api/approve?id=<project_uuid> ──────────────────────────────────
    if (request.method === 'POST' && pathname === '/api/approve') {
      const id = searchParams.get('id') || '';
      if (!UUID_RE.test(id)) return json({ error: 'Invalid order ID' }, 400, origin);

      let body;
      try { body = await request.json(); } catch { return json({ error: 'Invalid body' }, 400, origin); }

      const { approval_id, status, note } = body || {};
      if (!UUID_RE.test(approval_id || '')) return json({ error: 'Invalid approval ID' }, 400, origin);
      if (!['approved', 'changes_requested'].includes(status)) return json({ error: 'Invalid status' }, 400, origin);

      try {
        // Verify the project exists and tracking is enabled
        const projects = await supabaseFetch(env, 'projects', `?id=eq.${id}&tracking_enabled=eq.true&select=id&limit=1`);
        if (!projects.length) return json({ error: 'Order not found' }, 404, origin);

        await supabasePatch(env, 'project_approvals', `?id=eq.${approval_id}&project_id=eq.${id}`, {
          approval_status: status,
          approval_note: note || null,
          approved_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error('Approve error:', e);
        return json({ error: 'Service unavailable' }, 503, origin);
      }

      return json({ ok: true }, 200, origin);
    }

    return json({ error: 'Not found' }, 404, origin);
  },
};
