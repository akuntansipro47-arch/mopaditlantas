
CREATE TABLE IF NOT EXISTS vehicle_entry_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_entry_id UUID REFERENCES vehicle_entries(id) ON DELETE CASCADE,
  job_type_id UUID REFERENCES job_types(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS but allow public access for now as per previous fix
ALTER TABLE vehicle_entry_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access" ON vehicle_entry_jobs FOR ALL USING (true) WITH CHECK (true);
