import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { logActivity } from '@/lib/activityLog';
import { supabase } from '@/lib/supabase';
import { Download, Loader2, Upload } from 'lucide-react';
import { gzip, gunzip } from 'fflate';

type StorageRef = {
  source_table: string;
  asset_id: string;
  bucket: string;
  path: string;
  file_name?: string | null;
  mime_type?: string | null;
};

type TableOption = {
  table: string;
  label: string;
  onConflict?: string;
  deleteMatchColumns?: string[];
  getStorageRefs?: (row: AnyRow) => StorageRef[];
};
type AnyRow = Record<string, any>;
type BackupAsset = {
  id: string;
  source_table: string;
  bucket: string;
  path: string;
  file_name?: string | null;
  mime_type?: string | null;
  size_bytes: number;
  data_base64: string;
};
type BackupPayload = {
  format: string;
  compression?: 'gzip' | 'none';
  exported_at?: string;
  exported_by?: { id?: string; username?: string; role?: string };
  tables: Record<string, AnyRow[]>;
  counts?: Record<string, number>;
  skipped?: Record<string, string>;
  attachments?: {
    files?: BackupAsset[];
    skipped?: Record<string, string>;
  };
};

const ATTACHMENT_TABLE = 'vehicle_entry_attachments';
const FINALIZATION_STEP_COUNT = 3;

function getPublicStoragePath(url: string, bucket: string) {
  const raw = String(url || '').trim();
  if (!raw || !bucket) return null;
  const match = raw.match(new RegExp(`/object/(?:public|sign)/${bucket}/(.+)$`));
  if (!match?.[1]) return null;
  const value = match[1].split('?')[0] || '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const TABLE_OPTIONS: TableOption[] = [
  { table: 'agency_profile', label: 'Profil Instansi (agency_profile)' },
  { table: 'app_users', label: 'User Aplikasi (app_users)' },
  { table: 'vehicles', label: 'Kendaraan (vehicles)' },
  { table: 'mechanics', label: 'Mekanik (mechanics)' },
  { table: 'suppliers', label: 'Supplier (suppliers)' },
  { table: 'job_types', label: 'Pekerjaan (job_types)' },
  { table: 'goods', label: 'Barang/Jasa (goods)' },
  { table: 'budget_periods', label: 'Periode Anggaran (budget_periods)' },
  { table: 'budget_allocations', label: 'Alokasi Anggaran (budget_allocations)' },
  { table: 'budget_forecast_sheets', label: 'Forecast Anggaran Sheet (budget_forecast_sheets)' },
  { table: 'budget_forecast_lines', label: 'Forecast Anggaran Baris (budget_forecast_lines)' },
  { table: 'vehicle_entries', label: 'Entry Kendaraan (vehicle_entries)' },
  { table: 'vehicle_entry_estimation_changes', label: 'Riwayat Perubahan Estimasi (vehicle_entry_estimation_changes)' },
  { table: 'vehicle_entry_attachments', label: 'Lampiran Entry Kendaraan (vehicle_entry_attachments)' },
  { table: 'vehicle_entry_jobs', label: 'Jasa Entry (vehicle_entry_jobs)' },
  { table: 'vehicle_entry_spareparts', label: 'Sparepart Entry (vehicle_entry_spareparts)' },
  { table: 'work_orders', label: 'Work Order (work_orders)' },
  { table: 'work_order_images', label: 'Gambar Work Order Lama (work_order_images)' },
  { table: 'work_order_billings', label: 'Billing WO (work_order_billings)' },
  { table: 'purchase_requests', label: 'Purchase Request (purchase_requests)' },
  { table: 'purchase_request_items', label: 'Item PR (purchase_request_items)' },
  { table: 'purchase_orders', label: 'Purchase Order (purchase_orders)' },
  { table: 'purchase_order_items', label: 'Item PO (purchase_order_items)' },
  { table: 'goods_receipts', label: 'Penerimaan Barang (goods_receipts)' },
  { table: 'goods_receipt_items', label: 'Item Penerimaan (goods_receipt_items)' },
  { table: 'goods_issues', label: 'Barang Keluar (goods_issues)' },
  { table: 'goods_issue_items', label: 'Item Barang Keluar (goods_issue_items)' },
  { table: 'purchase_returns', label: 'Retur Pembelian (purchase_returns)' },
  { table: 'purchase_return_items', label: 'Item Retur (purchase_return_items)' },
  { table: 'purchase_invoices', label: 'Invoice Pembelian (purchase_invoices)' },
  { table: 'purchase_invoice_items', label: 'Item Invoice Pembelian (purchase_invoice_items)' },
  { table: 'purchase_payments', label: 'Pembayaran Hutang (purchase_payments)' },
  { table: 'sales_invoices', label: 'Invoice Penjualan (sales_invoices)' },
  { table: 'sales_receipts', label: 'Pembayaran Piutang (sales_receipts)' },
  { table: 'chart_of_accounts', label: 'COA (chart_of_accounts)' },
  { table: 'journal_entries', label: 'Jurnal (journal_entries)' },
  { table: 'journal_entry_items', label: 'Item Jurnal (journal_entry_items)' },
  { table: 'employees', label: 'Karyawan (employees)' },
  { table: 'payrolls', label: 'Payroll (payrolls)' },
  {
    table: 'document_print_counters',
    label: 'Counter Cetak Dokumen (document_print_counters)',
    onConflict: 'doc_type,doc_id',
    deleteMatchColumns: ['doc_type', 'doc_id'],
  },
  { table: 'activity_logs', label: 'Log Aktivitas (activity_logs)' },
].map((item) => {
  if (item.table === ATTACHMENT_TABLE) {
    return {
      ...item,
      getStorageRefs: (row: AnyRow) => {
        const bucket = String(row.storage_bucket || '').trim();
        const path = String(row.storage_path || '').trim();
        if (!bucket || !path) return [];
        return [
          {
            source_table: ATTACHMENT_TABLE,
            asset_id: String(row.id || `${bucket}:${path}`),
            bucket,
            path,
            file_name: row.file_name ? String(row.file_name) : null,
            mime_type: row.mime_type ? String(row.mime_type) : null,
          },
        ];
      },
    } satisfies TableOption;
  }

  if (item.table === 'work_order_images') {
    return {
      ...item,
      getStorageRefs: (row: AnyRow) => {
        const bucket = 'wo-images';
        const path = getPublicStoragePath(String(row.image_url || ''), bucket);
        if (!path) return [];
        return [
          {
            source_table: 'work_order_images',
            asset_id: String(row.id || `${bucket}:${path}`),
            bucket,
            path,
            file_name: path.split('/').pop() || 'image',
            mime_type: null,
          },
        ];
      },
    } satisfies TableOption;
  }

  return item;
});

