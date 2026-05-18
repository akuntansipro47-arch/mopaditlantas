import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Download, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

type LineKind = 'base' | 'deduction' | 'addition' | 'subtraction';

type ForecastLine = {
  id: string;
  label: string;
  kind: LineKind;
  values: number[];
};

type ForecastSection = {
  title: string;
  lines: ForecastLine[];
};

type ForecastGroup = {
  key: 'R2' | 'R4';
  title: string;
  baseLabel: string;
  deductions: ForecastSection;
  additions: ForecastSection;
  subtractions: ForecastSection;
};

type ForecastSheet = {
  version: 1;
  project: string;
  year: number;
  groups: ForecastGroup[];
};

function emptyMonths() {
  return Array.from({ length: 12 }, () => 0);
}

function formatNumber(value: number, showZero = false) {
  const v = Number.isFinite(value) ? value : 0;
  if (!showZero && v === 0) return '';
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v);
}

function parseNumber(input: string) {
  const raw = String(input || '').trim();
  if (!raw) return 0;
  const sign = raw.startsWith('-') ? -1 : 1;
  const cleaned = raw.replace(/[^0-9]/g, '');
  const n = cleaned ? Number(cleaned) : 0;
  if (!Number.isFinite(n)) return 0;
  return sign * n;
}

function sumMonths(lines: ForecastLine[]) {
  const out = emptyMonths();
  for (const line of lines) {
    for (let i = 0; i < 12; i++) out[i] += Number(line.values?.[i] || 0);
  }
  return out;
}

function computeNett(base: ForecastLine, deductions: ForecastLine[]) {
  const out = emptyMonths();
  for (let i = 0; i < 12; i++) {
    const b = Number(base.values?.[i] || 0);
    const d = deductions.reduce((acc, l) => acc + Number(l.values?.[i] || 0), 0);
    out[i] = b + d;
  }
  return out;
}

function computeBalance(nett: number[], additions: ForecastLine[], subtractions: ForecastLine[]) {
  const out = emptyMonths();
  for (let i = 0; i < 12; i++) {
    const n = Number(nett[i] || 0);
    const a = additions.reduce((acc, l) => acc + Number(l.values?.[i] || 0), 0);
    const s = subtractions.reduce((acc, l) => acc + Number(l.values?.[i] || 0), 0);
    out[i] = n + a + s;
  }
  return out;
}

