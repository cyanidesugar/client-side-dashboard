# CLAUDE.md — Client Side Dashboard

## What this is

A public-facing order tracking page for customers of Cyanide Sugar 3D Prints. Customers receive a link and can view their print status, progress photos, and optionally a live camera feed.

Fully integrated with the **Projects Dashboard** (sibling folder `../Projects Dashboard/`), which shares the same Supabase backend.

## Current deployment status (as of 2026-05-14)

| Thing | URL / value |
|---|---|
| Tracking page | `https://client-side-dashboard.pages.dev` (live) |
| Custom domain | `track.cyanidesugar3dprints.com` — add in CF Pages dashboard, DNS auto-configured |
| Worker API | `https://client-tracking-api.esther-4f3.workers.dev` |
| GitHub repo | `https://github.com/cyanidesugar/client-side-dashboard` |
| CF Pages project | `client-side-dashboard` |
| Worker name | `client-tracking-api` |

## File structure

```
Client Side Dashboard/
├── index.html          # Public tracking page — vanilla HTML/JS, no build step
├── schema.sql          # Already run in Supabase — keep for reference
├── worker/
│   ├── wrangler.toml   # Cloudflare Worker config
│   └── index.js        # Worker API — secure proxy to Supabase
└── CLAUDE.md
```

## Architecture

**Customer flow:**
1. Admin enables tracking on a project in Projects Dashboard, sets units/note/photos
2. Admin copies the tracking link (`https://track.cyanidesugar3dprints.com/?id=<project-uuid>`)
3. Customer opens link → page auto-fetches from Worker API
4. Worker queries Supabase with service key, returns only safe fields
5. Page renders: status badge, progress bar, public note, photos, optional camera feed

**Why a Worker proxy?** The Supabase anon key is open RLS — anyone who found it could read all clients/projects/invoices. The Worker uses the service key (never in source code) and returns only the specific allowed fields for one project.

## Supabase project

Project ref: `tirbstkacpcjzebjbesb`  
URL: `https://tirbstkacpcjzebjbesb.supabase.co`

### Schema (already applied — run schema.sql again only if setting up fresh)

New columns added to `projects` table:
- `total_units integer`
- `completed_units integer DEFAULT 0`
- `public_note text`
- `tracking_enabled boolean DEFAULT false`
- `assigned_camera_url text`

New table `project_photos`:
- `id uuid PK`
- `project_id uuid FK → projects(id) ON DELETE CASCADE`
- `url text` — Supabase Storage public URL
- `caption text`
- `uploaded_at timestamptz`
- Open RLS policy

Storage bucket: `project-photos` — already created, set to public.  
Storage RLS policy already applied (allows all operations on `project-photos` bucket).

## Cloudflare Worker

**Name:** `client-tracking-api`  
**Live URL:** `https://client-tracking-api.esther-4f3.workers.dev`  
**Endpoint:** `GET /api/track?id=<uuid>` → JSON or 404  
**CORS allowed origins:** `track.cyanidesugar3dprints.com`, `client-side-dashboard.pages.dev`, localhost ports 3000 and 5500

**Secrets already set in Cloudflare:**
- `SUPABASE_URL` = `https://tirbstkacpcjzebjbesb.supabase.co`
- `SUPABASE_SERVICE_KEY` = the `sb_secret_...` key from Supabase → Settings → API → Secret key

**To redeploy worker after changes:**
```bash
cd "E:/3D Stuff/01 Coding STuff/Client Side Dashboard/worker"
CLOUDFLARE_API_TOKEN=<token> npx wrangler deploy
```

Get a Cloudflare API token from: dash.cloudflare.com → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template → All accounts, All zones.

**To update secrets:**
```bash
echo "new-value" | CLOUDFLARE_API_TOKEN=<token> npx wrangler secret put SUPABASE_SERVICE_KEY
```

Note: Supabase's service key format is `sb_secret_...` (not a JWT). This is their newer key format — it works the same way in the `apikey` and `Authorization` headers.

## Tracking page deployment

**GitHub repo:** `cyanidesugar/client-side-dashboard`  
**CF Pages project:** `client-side-dashboard` (direct upload — not yet connected to GitHub for auto-deploy)

**To redeploy after changes to index.html:**
```bash
cd "E:/3D Stuff/01 Coding STuff/Client Side Dashboard"
CLOUDFLARE_API_TOKEN=<token> npx wrangler pages deploy . --project-name client-side-dashboard --commit-dirty=true
git add . && git commit -m "..." && git push
```

**To connect GitHub for auto-deploy** (optional, not done yet):  
CF dashboard → Pages → `client-side-dashboard` → Settings → Build & deployments → Connect to Git → `cyanidesugar/client-side-dashboard`

**To add custom domain** (still pending):  
CF dashboard → Pages → `client-side-dashboard` → Custom domains → `track.cyanidesugar3dprints.com`  
DNS will be auto-configured since `cyanidesugar3dprints.com` is on Cloudflare.

## Worker URL constant

Currently set in `index.html`:
```js
const WORKER_URL = 'https://client-tracking-api.esther-4f3.workers.dev';
```

If a custom domain is added to the worker, update this and redeploy the page.

## Admin side (Projects Dashboard)

Each project detail page has a "Client Tracking" card. Admin can:
- Enable/disable tracking toggle
- Set total units and completed units
- Write a public note visible to the customer
- Assign a camera HLS URL (future)
- Upload/delete progress photos (Supabase Storage `project-photos`)
- Copy the tracking link

New functions in Projects Dashboard `index.html`:
- `fTracking(projectId)` — edit modal for tracking settings
- `uploadPhoto(projectId, input)` — uploads file to Supabase Storage, inserts into `project_photos`
- `delPhoto(photoId, projectId)` — deletes from `project_photos` and Storage

## Camera integration (future — not yet built)

When a TAPO printer camera is assigned to a project:

1. Run FFmpeg on local machine to transcode RTSP → HLS:
   ```bash
   ffmpeg -i "rtsp://admin:<password>@<camera-ip>:554/stream1" \
     -c:v copy -f hls -hls_time 2 -hls_list_size 5 \
     -hls_flags delete_segments /tmp/hls/printer1/stream.m3u8
   ```

2. Serve HLS segments locally (e.g. `npx serve /tmp/hls`)

3. Expose via Cloudflare Tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

4. Paste the resulting HTTPS URL + `/printer1/stream.m3u8` into the camera field on the project in Projects Dashboard.

5. Tracking page loads it via HLS.js automatically. Falls back gracefully if stream is offline.

## Key patterns

- No framework, no build step — vanilla HTML/JS
- Worker validates UUID format before querying Supabase
- `tracking_enabled = false` → Worker returns 404 (disables link without deleting data)
- Photo URLs validated as http/https before rendering (XSS protection)
- Camera URL validated as http/https before passing to HLS.js
