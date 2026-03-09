-- Create a new table for WO Images
CREATE TABLE IF NOT EXISTS work_order_images (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE work_order_images ENABLE ROW LEVEL SECURITY;

-- Create Policy
-- Allow inserts for authenticated users
CREATE POLICY "Enable insert for authenticated users" ON work_order_images FOR INSERT WITH CHECK (auth.role() = 'authenticated');
-- Allow select for all authenticated users
CREATE POLICY "Enable select for authenticated users" ON work_order_images FOR SELECT USING (auth.role() = 'authenticated');
-- Allow delete for authenticated users
CREATE POLICY "Enable delete for authenticated users" ON work_order_images FOR DELETE USING (auth.role() = 'authenticated');

-- Create Storage Bucket for WO Images if not exists
INSERT INTO storage.buckets (id, name, public) VALUES ('wo-images', 'wo-images', true) ON CONFLICT (id) DO NOTHING;

-- Storage Policy
CREATE POLICY "Allow public read access" ON storage.objects FOR SELECT USING (bucket_id = 'wo-images');
CREATE POLICY "Allow authenticated upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'wo-images' AND auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated delete" ON storage.objects FOR DELETE USING (bucket_id = 'wo-images' AND auth.role() = 'authenticated');