function buildDefaultSheet(project: string, year: number): ForecastSheet {
  const r2Base = emptyMonths();
  r2Base[2] = 189_588_000;
  r2Base[3] = 51_282_000;
  r2Base[4] = 44_755_200;
  r2Base[5] = 57_373_680;
  r2Base[6] = 48_919_920;
  r2Base[7] = 44_382_240;
  r2Base[8] = 43_636_320;
  r2Base[9] = 50_598_240;
  r2Base[10] = 56_689_920;
  r2Base[11] = 47_428_080;

  const r2Potongan = emptyMonths();
  for (let i = 4; i < 12; i++) r2Potongan[i] = -10_000_000;

  const r2ExtraCost = emptyMonths();
  for (let i = 7; i < 12; i++) r2ExtraCost[i] = -9_000_000;

  const r2Potongan9jt = emptyMonths();
  for (let i = 7; i < 12; i++) r2Potongan9jt[i] = -7_200_000;

  const r4Base = [
    189_000_000,
    189_000_000,
    158_000_000,
    158_435_272,
    147_052_534,
    133_333_200,
    153_410_880,
    130_536_000,
    146_708_167,
    147_316_714,
    137_816_801,
    140_170_800,
  ];

  const r4Potongan = emptyMonths();
  for (let i = 4; i < 12; i++) r4Potongan[i] = -24_000_000;

  const r4ExtraCost = emptyMonths();
  for (let i = 7; i < 12; i++) r4ExtraCost[i] = -9_000_000;

  const r4Potongan9jt = emptyMonths();
  for (let i = 7; i < 12; i++) r4Potongan9jt[i] = -7_200_000;

  const groupR2: ForecastGroup = {
    key: 'R2',
    title: 'HARWAT R2',
    baseLabel: 'R2',
    deductions: {
      title: 'Potongan',
      lines: [
        { id: 'r2-potongan-110-41', label: '(110 juta + 41 juta)', kind: 'deduction', values: r2Potongan },
        { id: 'r2-potongan-extra', label: 'Potongan extra cost', kind: 'deduction', values: r2ExtraCost },
        {
          id: 'r2-potongan-9jt',
          label: 'Potongan 9 juta bulan (April - Juli 26) 36 juta /5',
          kind: 'deduction',
          values: r2Potongan9jt,
        },
      ],
    },
    additions: {
      title: 'Penambah (Debet)',
      lines: [
        { id: 'r2-add-1', label: 'Subsidi dari R4 Mei 26', kind: 'addition', values: emptyMonths() },
        { id: 'r2-add-2', label: 'Subsidi dari Pagu Juli 26 (51.761.400)', kind: 'addition', values: emptyMonths() },
        { id: 'r2-add-3', label: 'Penggunaaan Pagu Moge', kind: 'addition', values: emptyMonths() },
        { id: 'r2-add-4', label: 'Alokasi untuk pagu', kind: 'addition', values: emptyMonths() },
        {
          id: 'r2-add-5',
          label: 'Subsidi dari alokasi R4 Agst - Des 26 untuk Mei, Juni dan Juli (80 juta)',
          kind: 'addition',
          values: emptyMonths(),
        },
        { id: 'r2-add-6', label: 'Subsidi untuk alokasi Mei, Juni dan Juli (80 juta) ke 2', kind: 'addition', values: emptyMonths() },
        { id: 'r2-add-7', label: 'Subsidi dari R4 Sep 26', kind: 'addition', values: emptyMonths() },
        { id: 'r2-add-8', label: 'Subsidi dari R4 Okt 26', kind: 'addition', values: emptyMonths() },
        { id: 'r2-add-9', label: 'Subsidi dari R4 Nop 26', kind: 'addition', values: emptyMonths() },
        { id: 'r2-add-10', label: 'Subsidi dari R4 Des 26', kind: 'addition', values: emptyMonths() },
      ],
    },
    subtractions: {
      title: 'Pengurang (Kredit)',
      lines: [
        { id: 'r2-sub-1', label: 'Pemakaian (oli + Part)', kind: 'subtraction', values: emptyMonths() },
        { id: 'r2-sub-2', label: 'Subsidi untuk mencover pagu Mei R2 dan Juni R4', kind: 'subtraction', values: emptyMonths() },
        { id: 'r2-sub-3', label: 'Subsidi untuk mencover pagu Juni R4', kind: 'subtraction', values: emptyMonths() },
        { id: 'r2-sub-4', label: 'Subsidi ke R4 Mei 26', kind: 'subtraction', values: emptyMonths() },
        { id: 'r2-sub-5', label: 'Subsidi kekurangan moge R2 Mei 26', kind: 'subtraction', values: emptyMonths() },
      ],
    },
  };

  const groupR4: ForecastGroup = {
    key: 'R4',
    title: 'HARWAT R4',
    baseLabel: 'R4',
    deductions: {
      title: 'Potongan',
      lines: [
        { id: 'r4-potongan-110-41', label: '(110 juta + 41 juta)', kind: 'deduction', values: r4Potongan },
        { id: 'r4-potongan-extra', label: 'Potongan extra cost', kind: 'deduction', values: r4ExtraCost },
        {
          id: 'r4-potongan-9jt',
          label: 'Potongan 9 juta bulan (April - Juli 26) 36 juta /5',
          kind: 'deduction',
          values: r4Potongan9jt,
        },
      ],
    },
    additions: {
      title: 'Penambah (Debet)',
      lines: [
        { id: 'r4-add-1', label: 'Subsidi dari Pagu Juli 26 (51.761.400)', kind: 'addition', values: emptyMonths() },
        { id: 'r4-add-2', label: 'Subsidi dari pagu Juni R2', kind: 'addition', values: emptyMonths() },
        { id: 'r4-add-3', label: 'Subsidi dari R4 Mei 26', kind: 'addition', values: emptyMonths() },
        { id: 'r4-add-4', label: 'Subsidi dari R4 Agustus 26', kind: 'addition', values: emptyMonths() },
        { id: 'r4-add-5', label: 'Subsidi untuk alokasi Mei, Juni dan Juli (80 juta) ke 2', kind: 'addition', values: emptyMonths() },
        {
          id: 'r4-add-6',
          label: 'Subsidi dari alokasi R4 Agst - Des 26 untuk Mei, Juni dan Juli (80 juta)',
          kind: 'addition',
          values: emptyMonths(),
        },
        { id: 'r4-add-7', label: 'Subsidi dari bulan Agustus, Sept, Okt 26', kind: 'addition', values: emptyMonths() },
      ],
    },
    subtractions: {
      title: 'Pengurang (Kredit)',
      lines: [
        { id: 'r4-sub-1', label: 'Pemakaian (oli + Part)', kind: 'subtraction', values: emptyMonths() },
        { id: 'r4-sub-2', label: 'Subsidi untuk mencover pagu Mei R2 dan Juni R4', kind: 'subtraction', values: emptyMonths() },
        { id: 'r4-sub-3', label: 'Subsidi untuk R4 Juli 26', kind: 'subtraction', values: emptyMonths() },
        { id: 'r4-sub-4', label: 'Subsitusi ke R2 Mei', kind: 'subtraction', values: emptyMonths() },
        { id: 'r4-sub-5', label: 'Subsitusi ke R4 Juli 26', kind: 'subtraction', values: emptyMonths() },
        { id: 'r4-sub-6', label: 'Subsitusi ke R2 Juli 26', kind: 'subtraction', values: emptyMonths() },
        { id: 'r4-sub-7', label: 'Subsitusi ke R2 Sept 26', kind: 'subtraction', values: emptyMonths() },
        { id: 'r4-sub-8', label: 'Subsitusi ke R2 Nop 26', kind: 'subtraction', values: emptyMonths() },
        { id: 'r4-sub-9', label: 'Subsidi untuk alokasi Mei, Juni dan Juli (80 juta) ke 2', kind: 'subtraction', values: emptyMonths() },
        { id: 'r4-sub-10', label: 'Subsidi untuk alokasi Mei, Juni dan Juli (80 juta)', kind: 'subtraction', values: emptyMonths() },
        { id: 'r4-sub-11', label: 'Subsid untuk alokasi Nop & Des 26 (Nataru)', kind: 'subtraction', values: emptyMonths() },
      ],
    },
  };

  const r2BaseLine: ForecastLine = { id: 'r2-base', label: groupR2.baseLabel, kind: 'base', values: r2Base };
  const r4BaseLine: ForecastLine = { id: 'r4-base', label: groupR4.baseLabel, kind: 'base', values: r4Base };
  groupR2.deductions.lines.unshift(r2BaseLine);
  groupR4.deductions.lines.unshift(r4BaseLine);

  return {
    version: 1,
    project,
    year,
    groups: [groupR2, groupR4],
  };
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function storageKey(project: string, year: number) {
  return `budget_forecast_sheet:${String(project).trim().toUpperCase()}:${year}`;
}

function genId(prefix: string) {
  const r = Math.random().toString(16).slice(2);
  return `${prefix}-${Date.now()}-${r}`;
}

function normalizeMonthValues(values: any) {
  const out = emptyMonths();
  const v = Array.isArray(values) ? values : [];
  for (let i = 0; i < 12; i++) out[i] = Number(v[i] || 0);
  return out;
}

function buildSheetFromDb(project: string, year: number, rows: any[]): ForecastSheet {
  const p = String(project || '').trim().toUpperCase() || 'HARWAT';
  const y = Number(year) || new Date().getFullYear();

  const mkGroup = (key: 'R2' | 'R4'): ForecastGroup => ({
    key,
    title: `${p} ${key}`,
    baseLabel: key,
    deductions: { title: 'Potongan', lines: [] },
    additions: { title: 'Penambah (Debet)', lines: [] },
    subtractions: { title: 'Pengurang (Kredit)', lines: [] },
  });

  const groups: Record<'R2' | 'R4', ForecastGroup> = { R2: mkGroup('R2'), R4: mkGroup('R4') };

  for (const r of rows || []) {
    const groupKey = String(r.group_key || '').toUpperCase();
    if (groupKey !== 'R2' && groupKey !== 'R4') continue;
    const section = String(r.section || '').toUpperCase();
    const id = String(r.id || genId(`${groupKey.toLowerCase()}-line`));
    const label = String(r.label || '').trim() || id;
    const values = normalizeMonthValues(r.values);
    if (section === 'BASE') {
      groups[groupKey as 'R2' | 'R4'].deductions.lines.unshift({ id, label, kind: 'base', values });
    } else if (section === 'DEDUCTION') {
      groups[groupKey as 'R2' | 'R4'].deductions.lines.push({ id, label, kind: 'deduction', values });
    } else if (section === 'ADDITION') {
      groups[groupKey as 'R2' | 'R4'].additions.lines.push({ id, label, kind: 'addition', values });
    } else if (section === 'SUBTRACTION') {
      groups[groupKey as 'R2' | 'R4'].subtractions.lines.push({ id, label, kind: 'subtraction', values });
    }
  }

  (Object.keys(groups) as Array<'R2' | 'R4'>).forEach((k) => {
    const g = groups[k];
    const hasBase = g.deductions.lines.some((x) => x.kind === 'base');
    if (!hasBase) g.deductions.lines.unshift({ id: `${k.toLowerCase()}-base`, label: k, kind: 'base', values: emptyMonths() });
  });

  return { version: 1, project: p, year: y, groups: [groups.R2, groups.R4] };
}

export default function BudgetForecastReport() {
  const { user } = useAuth();
  const canEdit = Boolean(user && user.role === 'SUPER_ADMIN');

  const [project, setProject] = useState('HARWAT');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [sheet, setSheet] = useState<ForecastSheet>(() => buildDefaultSheet('HARWAT', new Date().getFullYear()));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [storageMode, setStorageMode] = useState<'supabase' | 'local'>('supabase');
  const [estimateTotals, setEstimateTotals] = useState<{ R2: number[]; R4: number[] }>({ R2: emptyMonths(), R4: emptyMonths() });
  const [loadingEstimates, setLoadingEstimates] = useState(false);

  useEffect(() => {
    const p = String(project || '').trim().toUpperCase() || 'HARWAT';
    setProject(p);
  }, []);

  useEffect(() => {
    void loadSheet();
  }, [project, year]);

  useEffect(() => {
    void loadEstimateTotals();
  }, [project, year]);

  async function loadEstimateTotals() {
    const p = String(project || '').trim().toUpperCase() || 'HARWAT';
    const y = Number(year) || new Date().getFullYear();
    const startDate = `${y}-01-01`;
    const endDate = `${y}-12-31`;
    const nextYearStart = `${y + 1}-01-01`;

    const sums = { R2: emptyMonths(), R4: emptyMonths() };
    setLoadingEstimates(true);
    try {
      const pageSize = 500;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('work_orders')
          .select(
            `
            id,
            vehicle_entry_id,
            work_date,
            created_at,
            vehicle_entries (
              vehicles (vehicle_type)
            ),
            work_order_billings (total_price)
          `
          )
          .not('vehicle_entry_id', 'is', null)
          .gte('work_date', startDate)
          .lte('work_date', endDate)
          .range(from, from + pageSize - 1)
          .order('work_date', { ascending: true });
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];

        for (const wo of rows as any[]) {
          const vt = String(wo?.vehicle_entries?.vehicles?.vehicle_type || '').toUpperCase();
          const groupKey = vt.includes('R4') ? 'R4' : vt.includes('R2') || vt.includes('KECIL') ? 'R2' : '';
          if (!groupKey) continue;

          const dateStr = String(wo?.work_date || wo?.created_at || '').slice(0, 10);
          const d = dateStr ? new Date(dateStr) : null;
          const m = d && Number.isFinite(d.getTime()) ? d.getMonth() : -1;
          if (m < 0 || m > 11) continue;

          const total = (wo?.work_order_billings || []).reduce((acc: number, b: any) => acc + Number(b?.total_price || 0), 0);
          if (!Number.isFinite(total) || total === 0) continue;
          (sums as any)[groupKey][m] += total;
        }

        if (rows.length < pageSize) break;
        from += pageSize;
      }

      from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('work_orders')
          .select(
            `
            id,
            vehicle_entry_id,
            work_date,
            created_at,
            vehicle_entries (
              vehicles (vehicle_type)
            ),
            work_order_billings (total_price)
          `
          )
          .not('vehicle_entry_id', 'is', null)
          .is('work_date', null)
          .gte('created_at', startDate)
          .lt('created_at', nextYearStart)
          .range(from, from + pageSize - 1)
          .order('created_at', { ascending: true });
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];

        for (const wo of rows as any[]) {
          const vt = String(wo?.vehicle_entries?.vehicles?.vehicle_type || '').toUpperCase();
          const groupKey = vt.includes('R4') ? 'R4' : vt.includes('R2') || vt.includes('KECIL') ? 'R2' : '';
          if (!groupKey) continue;

          const dateStr = String(wo?.created_at || '').slice(0, 10);
          const d = dateStr ? new Date(dateStr) : null;
          const m = d && Number.isFinite(d.getTime()) ? d.getMonth() : -1;
          if (m < 0 || m > 11) continue;

          const total = (wo?.work_order_billings || []).reduce((acc: number, b: any) => acc + Number(b?.total_price || 0), 0);
          if (!Number.isFinite(total) || total === 0) continue;
          (sums as any)[groupKey][m] += total;
        }

        if (rows.length < pageSize) break;
        from += pageSize;
      }

      setEstimateTotals(sums);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.toLowerCase().includes('could not find the table')) {
        setEstimateTotals({ R2: emptyMonths(), R4: emptyMonths() });
        return;
      }
      toast.error('Gagal memuat total estimasi WO: ' + msg);
      setEstimateTotals({ R2: emptyMonths(), R4: emptyMonths() });
    } finally {
      setLoadingEstimates(false);
    }
  }

  async function loadSheet() {
    const p = String(project || '').trim().toUpperCase() || 'HARWAT';
    const y = Number(year) || new Date().getFullYear();
    setLoading(true);
    try {
      const { data: header, error: headerErr } = await supabase
        .from('budget_forecast_sheets' as any)
        .select('id,data')
        .eq('project', p)
        .eq('year', y)
        .maybeSingle();
      if (headerErr) throw headerErr;

      if (header?.id) {
        try {
          const { data: rows, error: linesErr } = await supabase
            .from('budget_forecast_lines' as any)
            .select('id,group_key,section,label,sort_order,values')
            .eq('sheet_id', header.id)
            .order('group_key', { ascending: true })
            .order('section', { ascending: true })
            .order('sort_order', { ascending: true });
          if (linesErr) throw linesErr;
          if ((rows || []).length > 0) {
            setSheet(buildSheetFromDb(p, y, rows || []));
            setStorageMode('supabase');
            return;
          }
        } catch {
        }
      }

      if (header?.data) {
        setSheet(header.data as any);
        setStorageMode('supabase');
        return;
      }

      const raw = localStorage.getItem(storageKey(p, y));
      if (raw) {
        setSheet(JSON.parse(raw));
        setStorageMode('local');
        return;
      }
      setSheet(buildDefaultSheet(p, y));
      setStorageMode('local');
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.toLowerCase().includes('could not find the table')) {
        const raw = localStorage.getItem(storageKey(p, y));
        if (raw) setSheet(JSON.parse(raw));
        else setSheet(buildDefaultSheet(p, y));
        setStorageMode('local');
        return;
      }
      toast.error('Gagal memuat forecasting: ' + msg);
      const raw = localStorage.getItem(storageKey(p, y));
      if (raw) setSheet(JSON.parse(raw));
      else setSheet(buildDefaultSheet(p, y));
      setStorageMode('local');
    } finally {
      setLoading(false);
    }
  }

  function toDbLines(s: ForecastSheet, sheetId: string) {
    const rows: any[] = [];
    for (const g of s.groups || []) {
      const groupKey = g.key;
      const base = g.deductions.lines.find((x) => x.kind === 'base');
      if (base) {
        rows.push({
          id: base.id,
          sheet_id: sheetId,
          group_key: groupKey,
          section: 'BASE',
          label: base.label,
          sort_order: 0,
          values: normalizeMonthValues(base.values),
        });
      }

      const deductions = g.deductions.lines.filter((x) => x.kind === 'deduction');
      deductions.forEach((l, idx) => {
        rows.push({
          id: l.id,
          sheet_id: sheetId,
          group_key: groupKey,
          section: 'DEDUCTION',
          label: l.label,
          sort_order: idx,
          values: normalizeMonthValues(l.values),
        });
      });

      g.additions.lines.forEach((l, idx) => {
        rows.push({
          id: l.id,
          sheet_id: sheetId,
          group_key: groupKey,
          section: 'ADDITION',
          label: l.label,
          sort_order: idx,
          values: normalizeMonthValues(l.values),
        });
      });

      g.subtractions.lines.forEach((l, idx) => {
        rows.push({
          id: l.id,
          sheet_id: sheetId,
          group_key: groupKey,
          section: 'SUBTRACTION',
          label: l.label,
          sort_order: idx,
          values: normalizeMonthValues(l.values),
        });
      });
    }
    return rows;
  }

  async function saveSheet() {
    if (!canEdit) {
      toast.error('Hanya Super Admin yang bisa menyimpan forecasting.');
      return;
    }
    if (saving) return;
    const p = String(project || '').trim().toUpperCase() || 'HARWAT';
    const y = Number(year) || new Date().getFullYear();
    setSaving(true);
    try {
      const payload = { ...sheet, project: p, year: y };
      const { data: saved, error } = await supabase
        .from('budget_forecast_sheets' as any)
        .upsert([{ project: p, year: y, data: payload }] as any, { onConflict: 'project,year' } as any)
        .select('id')
        .single();
      if (error) throw error;

      try {
        const sheetId = String(saved?.id || '');
        if (sheetId) {
          await supabase.from('budget_forecast_lines' as any).delete().eq('sheet_id', sheetId);
          const rows = toDbLines(payload as any, sheetId);
          if (rows.length > 0) {
            const { error: insErr } = await supabase.from('budget_forecast_lines' as any).insert(rows as any);
            if (insErr) throw insErr;
          }
        }
      } catch {
      }

      localStorage.setItem(storageKey(p, y), JSON.stringify(payload));
      setStorageMode('supabase');
      toast.success('Forecasting tersimpan.');
    } catch (e: any) {
      const msg = String(e?.message || e);
      localStorage.setItem(storageKey(p, y), JSON.stringify({ ...sheet, project: p, year: y }));
      setStorageMode('local');
      toast.success(msg.toLowerCase().includes('could not find the table') ? 'Tabel belum ada, tersimpan lokal.' : 'Tersimpan lokal.');
    } finally {
      setSaving(false);
    }
  }

  const computedByGroup = useMemo(() => {
    const out: Record<string, { nett: number[]; balance: number[]; base: ForecastLine; sections: ForecastSection[] }> = {};
    for (const g of sheet.groups || []) {
      const rawBase = g.deductions.lines.find((x) => x.kind === 'base') || g.deductions.lines[0];
      const base = rawBase || { id: `${g.key.toLowerCase()}-base`, label: g.baseLabel, kind: 'base', values: emptyMonths() };
      const deductions = g.deductions.lines.filter((x) => x.kind === 'deduction');
      const baseOverride = g.key === 'R2' ? estimateTotals.R2 : estimateTotals.R4;
      const nett = computeNett({ ...base, values: baseOverride }, deductions);
      const balance = computeBalance(nett, g.additions.lines, g.subtractions.lines);
      out[g.key] = { nett, balance, base: { ...base, values: baseOverride }, sections: [g.deductions, g.additions, g.subtractions] };
    }
    return out;
  }, [sheet, estimateTotals]);

  function setCell(groupKey: 'R2' | 'R4', lineId: string, monthIndex: number, value: number) {
    setSheet((prev) => {
      const next = deepClone(prev);
      const g = next.groups.find((x) => x.key === groupKey);
      if (!g) return prev;
      const allLines = [...g.deductions.lines, ...g.additions.lines, ...g.subtractions.lines];
      const line = allLines.find((x) => x.id === lineId);
      if (!line) return prev;
      line.values = Array.isArray(line.values) ? line.values : emptyMonths();
      line.values[monthIndex] = value;
      return next;
    });
  }

  function setLabel(groupKey: 'R2' | 'R4', lineId: string, value: string) {
    setSheet((prev) => {
      const next = deepClone(prev);
      const g = next.groups.find((x) => x.key === groupKey);
      if (!g) return prev;
      const allLines = [...g.deductions.lines, ...g.additions.lines, ...g.subtractions.lines];
      const line = allLines.find((x) => x.id === lineId);
      if (!line) return prev;
      line.label = String(value || '').trim();
      return next;
    });
  }

  function addLine(groupKey: 'R2' | 'R4', section: 'DEDUCTION' | 'ADDITION' | 'SUBTRACTION') {
    setSheet((prev) => {
      const next = deepClone(prev);
      const g = next.groups.find((x) => x.key === groupKey);
      if (!g) return prev;
      const id = genId(`${groupKey.toLowerCase()}-${section.toLowerCase()}`);
      if (section === 'DEDUCTION') g.deductions.lines.push({ id, label: 'Baris baru', kind: 'deduction', values: emptyMonths() });
      if (section === 'ADDITION') g.additions.lines.push({ id, label: 'Baris baru', kind: 'addition', values: emptyMonths() });
      if (section === 'SUBTRACTION') g.subtractions.lines.push({ id, label: 'Baris baru', kind: 'subtraction', values: emptyMonths() });
      return next;
    });
  }

  function removeLine(groupKey: 'R2' | 'R4', lineId: string) {
    setSheet((prev) => {
      const next = deepClone(prev);
      const g = next.groups.find((x) => x.key === groupKey);
      if (!g) return prev;
      g.deductions.lines = g.deductions.lines.filter((x) => x.kind === 'base' || x.id !== lineId);
      g.additions.lines = g.additions.lines.filter((x) => x.id !== lineId);
      g.subtractions.lines = g.subtractions.lines.filter((x) => x.id !== lineId);
      return next;
    });
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    for (const g of sheet.groups || []) {
      const computed = computedByGroup[g.key];
      const base = computed?.base;
      const baseValues = base?.values || emptyMonths();
      const deductions = g.deductions.lines.filter((x) => x.kind === 'deduction');
      const additions = g.additions.lines;
      const subtractions = g.subtractions.lines;
      const nett = computed?.nett || emptyMonths();
      const balance = computed?.balance || emptyMonths();

      const aoa: any[][] = [];
      aoa.push([`FORCASTING PROJECT ${sheet.project} ${g.key} (${sheet.year})`]);
      aoa.push([]);
      aoa.push(['PAGU Anggaran', ...MONTHS]);

      const pushLine = (label: string, values: number[], showZero = false) => {
        aoa.push([label, ...values.map((v) => (showZero ? Number(v || 0) : (v ? Number(v) : '')))]);
      };

      pushLine(base?.label || g.baseLabel, baseValues, true);
      if (deductions.length > 0) {
        aoa.push([g.deductions.title]);
        for (const l of deductions) pushLine(l.label, l.values, false);
      }
      pushLine('Nett', nett, true);

      if (additions.length > 0) {
        aoa.push([]);
        aoa.push([g.additions.title]);
        for (const l of additions) pushLine(l.label, l.values, false);
      }

      if (subtractions.length > 0) {
        aoa.push([]);
        aoa.push([g.subtractions.title]);
        for (const l of subtractions) pushLine(l.label, l.values, false);
      }

      aoa.push([]);
      pushLine('Sisa Pagu yang dapat digunakan', balance, true);

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, g.title.substring(0, 31));
    }

    const safeProject = String(sheet.project || 'FORECAST').replace(/[^a-z0-9_-]+/gi, '_');
    XLSX.writeFile(wb, `Forecasting_Anggaran_${safeProject}_${sheet.year}.xlsx`);
  }

  const headerRight = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Project</span>
        <Input value={project} onChange={(e) => setProject(e.target.value)} className="w-36" />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Tahun</span>
        <Input
          value={String(year)}
          onChange={(e) => setYear(Number(parseNumber(e.target.value)) || new Date().getFullYear())}
          className="w-24"
        />
      </div>
      <Button variant="outline" onClick={() => setEditMode((v) => !v)} disabled={!canEdit}>
        {editMode ? 'Selesai Edit' : 'Edit'}
      </Button>
      <Button variant="outline" onClick={exportExcel}>
        <Download className="h-4 w-4 mr-2" />
        Export Excel
      </Button>
      <Button onClick={saveSheet} disabled={!canEdit || saving}>
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Simpan
      </Button>
    </div>
  );

  const renderGroup = (g: ForecastGroup) => {
    const computed = computedByGroup[g.key];
    const base = computed?.base;
    const baseValues = base?.values || emptyMonths();
    const deductions = g.deductions.lines.filter((x) => x.kind === 'deduction');
    const nett = computed?.nett || emptyMonths();
    const balance = computed?.balance || emptyMonths();

    const renderLineRow = (line: ForecastLine, showZero = false) => (
      <tr key={line.id} className="border-t">
        <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap sticky left-0 z-10 bg-white border-r">
          {editMode && canEdit && line.kind !== 'base' ? (
            <div className="flex items-center gap-2">
              <Input value={line.label} onChange={(e) => setLabel(g.key, line.id, e.target.value)} className="h-8 w-80" />
              <Button variant="ghost" size="icon" onClick={() => removeLine(g.key, line.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <span>{line.label}</span>
          )}
        </td>
        {MONTHS.map((_, idx) => {
          const computedValue = line.kind === 'base' ? Number(baseValues[idx] || 0) : Number(line.values?.[idx] || 0);
          const val = computedValue;
          const canEditCell = editMode && canEdit && line.kind !== 'base';
          return (
            <td key={`${line.id}-${idx}`} className="px-2 py-1 text-right whitespace-nowrap">
              {canEditCell ? (
                <Input
                  value={val === 0 ? '' : String(val)}
                  onChange={(e) => setCell(g.key, line.id, idx, parseNumber(e.target.value))}
                  className="h-8 w-28 text-right"
                />
              ) : (
                <span className="tabular-nums">{formatNumber(val, showZero)}</span>
              )}
            </td>
          );
        })}
      </tr>
    );

    const renderComputedRow = (label: string, values: number[]) => (
      <tr className="border-t bg-slate-50">
        <td className="px-3 py-2 font-semibold text-slate-900 whitespace-nowrap sticky left-0 z-10 bg-slate-50 border-r">{label}</td>
        {values.map((v, idx) => (
          <td key={`${label}-${idx}`} className="px-2 py-1 text-right whitespace-nowrap font-semibold">
            <span className="tabular-nums">{formatNumber(v, true)}</span>
          </td>
        ))}
      </tr>
    );

    const renderSectionTitle = (title: string) => (
      <tr className="border-t bg-slate-100">
        <td colSpan={13} className="px-3 py-2 font-semibold text-slate-800">
          {title}
        </td>
      </tr>
    );

    const allAddition = sumMonths(g.additions.lines);
    const allSubtraction = sumMonths(g.subtractions.lines);

    return (
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{g.title}</CardTitle>
          <div className="text-xs text-muted-foreground">
            Mode simpan: {storageMode === 'supabase' ? 'Supabase' : 'Lokal'} {loading ? '• memuat...' : ''}{' '}
            {loadingEstimates ? '• hitung estimasi...' : ''}
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-x-auto">
            <table className="min-w-[1400px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 sticky left-0 z-20 bg-slate-50 border-r">
                    PAGU Anggaran
                  </th>
                  {MONTHS.map((m) => (
                    <th key={m} className="px-2 py-2 text-right font-semibold text-slate-700 whitespace-nowrap">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {base ? renderLineRow(base, true) : null}
                {renderSectionTitle(g.deductions.title)}
                {deductions.map((l) => renderLineRow(l, false))}
                {editMode && canEdit ? (
                  <tr className="border-t">
                    <td colSpan={13} className="px-3 py-2">
                      <Button variant="outline" size="sm" onClick={() => addLine(g.key, 'DEDUCTION')}>
                        <Plus className="h-4 w-4 mr-2" />
                        Tambah Baris Potongan
                      </Button>
                    </td>
                  </tr>
                ) : null}
                {renderComputedRow('Nett', nett)}

                {renderSectionTitle(g.additions.title)}
                {g.additions.lines.map((l) => renderLineRow(l, false))}
                {editMode && canEdit ? (
                  <tr className="border-t">
                    <td colSpan={13} className="px-3 py-2">
                      <Button variant="outline" size="sm" onClick={() => addLine(g.key, 'ADDITION')}>
                        <Plus className="h-4 w-4 mr-2" />
                        Tambah Baris Penambah
                      </Button>
                    </td>
                  </tr>
                ) : null}
                {renderComputedRow('Total Penambah', allAddition)}

                {renderSectionTitle(g.subtractions.title)}
                {g.subtractions.lines.map((l) => renderLineRow(l, false))}
                {editMode && canEdit ? (
                  <tr className="border-t">
                    <td colSpan={13} className="px-3 py-2">
                      <Button variant="outline" size="sm" onClick={() => addLine(g.key, 'SUBTRACTION')}>
                        <Plus className="h-4 w-4 mr-2" />
                        Tambah Baris Pengurang
                      </Button>
                    </td>
                  </tr>
                ) : null}
                {renderComputedRow('Total Pengurang', allSubtraction)}

                {renderComputedRow('Sisa Pagu yang dapat digunakan', balance)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-4 space-y-6">
      <Card className="border-slate-200">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Forecasting Anggaran</CardTitle>
            <div className="text-sm text-muted-foreground mt-1">
              Format mengikuti sheet “FORCASTING PROJECT … R2 & R4” (Pagu, Potongan, Nett, Penambah, Pengurang, Sisa Pagu).
            </div>
          </div>
          {headerRight}
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground">
            Catatan: hanya Super Admin yang dapat mengubah & menyimpan. Pengguna lain dapat melihat dan export.
          </div>
        </CardContent>
      </Card>

      {sheet.groups.map((g) => (
        <div key={g.key}>{renderGroup(g)}</div>
      ))}
    </div>
  );
}