const RESTORE_TABLE_ORDER = TABLE_OPTIONS.map((t) => t.table);

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function waitForUiPaint() {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function blobToBase64(blob: Blob) {
  // Lebih cepat dibanding manual arrayBuffer->btoa untuk file besar
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Gagal membaca file lampiran'));
    r.onload = () => {
      try {
        const res = String(r.result || '');
        const idx = res.indexOf(',');
        resolve(idx >= 0 ? res.slice(idx + 1) : res);
      } catch (e) {
        reject(e);
      }
    };
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mimeType?: string | null) {
  return new Blob([base64ToBytes(base64)], { type: mimeType || 'application/octet-stream' });
}

async function gzipText(text: string) {
  // fflate gzip (lebih cepat) + menghasilkan gzip standard
  const input = new TextEncoder().encode(text);
  const out = await new Promise<Uint8Array>((resolve, reject) => {
    gzip(input, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)));
  });
  return { blob: new Blob([out], { type: 'application/gzip' }), compression: 'gzip' as const };
}

async function unzipToText(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const out = await new Promise<Uint8Array>((resolve, reject) => {
    gunzip(buf, (err, data) => (err ? reject(err) : resolve(data)));
  });
  return new TextDecoder().decode(out);
}

async function readBackupFile(file: File) {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const isGzip = head[0] === 0x1f && head[1] === 0x8b;
  const text = isGzip ? await unzipToText(file) : await file.text();
  const payload = JSON.parse(text);

  if (!payload || typeof payload !== 'object' || !payload.tables || typeof payload.tables !== 'object') {
    throw new Error('Format backup tidak valid.');
  }

  return payload as BackupPayload;
}

