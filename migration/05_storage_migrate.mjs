// Tahap 5 — Migrasi seluruh bucket & file Supabase Storage: Cloud → self-hosted.
//
// Persiapan:
//   cd migration && npm install
//   export SRC_URL='https://xxxx.supabase.co'
//   export SRC_SERVICE_KEY='<service_role key Supabase Cloud>'
//   export DST_URL='http://127.0.0.1:8000'              # atau https://api.domainanda.com
//   export DST_SERVICE_KEY='<SERVICE_ROLE_KEY hasil Tahap 2>'
//   node 05_storage_migrate.mjs
import { createClient } from '@supabase/supabase-js';

const { SRC_URL, SRC_SERVICE_KEY, DST_URL, DST_SERVICE_KEY } = process.env;
for (const [k, v] of Object.entries({ SRC_URL, SRC_SERVICE_KEY, DST_URL, DST_SERVICE_KEY })) {
  if (!v) {
    console.error(`Env ${k} belum di-set.`);
    process.exit(1);
  }
}

const src = createClient(SRC_URL, SRC_SERVICE_KEY, { auth: { persistSession: false } });
const dst = createClient(DST_URL, DST_SERVICE_KEY, { auth: { persistSession: false } });

async function listAllFiles(client, bucket, prefix = '') {
  const out = [];
  const limit = 100;
  let offset = 0;
  for (;;) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit, offset });
    if (error) throw error;
    for (const item of data || []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) out.push(path); // file
      else out.push(...(await listAllFiles(client, bucket, path))); // folder
    }
    if (!data || data.length < limit) break;
    offset += limit;
  }
  return out;
}

const { data: buckets, error: bucketsErr } = await src.storage.listBuckets();
if (bucketsErr) throw bucketsErr;
console.log(`Ditemukan ${buckets.length} bucket di sumber.`);

for (const bucket of buckets) {
  console.log(`\n== Bucket: ${bucket.name} ==`);
  // Pastikan bucket tujuan ada (public mengikuti sumber)
  const { data: existing } = await dst.storage.getBucket(bucket.id);
  if (!existing) {
    const { error: createErr } = await dst.storage.createBucket(bucket.id, {
      public: bucket.public,
      fileSizeLimit: bucket.file_size_limit ?? undefined,
      allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
    });
    if (createErr) {
      console.error(`  Gagal membuat bucket tujuan: ${createErr.message} — dilewati.`);
      continue;
    }
  }

  const files = await listAllFiles(src, bucket.id);
  console.log(`  ${files.length} file ditemukan.`);
  let ok = 0;
  let fail = 0;
  for (const path of files) {
    try {
      const { data: blob, error: dlErr } = await src.storage.from(bucket.id).download(path);
      if (dlErr) throw dlErr;
      const { error: upErr } = await dst.storage.from(bucket.id).upload(path, blob, { upsert: true });
      if (upErr) throw upErr;
      ok += 1;
      if (ok % 25 === 0) console.log(`  ... ${ok}/${files.length}`);
    } catch (e) {
      fail += 1;
      console.error(`  GAGAL ${path}: ${e.message || e}`);
    }
  }
  console.log(`  Selesai: ${ok} tersalin, ${fail} gagal.`);
}

console.log('\nMigrasi storage selesai.');
