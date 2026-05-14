# CLAUDE.md — Client Side Dashboard

## What this is

A public-facing order tracking page for customers of Cyanide Sugar 3D Prints. Customers receive a link containing their project UUID and can view print status, progress photos, and optionally a live camera feed of their print in progress.

Fully integrated with the **Projects Dashboard** (sibling folder `../Projects Dashboard/`), which shares the same Supabase backend.

## File structure

```
Client Side Dashboard/
├── index.html          # Public tracking page — open directly in browser, no build step
├── schema.sql          # Run once in Supabase SQL Editor to add new columns/tables
├── worker/
│   ├── wrangler.toml   # Cloudflare Worker config
│   └── index.js        # Worker API — secure proxy between public page and Supabase
└── CLAUDE.md
```

## Architecture

**Customer flow:**
1. Admin enables tracking on a project in the Projects Dashboard, sets units/note/photos
2. Admin copies the tracking link (`https://track.cyanidesugar.com/?id=<project-uuid>`)
3. Customer clicks link → tracking page loads → calls Cloudflare Worker API
4. Worker queries Supabase using service key, returns only safe fields
5. Page renders status, progress, photos, optional camera feed

**Why a Worker proxy?** The Supabase anon key would expose all project/client data to anyone who inspected network requests. The Worker uses the service key (stored as a secret, never in source) and returns only the specific allowed fields for a single project.

## Supabase project

Project ref: `tirbstkacpcjzebjbesb`
URL: `https://tirbstkacpcjzebjbesb.supabase.co`

### Schema additions (run schema.sql once)

New columns on `projects` table:
- `total_units integer` — total print units in this order
- `completed_units integer DEFAULT 0` — units finished so far
- `public_note text` — message shown to customer (e.g. "Printing starts Monday")
- `tracking_enabled boolean DEFAULT false` — must be true for link to work
- `assigned_camera_url text` — HLS stream URL for live camera feed (optional)

New table `project_photos`:
- `id uuid PK`
- `project_id uuid FK → projects(id) ON DELETE CASCADE`
- `url text` — Supabase Storage public URL
- `caption text`
- `uploaded_at timestamptz`

Storage bucket: `project-photos` (public read) — created manually in Supabase dashboard.

## Cloudflare Worker

**Name:** `client-tracking-api`
**Endpoint:** `GET /api/track?id=<uuid>` → returns JSON or 404
**CORS:** allows `track.cyanidesugar.com` and localhost for dev

Secrets (set via `wrangler secret put`):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` — service role key from Supabase dashboard → Settings → API

Deploy:
```bash
export PATH="$HOME/bin:$PATH"
export SUPABASE_ACCESS_TOKEN=<token>
cd "E:/3D Stuff/01 Coding STuff/Client Side Dashboard/worker"
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler deploy
```

After deploying, set a custom domain `track-api.cyanidesugar.com` in Cloudflare dashboard → Workers & Pages → client-tracking-api → Settings → Domains.

## Tracking page deployment

- GitHub repo: `cyanidesugar/client-side-dashboard`
- Cloudflare Pages: connect repo, no build command, publish directory = `/`
- Custom domain: `track.cyanidesugar.com`
- Update `WORKER_URL` constant in `index.html` to the Worker's deployed URL

## Worker URL constant

In `index.html`, update this constant after deploying the Worker:
```js
const WORKER_URL = 'https://track-api.cyanidesugar.com';
```

## Admin side (Projects Dashboard)

The Projects Dashboard (`../Projects Dashboard/index.html`) has a "Client Tracking" card on each project detail page. From there the admin can:
- Enable/disable tracking for the project
- Set total units and completed units
- Write a public note for the customer
- Assign a camera HLS URL
- Upload progress photos (stored in Supabase Storage `project-photos` bucket)
- Copy the tracking link

## Camera integration (future — not yet built)

When a TAPO printer camera is assigned to a project:

1. Run FFmpeg on the local machine to transcode RTSP → HLS:
   ```bash
   ffmpeg -i "rtsp://admin:<password>@<camera-ip>:554/stream1" \
     -c:v copy -f hls -hls_time 2 -hls_list_size 5 \
     -hls_flags delete_segments /tmp/hls/printer1/stream.m3u8
   ```

2. Serve HLS segments from a local HTTP server (e.g. `npx serve /tmp/hls`)

3. Expose via Cloudflare Tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

4. Paste the resulting HTTPS URL (+ `/printer1/stream.m3u8`) into the camera field on the project in Projects Dashboard.

5. Tracking page will load it via HLS.js automatically.

## Key patterns

- No framework, no build step — vanilla HTML/JS
- `WORKER_URL` constant at top of `index.html` — easy to update
- All Supabase access via Worker only (never direct from tracking page)
- Photos stored in Supabase Storage, URLs stored in `project_photos` table
- `tracking_enabled = false` → Worker returns 404 (link deactivated without deleting data)