function getKnownTables() {
  return new Set(TABLE_OPTIONS.map((t) => t.table));
}

function getTableOption(table: string) {
  return TABLE_OPTIONS.find((item) => item.table === table);
}

function normalizeBackupPayload(payload: BackupPayload): BackupPayload {
  const knownTables = getKnownTables();
  const normalizedTables = Object.fromEntries(
    Object.entries(payload.tables || {}).filter(([table, rows]) => knownTables.has(table) && Array.isArray(rows))
  );

  return {
    ...payload,
    format: String(payload.format || 'supabase-json-backup-v1'),
    compression: payload.compression === 'gzip' ? 'gzip' : 'none',
    counts: payload.counts || {},
    skipped: payload.skipped || {},
    tables: normalizedTables,
    attachments: {
      files: Array.isArray(payload.attachments?.files)
        ? payload.attachments?.files
        : [],
      skipped: payload.attachments?.skipped || {},
    },
  };
}

async function fetchAllRows(table: string, pageSize = 1000) {
  let all: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table as any)
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    all = all.concat(rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function upsertRows(table: string, rows: AnyRow[], chunkSize = 200) {
  const option = getTableOption(table);
  const onConflict = option?.onConflict || 'id';
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table as any).upsert(chunk as any, { onConflict });
    if (error) throw error;
  }
}

async function deleteAllRows(table: string) {
  const option = getTableOption(table);
  const deleteColumns = option?.deleteMatchColumns?.length ? option.deleteMatchColumns : ['id'];
  let query = supabase.from(table as any).delete();
  for (const column of deleteColumns) {
    query = query.not(column, 'is', null);
  }
  const { error } = await query;
  if (error) throw error;
}

async function removeStoragePaths(paths: Array<{ bucket: string; path: string }>) {
  const grouped = new Map<string, string[]>();
  for (const item of paths) {
    if (!item.bucket || !item.path) continue;
    const current = grouped.get(item.bucket) || [];
    current.push(item.path);
    grouped.set(item.bucket, current);
  }

  for (const [bucket, list] of grouped.entries()) {
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      const { error } = await supabase.storage.from(bucket).remove(chunk);
      if (error) throw error;
    }
  }
}

function collectStorageRefsFromTables(tables: Record<string, AnyRow[]>) {
  const refs = new Map<string, StorageRef>();
  for (const [table, rows] of Object.entries(tables || {})) {
    const option = getTableOption(table);
    if (!option?.getStorageRefs || !Array.isArray(rows)) continue;

    for (const row of rows) {
      for (const ref of option.getStorageRefs(row)) {
        const key = `${ref.source_table}:${ref.bucket}:${ref.path}`;
        refs.set(key, ref);
      }
    }
  }
  return [...refs.values()];
}

async function fetchAttachmentAssets(
  refs: StorageRef[],
  onProgress?: (label: string) => void
) {
  const assets: BackupAsset[] = [];
  const skipped: Record<string, string> = {};
  const concurrency = 4; // aman: cukup cepat tapi tidak "nembak" rate limit
  let completed = 0;
  let success = 0;

  const worker = async (ref: StorageRef) => {
    const bucket = String(ref.bucket || '');
    const path = String(ref.path || '');
    try {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error) throw error;
      const base64 = await blobToBase64(data);
      const item: BackupAsset = {
        id: String(ref.asset_id || `${bucket}:${path}`),
        source_table: ref.source_table,
        bucket,
        path,
        file_name: ref.file_name ? String(ref.file_name) : null,
        mime_type: ref.mime_type ? String(ref.mime_type) : null,
        size_bytes: data.size,
        data_base64: base64,
      };
      assets.push(item);
      success += 1;
    } catch (e: any) {
      skipped[`${ref.source_table}:${bucket}:${path}`] = String(e?.message || e);
    } finally {
      completed += 1;
      onProgress?.(`Mengemas lampiran ${completed}/${refs.length} (ok: ${success})`);
    }
  };

  for (let i = 0; i < refs.length; i += concurrency) {
    const batch = refs.slice(i, i + concurrency);
    await Promise.all(batch.map(worker));
  }

  return { assets, skipped };
}

