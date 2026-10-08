// Tahap 5 (tanpa service key cloud) — migrasi file Storage dari bucket PUBLIC.
// Input: /root/storage_paths.tsv berisi pasangan "bucket<TAB>path" per baris.
// Unduh dari URL publik cloud, unggah ke storage VPS dengan SERVICE_ROLE_KEY baru.
import { readFileSync } from 'node:fs';

const SRC_BASE = 'https://efkkdeoheekcxwirungu.supabase.co';
const DST_BASE = 'http://127.0.0.1:8000';
const SERVICE_KEY = process.env.DST_SERVICE_KEY;
if (!SERVICE_KEY) {
  console.error('Set dulu: export DST_SERVICE_KEY=...');
  process.exit(1);
}

const lines = readFileSync('/root/storage_paths.tsv', 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

const pairs = lines.map((l) => {
  const [bucket, ...rest] = l.split('\t');
  return { bucket, path: rest.join('\t') };
});

const buckets = [...new Set(pairs.map((p) => p.bucket))];
console.log(`Total file: ${pairs.length} | bucket: ${buckets.join(', ')}`);

// Pastikan bucket tujuan ada (public, mengikuti sumber)
for (const bucket of buckets) {
  const res = await fetch(`${DST_BASE}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: bucket, name: bucket, public: true }),
  });
  if (res.ok) console.log(`Bucket dibuat: ${bucket}`);
  else {
    const body = await res.text();
    console.log(`Bucket ${bucket}: ${res.status} ${body.slice(0, 80)} (kemungkinan sudah ada)`);
  }
}

let ok = 0;
let fail = 0;
for (const { bucket, path } of pairs) {
  try {
    const dl = await fetch(`${SRC_BASE}/storage/v1/object/public/${bucket}/${path}`);
    if (!dl.ok) throw new Error(`download HTTP ${dl.status}`);
    const buf = Buffer.from(await dl.arrayBuffer());
    const contentType = dl.headers.get('content-type') || 'application/octet-stream';

    const up = await fetch(`${DST_BASE}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: buf,
    });
    if (!up.ok) throw new Error(`upload HTTP ${up.status} ${(await up.text()).slice(0, 100)}`);
    ok += 1;
    if (ok % 50 === 0) console.log(`... ${ok}/${pairs.length}`);
  } catch (e) {
    fail += 1;
    console.error(`GAGAL ${bucket}/${path}: ${e.message}`);
  }
}

console.log(`SELESAI: ${ok} tersalin, ${fail} gagal.`);
