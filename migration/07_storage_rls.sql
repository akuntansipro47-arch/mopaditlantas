-- Wajib dijalankan setelah migrasi Storage: RLS policy untuk bucket lampiran.
-- Policy ini tinggal di schema `storage` di Supabase Cloud sehingga TIDAK ikut
-- dalam dump schema `public` — tanpanya upload lampiran via anon key ditolak.

CREATE POLICY IF NOT EXISTS "Public read access for vehicle entry attachments"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'vehicle-entry-attachments');

CREATE POLICY IF NOT EXISTS "Allow upload for vehicle entry attachments"
  ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'vehicle-entry-attachments');

CREATE POLICY IF NOT EXISTS "Allow update for vehicle entry attachments"
  ON storage.objects FOR UPDATE TO public
  USING (bucket_id = 'vehicle-entry-attachments');

CREATE POLICY IF NOT EXISTS "Allow delete for vehicle entry attachments"
  ON storage.objects FOR DELETE TO public
  USING (bucket_id = 'vehicle-entry-attachments');
