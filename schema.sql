-- Run this in: Supabase Dashboard > SQL Editor > New query
-- Project: tirbstkacpcjzebjbesb (Projects Dashboard + Client Side Dashboard share this DB)

-- Add client tracking columns to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_units integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS completed_units integer DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS public_note text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tracking_enabled boolean DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS assigned_camera_url text;

-- Progress photos uploaded by admin for customers to view
CREATE TABLE IF NOT EXISTS project_photos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  url text NOT NULL,
  caption text,
  uploaded_at timestamptz DEFAULT now()
);

ALTER TABLE project_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open" ON project_photos FOR ALL USING (true) WITH CHECK (true);

-- Also create the storage bucket via Supabase dashboard:
-- Storage > New bucket > Name: project-photos > Public: ON
