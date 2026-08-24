-- ============================================================================
-- SISTEM RUMAH TANGGA MULTI-KK
-- Relasi: Kelurahan -> RW -> RT -> Rumah -> KK -> Jawaban Kuesioner
-- ============================================================================

-- Pastikan extension UUID tersedia (Supabase biasanya sudah punya extension ini)
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tabel rumah: data agregat rumah disimpan di level rumah
CREATE TABLE IF NOT EXISTS rumah (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor_rumah VARCHAR(50) NOT NULL,
  id_rt UUID NOT NULL REFERENCES rt(id) ON DELETE CASCADE,
  jumlah_jiwa INT NOT NULL DEFAULT 0,
  jumlah_menetap INT NOT NULL DEFAULT 0,
  jumlah_jamban INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id_rt, nomor_rumah)
);

-- Tabel kartu keluarga: satu rumah bisa memiliki banyak KK
CREATE TABLE IF NOT EXISTS kk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor_kk VARCHAR(50) NOT NULL,
  kepala_keluarga VARCHAR(150) NOT NULL,
  id_rumah UUID NOT NULL REFERENCES rumah(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id_rumah, nomor_kk)
);

-- Tabel jawaban kuesioner: satu KK hanya punya 1 jawaban kuesioner
CREATE TABLE IF NOT EXISTS jawaban_kuesioner (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_kk UUID NOT NULL UNIQUE REFERENCES kk(id) ON DELETE CASCADE,

  p1_1 BOOLEAN,
  p1_2 BOOLEAN,
  p1_3 BOOLEAN,
  p1_4 BOOLEAN,
  p1_5 BOOLEAN,
  p1_6 BOOLEAN,
  p1_7 BOOLEAN,

  p2_1 BOOLEAN,
  p2_2 BOOLEAN,
  p2_3 BOOLEAN,
  p2_4 BOOLEAN,
  p2_5 BOOLEAN,
  p2_6 BOOLEAN,
  p2_7 BOOLEAN,
  p2_8 BOOLEAN,

  p3_1 BOOLEAN,
  p3_2 BOOLEAN,
  p3_3 BOOLEAN,
  p3_4 BOOLEAN,
  p3_5 BOOLEAN,
  p3_6 BOOLEAN,
  p3_7 BOOLEAN,
  p3_8 BOOLEAN,
  p3_9 BOOLEAN,
  p3_10 BOOLEAN,
  p3_11 BOOLEAN,
  p3_12 BOOLEAN,
  p3_13 BOOLEAN,
  p3_14 BOOLEAN,

  p4_1 BOOLEAN,
  p4_2 BOOLEAN,
  p4_3 BOOLEAN,
  p4_4 BOOLEAN,

  p5_1 BOOLEAN,
  p5_2 BOOLEAN,
  p5_3 BOOLEAN,
  p5_4 BOOLEAN,
  p5_5 BOOLEAN,
  p5_6 BOOLEAN,
  p5_7 BOOLEAN,
  p5_8 BOOLEAN,
  p5_9 BOOLEAN,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index agar query cepat
CREATE INDEX IF NOT EXISTS idx_rumah_id_rt ON rumah(id_rt);
CREATE INDEX IF NOT EXISTS idx_kk_id_rumah ON kk(id_rumah);
CREATE INDEX IF NOT EXISTS idx_jawaban_id_kk ON jawaban_kuesioner(id_kk);

-- Trigger auto update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_rumah_updated_at ON rumah;
CREATE TRIGGER trg_update_rumah_updated_at
BEFORE UPDATE ON rumah
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_update_kk_updated_at ON kk;
CREATE TRIGGER trg_update_kk_updated_at
BEFORE UPDATE ON kk
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_update_jawaban_updated_at ON jawaban_kuesioner;
CREATE TRIGGER trg_update_jawaban_updated_at
BEFORE UPDATE ON jawaban_kuesioner
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEW gabungan untuk detail rumah dengan hierarki lengkap
-- ============================================================================
CREATE OR REPLACE VIEW rumah_detail AS
SELECT
  r.id AS id_rumah,
  r.nomor_rumah,
  r.jumlah_jiwa,
  r.jumlah_menetap,
  r.jumlah_jamban,
  rt.id AS id_rt,
  rt.nomor_rt,
  rw.id AS id_rw,
  rw.nomor_rw,
  k.id AS id_kelurahan,
  k.name AS nama_kelurahan,
  r.created_at,
  r.updated_at
FROM rumah r
JOIN rt ON rt.id = r.id_rt
JOIN rw ON rw.id = rt.rw_id
JOIN kelurahan k ON k.id = rw.kelurahan_id;

-- ============================================================================
-- Helper: ambil detail rumah lengkap beserta semua KK dan jawaban
-- ============================================================================
CREATE OR REPLACE VIEW rumah_kk_detail AS
SELECT
  r.id AS rumah_id,
  r.nomor_rumah,
  rt.nomor_rt,
  rw.nomor_rw,
  k.name AS nama_kelurahan,
  kk.id AS kk_id,
  kk.nomor_kk,
  kk.kepala_keluarga,
  jk.id AS jawaban_id,
  jk.p1_1, jk.p1_2, jk.p1_3, jk.p1_4, jk.p1_5, jk.p1_6, jk.p1_7,
  jk.p2_1, jk.p2_2, jk.p2_3, jk.p2_4, jk.p2_5, jk.p2_6, jk.p2_7, jk.p2_8,
  jk.p3_1, jk.p3_2, jk.p3_3, jk.p3_4, jk.p3_5, jk.p3_6, jk.p3_7, jk.p3_8, jk.p3_9, jk.p3_10, jk.p3_11, jk.p3_12, jk.p3_13, jk.p3_14,
  jk.p4_1, jk.p4_2, jk.p4_3, jk.p4_4,
  jk.p5_1, jk.p5_2, jk.p5_3, jk.p5_4, jk.p5_5, jk.p5_6, jk.p5_7, jk.p5_8, jk.p5_9
FROM rumah r
JOIN rt ON rt.id = r.id_rt
JOIN rw ON rw.id = rt.rw_id
JOIN kelurahan k ON k.id = rw.kelurahan_id
LEFT JOIN kk ON kk.id_rumah = r.id
LEFT JOIN jawaban_kuesioner jk ON jk.id_kk = kk.id;

-- ============================================================================
-- RLS: aman untuk data rumah, kk, jawaban kuesioner
-- ============================================================================
ALTER TABLE rumah ENABLE ROW LEVEL SECURITY;
ALTER TABLE kk ENABLE ROW LEVEL SECURITY;
ALTER TABLE jawaban_kuesioner ENABLE ROW LEVEL SECURITY;

-- Policy umum: user terautentikasi bisa melihat semua data
CREATE POLICY IF NOT EXISTS "Authenticated users can read rumah"
  ON rumah FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY IF NOT EXISTS "Authenticated users can insert rumah"
  ON rumah FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY IF NOT EXISTS "Authenticated users can update rumah"
  ON rumah FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY IF NOT EXISTS "Authenticated users can delete rumah"
  ON rumah FOR DELETE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY IF NOT EXISTS "Authenticated users can read kk"
  ON kk FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY IF NOT EXISTS "Authenticated users can insert kk"
  ON kk FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY IF NOT EXISTS "Authenticated users can update kk"
  ON kk FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY IF NOT EXISTS "Authenticated users can delete kk"
  ON kk FOR DELETE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY IF NOT EXISTS "Authenticated users can read jawaban kuesioner"
  ON jawaban_kuesioner FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY IF NOT EXISTS "Authenticated users can insert jawaban kuesioner"
  ON jawaban_kuesioner FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY IF NOT EXISTS "Authenticated users can update jawaban kuesioner"
  ON jawaban_kuesioner FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY IF NOT EXISTS "Authenticated users can delete jawaban kuesioner"
  ON jawaban_kuesioner FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- Contoh insert rumah + KK + jawaban kuesioner
-- ============================================================================
-- INSERT INTO rumah (nomor_rumah, id_rt, jumlah_jiwa, jumlah_menetap, jumlah_jamban)
-- VALUES ('12A', '<id_rt>', 6, 5, 2);
--
-- INSERT INTO kk (nomor_kk, kepala_keluarga, id_rumah)
-- VALUES ('3501010101010101', 'Budi Santoso', '<id_rumah>');
--
-- INSERT INTO jawaban_kuesioner (
--   id_kk,
--   p1_1, p1_2, p1_3, p1_4, p1_5, p1_6, p1_7,
--   p2_1, p2_2, p2_3, p2_4, p2_5, p2_6, p2_7, p2_8,
--   p3_1, p3_2, p3_3, p3_4, p3_5, p3_6, p3_7, p3_8, p3_9, p3_10, p3_11, p3_12, p3_13, p3_14,
--   p4_1, p4_2, p4_3, p4_4,
--   p5_1, p5_2, p5_3, p5_4, p5_5, p5_6, p5_7, p5_8, p5_9
-- ) VALUES (
--   '<id_kk>',
--   true, false, true, true, false, true, false,
--   true, true, false, true, false, true, false, true,
--   true, false, true, true, false, true, false, true, true, false, true, false, true, true,
--   true, false, true, false,
--   true, false, true, true, false, true, false, true, true
-- );
