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
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://track.cyanidesugar.com';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const { pathname, searchParams } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'GET' || pathname !== '/api/track') {
      return json({ error: 'Not found' }, 404, origin);
    }

    const id = searchParams.get('id') || '';
    if (!UUID_RE.test(id)) {
      return json({ error: 'Invalid order ID' }, 400, origin);
    }

    let project, photos;
    try {
      const projects = await supabaseFetch(
        env,
        'projects',
        `?id=eq.${id}&tracking_enabled=eq.true&select=title,status,total_units,completed_units,public_note,assigned_camera_url&limit=1`
      );
      if (!projects.length) return json({ error: 'Order not found' }, 404, origin);
      project = projects[0];

      photos = await supabaseFetch(
        env,
        'project_photos',
        `?project_id=eq.${id}&select=id,url,caption,uploaded_at&order=uploaded_at.asc`
      );
    } catch (e) {
      console.error('Tracking API error:', e);
      return json({ error: 'Service unavailable' }, 503, origin);
    }

    return json({ ...project, photos: photos || [] }, 200, origin);
  },
};