async function restoreAttachmentAssets(
  assets: BackupAsset[],
  onProgress?: (label: string) => void
) {
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    onProgress?.(`Restore lampiran ${i + 1}/${assets.length}`);
    const bucket = String(asset.bucket || '');
    const path = String(asset.path || '');

    if (!bucket || !path || !asset.data_base64) continue;

    try {
      await supabase.storage.from(bucket).remove([path]);
    } catch {
      // ignore
    }

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, base64ToBlob(asset.data_base64, asset.mime_type), {
        upsert: false,
        contentType: asset.mime_type || 'application/octet-stream',
      });

    if (error) throw error;
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('id-ID').format(value || 0);
}

export default function AdminBackup() {
  const { user } = useAuth();
  const defaultSelected = useMemo(() => Object.fromEntries(TABLE_OPTIONS.map((t) => [t.table, true])), []);
  const [selected, setSelected] = useState<Record<string, boolean>>(defaultSelected);
  const [running, setRunning] = useState(false);
  const [currentTable, setCurrentTable] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [skipped, setSkipped] = useState<Record<string, string>>({});
  const [includeAttachmentFiles, setIncludeAttachmentFiles] = useState(true);
  const [restorePayload, setRestorePayload] = useState<BackupPayload | null>(null);
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restoreRunning, setRestoreRunning] = useState(false);
  const [restoreInfo, setRestoreInfo] = useState<{ message?: string; isLegacy?: boolean }>({});
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const busy = running || restoreRunning;

  const pickedTables = useMemo(
    () => TABLE_OPTIONS.filter((t) => selected[t.table]).map((t) => t.table),
    [selected]
  );
  const restoreSummary = useMemo(() => {
    if (!restorePayload) return null;
    const tables = Object.entries(restorePayload.tables || {});
    const tableCount = tables.length;
    const rowCount = tables.reduce((sum, [, rows]) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
    const attachmentFiles = restorePayload.attachments?.files?.length || 0;
    return {
      tableCount,
      rowCount,
      attachmentFiles,
    };
  }, [restorePayload]);

  if (!user || user.role !== 'SUPER_ADMIN') {
    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold tracking-tight">Backup & Export</h2>
        <Card>
          <CardHeader>
            <CardTitle>Akses Ditolak</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Halaman ini hanya untuk Super Admin.</CardContent>
        </Card>
      </div>
    );
  }

  async function runBackup() {
    if (running) return;
    if (pickedTables.length === 0) {
      toast.error('Pilih minimal 1 tabel untuk dibackup.');
      return;
    }

    setRunning(true);
    setCurrentTable(null);
    setDone(0);
    setTotal(0);
    setCounts({});
    setSkipped({});

    const output: Record<string, any[]> = {};
    const localCounts: Record<string, number> = {};
    const localSkipped: Record<string, string> = {};
    let attachmentAssets: BackupAsset[] = [];
    let attachmentAssetSkipped: Record<string, string> = {};

    try {
      const hasAttachmentStep = includeAttachmentFiles && pickedTables.some((table) => Boolean(getTableOption(table)?.getStorageRefs));
      setTotal(pickedTables.length + (hasAttachmentStep ? 1 : 0) + FINALIZATION_STEP_COUNT);

      for (let i = 0; i < pickedTables.length; i++) {
        const table = pickedTables[i];
        setCurrentTable(table);
        try {
          const rows = await fetchAllRows(table);
          output[table] = rows;
          localCounts[table] = rows.length;
          setCounts((prev) => ({ ...prev, [table]: rows.length }));
        } catch (e: any) {
          const msg = String(e?.message || e);
          localSkipped[table] = msg;
          setSkipped((prev) => ({ ...prev, [table]: msg }));
        } finally {
          setDone(i + 1);
        }
      }

      const exportedAt = new Date().toISOString();
      const storageRefs = includeAttachmentFiles ? collectStorageRefsFromTables(output) : [];
      if (storageRefs.length > 0) {
        const res = await fetchAttachmentAssets(storageRefs, (label) => setCurrentTable(label));
        attachmentAssets = res.assets;
        attachmentAssetSkipped = res.skipped;
        setDone(pickedTables.length + 1);
      } else if (hasAttachmentStep) {
        setDone(pickedTables.length + 1);
      }

      const afterDataStep = pickedTables.length + (hasAttachmentStep ? 1 : 0);

      setCurrentTable('Menyusun file backup');
      await waitForUiPaint();
      const payload: BackupPayload = {
        format: 'otosmart-backup-v2',
        compression: 'gzip',
        exported_at: exportedAt,
        exported_by: { id: user.id, username: user.username, role: user.role },
        tables: output,
        counts: localCounts,
        skipped: localSkipped,
        attachments: {
          files: attachmentAssets,
          skipped: attachmentAssetSkipped,
        },
      };
      const compression = payload.compression;
      const payloadText = compression === 'gzip' ? JSON.stringify(payload) : JSON.stringify(payload, null, 2);
      setDone(afterDataStep + 1);

      setCurrentTable(compression === 'gzip' ? 'Mengompresi file backup' : 'Menyiapkan file backup');
      await waitForUiPaint();
      const finalBlob = compression === 'gzip'
        ? await gzipText(payloadText).then((r) => r.blob)
        : new Blob([payloadText], { type: 'application/json;charset=utf-8' });
      setDone(afterDataStep + 2);

      setCurrentTable('Memulai download file backup');
      await waitForUiPaint();
      const safeTime = exportedAt.replace(/[:.]/g, '-');
      downloadBlob(
        compression === 'gzip' ? `backup-${safeTime}.otobak.gz` : `backup-${safeTime}.json`,
        finalBlob
      );
      setDone(afterDataStep + 3);

      await logActivity({
        action: 'backup_export',
        module: 'admin',
        details: `Export backup (${pickedTables.length} tabel)`,
        meta: {
          counts: localCounts,
          skipped: localSkipped,
          compression,
          attachment_files: attachmentAssets.length,
          attachment_skipped: attachmentAssetSkipped,
        },
      });

      if (Object.keys(localSkipped).length > 0 || Object.keys(attachmentAssetSkipped).length > 0) {
        toast.success(
          `Backup terunduh. ${Object.keys(localSkipped).length} tabel dan ${Object.keys(attachmentAssetSkipped).length} file lampiran dilewati.`
        );
      } else {
        toast.success('Backup berhasil diunduh.');
      }
    } catch (e: any) {
      toast.error('Backup gagal: ' + String(e?.message || e));
    } finally {
      setRunning(false);
      setCurrentTable(null);
    }
  }

  async function handleBackupUpload(file: File) {
    setRestoreRunning(false);
    setRestorePayload(null);
    setRestoreFileName(file.name);
    setRestoreInfo({});
    try {
      const parsed = normalizeBackupPayload(await readBackupFile(file));
      setRestorePayload(parsed);
      setRestoreInfo({
        message:
          parsed.format === 'supabase-json-backup-v1'
            ? 'Backup lama terdeteksi. Restore data tabel tetap bisa dipakai, tetapi file gambar/lampiran Storage penuh hanya tersedia jika file backup dibuat dengan format baru.'
            : 'Backup berhasil dibaca dan siap direstore.',
        isLegacy: parsed.format === 'supabase-json-backup-v1',
      });
      toast.success('File backup berhasil dimuat.');
    } catch (e: any) {
      setRestorePayload(null);
      setRestoreInfo({});
      toast.error('File backup tidak bisa dibaca: ' + String(e?.message || e));
    }
  }

  async function runRestore(mode: 'merge' | 'replace') {
    if (restoreRunning || running) return;
    if (!restorePayload) {
      toast.error('Upload file backup terlebih dahulu.');
      return;
    }

    const tablesToRestore = pickedTables.filter((table) => Array.isArray(restorePayload.tables?.[table]));
    if (tablesToRestore.length === 0) {
      toast.error('Tidak ada tabel terpilih yang tersedia di file backup.');
      return;
    }

    const attachmentFiles = restorePayload.attachments?.files || [];
    const selectedTableSet = new Set(tablesToRestore);
    const hasAttachmentAssets = attachmentFiles.some((file) => selectedTableSet.has(file.source_table));

    const proceed = window.confirm(
      mode === 'replace'
        ? `Restore ganti data akan menghapus data lama pada ${tablesToRestore.length} tabel terpilih lalu mengisi ulang dari file backup. Lanjutkan?`
        : `Restore gabung/update akan memperbarui data berdasarkan id pada ${tablesToRestore.length} tabel terpilih tanpa menghapus tabel lain. Lanjutkan?`
    );
    if (!proceed) return;

    setRestoreRunning(true);
    setCurrentTable('Menyiapkan restore');
    setDone(0);
    setTotal(tablesToRestore.length + (hasAttachmentAssets ? 1 : 0));

    try {
      if (mode === 'replace') {
        setCurrentTable('Membersihkan lampiran lama');
        const storageRowsMap: Record<string, AnyRow[]> = {};
        for (const table of tablesToRestore) {
          if (!getTableOption(table)?.getStorageRefs) continue;
          storageRowsMap[table] = await fetchAllRows(table);
        }
        const paths = collectStorageRefsFromTables(storageRowsMap).map((row) => ({
          bucket: String(row.bucket || ''),
          path: String(row.path || ''),
        }));
        if (paths.length > 0) {
          await removeStoragePaths(paths);
        }
      }

      if (mode === 'replace') {
        const deleteOrder = [...tablesToRestore].sort(
          (a, b) => RESTORE_TABLE_ORDER.indexOf(b) - RESTORE_TABLE_ORDER.indexOf(a)
        );

        for (const table of deleteOrder) {
          setCurrentTable(`Menghapus data ${table}`);
          await deleteAllRows(table);
        }
      }

      const orderedRestore = [...tablesToRestore].sort(
        (a, b) => RESTORE_TABLE_ORDER.indexOf(a) - RESTORE_TABLE_ORDER.indexOf(b)
      );

      for (let i = 0; i < orderedRestore.length; i++) {
        const table = orderedRestore[i];
        setCurrentTable(`Restore ${table}`);
        const rows = Array.isArray(restorePayload.tables?.[table]) ? restorePayload.tables[table] : [];
        if (rows.length > 0) {
          await upsertRows(table, rows);
        }
        setDone(i + 1);
      }

      if (hasAttachmentAssets) {
        setCurrentTable('Upload ulang file lampiran');
        await restoreAttachmentAssets(
          attachmentFiles.filter((file) => selectedTableSet.has(file.source_table)),
          (label) => setCurrentTable(label)
        );
        setDone((prev) => prev + 1);
      }

      await logActivity({
        action: 'backup_restore',
        module: 'admin',
        details: `Restore backup (${mode})`,
        meta: {
          mode,
          file_name: restoreFileName || null,
          tables: tablesToRestore,
          attachment_files: attachmentFiles.filter((file) => selectedTableSet.has(file.source_table)).length,
        },
      });

      toast.success(mode === 'replace' ? 'Restore ganti data selesai.' : 'Restore gabung/update selesai.');
    } catch (e: any) {
      toast.error('Restore gagal: ' + String(e?.message || e));
    } finally {
      setRestoreRunning(false);
      setCurrentTable(null);
    }
  }

  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Backup, Export & Restore</h2>

      <Card className="border-slate-200">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Backup Data Terkompres</CardTitle>
            <div className="text-sm text-muted-foreground mt-1">
              Mengunduh data sistem menjadi file backup terkompres. Cakupan backup ini meliputi master data, data transaksi, setting, log penting, dan file gambar/lampiran yang tersimpan di Storage.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={runBackup} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download Backup
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium">Cakupan Backup</div>
            <div className="text-xs text-muted-foreground mt-1">
              Pilih tabel yang ingin dibackup atau direstore. Untuk full backup sistem, biarkan seluruh daftar tetap tercentang agar semua data transaksi, setting, dan tabel pendukung ikut tersimpan.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
              {TABLE_OPTIONS.map((t) => {
                const checked = Boolean(selected[t.table]);
                return (
                  <div key={t.table} className="flex items-start gap-2">
                    <Checkbox
                      checked={checked}
                      disabled={busy}
                      onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [t.table]: Boolean(v) }))}
                    />
                    <div className="grid gap-0.5 leading-none">
                      <Label className="text-sm">{t.label}</Label>
                      <div className="text-xs text-muted-foreground">
                        {typeof counts[t.table] === 'number'
                          ? `${counts[t.table]} baris`
                          : skipped[t.table]
                            ? 'Dilewati'
                            : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-md border bg-slate-50 p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={includeAttachmentFiles}
                  disabled={busy || !selected[ATTACHMENT_TABLE]}
                  onCheckedChange={(v) => setIncludeAttachmentFiles(Boolean(v))}
                />
                <div className="grid gap-0.5 leading-none">
                  <Label className="text-sm">Sertakan semua file gambar/lampiran dari Storage yang terhubung ke tabel sistem</Label>
                  <div className="text-xs text-muted-foreground">
                    Saat ini sistem akan membackup file dari sumber gambar/lampiran yang tercatat di database, termasuk lampiran entry kendaraan dan bucket gambar work order lama bila datanya ada.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div>
                Status:{' '}
                {busy ? (
                  <span className="font-medium">
                    Memproses {done}/{total} {currentTable ? `(${currentTable})` : ''}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Siap</span>
                )}
              </div>
              <div className="tabular-nums">{busy ? `${progressPct}%` : ''}</div>
            </div>
            <div className="h-2 w-full rounded bg-slate-200 overflow-hidden">
              <div className="h-full bg-indigo-600 transition-all" style={{ width: `${busy ? progressPct : 0}%` }} />
            </div>
            <div className="text-xs text-muted-foreground">
              Catatan: jika data sangat besar, proses backup atau restore bisa memerlukan waktu lebih lama.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Restore dari File Backup</CardTitle>
            <div className="text-sm text-muted-foreground mt-1">
              Upload file backup langsung dari komputer, baca ringkasannya, lalu jalankan restore sesuai mode yang diinginkan.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              ref={restoreInputRef}
              type="file"
              accept=".json,.gz,.backup,.otobak,.otobak.gz,application/json,application/gzip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleBackupUpload(file);
              }}
            />
            <Button variant="outline" onClick={() => restoreInputRef.current?.click()} disabled={restoreRunning}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Backup
            </Button>
            <Button onClick={() => runRestore('merge')} disabled={!restorePayload || restoreRunning || running}>
              {restoreRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Restore Gabung/Update
            </Button>
            <Button
              variant="outline"
              onClick={() => runRestore('replace')}
              disabled={!restorePayload || restoreRunning || running}
            >
              Restore Ganti Data
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium">File Backup</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Sistem menerima backup lama `JSON` dan backup baru terkompres `gzip`.
            </div>

            {!restorePayload ? (
              <div className="mt-3 text-sm text-muted-foreground italic">Belum ada file backup yang dimuat.</div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{restoreFileName || 'backup'}</Badge>
                  <Badge variant={restoreInfo.isLegacy ? 'outline' : 'default'}>
                    {restorePayload.format}
                  </Badge>
                  <Badge variant="outline">
                    {restorePayload.compression === 'gzip' ? 'Terkompres gzip' : 'Tanpa kompresi'}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-md border bg-slate-50 p-3">
                    <div className="text-xs text-muted-foreground">Jumlah tabel</div>
                    <div className="text-lg font-semibold tabular-nums">
                      {formatNumber(restoreSummary?.tableCount || 0)}
                    </div>
                  </div>
                  <div className="rounded-md border bg-slate-50 p-3">
                    <div className="text-xs text-muted-foreground">Total baris</div>
                    <div className="text-lg font-semibold tabular-nums">
                      {formatNumber(restoreSummary?.rowCount || 0)}
                    </div>
                  </div>
                  <div className="rounded-md border bg-slate-50 p-3">
                    <div className="text-xs text-muted-foreground">File lampiran</div>
                    <div className="text-lg font-semibold tabular-nums">
                      {formatNumber(restoreSummary?.attachmentFiles || 0)}
                    </div>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  {restoreInfo.message}
                  {restorePayload.exported_at ? ` Backup dibuat pada ${new Date(restorePayload.exported_at).toLocaleString('id-ID')}.` : ''}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-md border bg-slate-50 p-3 text-sm text-muted-foreground">
            `Restore Gabung/Update` akan `upsert` berdasarkan `id` dan tidak menghapus data lain. `Restore Ganti Data` akan menghapus isi tabel terpilih lebih dulu, lalu mengisi ulang dari file backup.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
