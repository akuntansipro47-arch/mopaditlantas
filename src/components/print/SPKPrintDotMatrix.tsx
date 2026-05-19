import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import { incrementDocumentPrintCounter } from '@/lib/printCounter';

function padRight(v: string, len: number) {
  const s = String(v ?? '');
  if (s.length >= len) return s.slice(0, len);
  return s + ' '.repeat(len - s.length);
}

function padLeft(v: string, len: number) {
  const s = String(v ?? '');
  if (s.length >= len) return s.slice(-len);
  return ' '.repeat(len - s.length) + s;
}

function wrapText(v: string, width: number) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return ['-'];
  const lines: string[] = [];
  let i = 0;
  while (i < s.length) {
    lines.push(s.slice(i, i + width));
    i += width;
  }
  return lines;
}

function line(width: number, ch = '-') {
  return ch.repeat(width);
}

interface SPKDotProps {
  id: string;
}

export default function SPKPrintDotMatrix({ id }: SPKDotProps) {
  const [loading, setLoading] = useState(true);
  const [agency, setAgency] = useState<any>(null);
  const [wo, setWo] = useState<any>(null);
  const [entry, setEntry] = useState<any>(null);
  const [printCount, setPrintCount] = useState<number>(1);
  const lockedRef = useRef(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  useEffect(() => {
    const handler = async () => {
      if (lockedRef.current) return;
      lockedRef.current = true;
      try {
        let metaUser: any = null;
        try {
          metaUser = JSON.parse(localStorage.getItem('app_user') || 'null');
        } catch {
          metaUser = null;
        }
        const { error } = await supabase
          .from('work_orders')
          .update({
            is_locked: true,
            locked_at: new Date().toISOString(),
            locked_by_username: metaUser?.username || null,
            locked_by_role: metaUser?.role || null,
            lock_reason: 'PRINT_SPK',
          } as any)
          .eq('id', id);
        if (error) return;
      } catch {
        return;
      }
    };
    window.addEventListener('afterprint', handler);
    return () => window.removeEventListener('afterprint', handler);
  }, [id]);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: agencyData } = await supabase.from('agency_profile').select('*').single();
      setAgency(agencyData);

      const { data: woData, error: woErr } = await supabase
        .from('work_orders')
        .select('*, mechanics (*), vehicle_entries (*, vehicles (*))')
        .eq('id', id)
        .single();
      if (woErr) throw woErr;
      setWo(woData);

      let entryData: any = null;
      if (woData?.vehicle_entry_id) {
        const { data: ve, error: veErr } = await supabase
          .from('vehicle_entries')
          .select('*, vehicle_entry_jobs (*, job_types (*)), vehicle_entry_spareparts (*)')
          .eq('id', woData.vehicle_entry_id)
          .single();
        if (veErr) throw veErr;

        let spareparts = (ve as any)?.vehicle_entry_spareparts || [];
        const supportsGoodsId = async () => {
          const { error } = await supabase.from('vehicle_entry_spareparts' as any).select('goods_id' as any).limit(1);
          return !error;
        };
        const hasGoodsId = await supportsGoodsId();
        if (hasGoodsId) {
          const goodsIds = spareparts.map((sp: any) => sp.goods_id).filter(Boolean);
          if (goodsIds.length > 0) {
            const { data: goodsData, error: goodsErr } = await supabase.from('goods').select('id, name, unit, item_code').in('id', goodsIds);
            if (goodsErr) throw goodsErr;
            const goodsMap = new Map((goodsData || []).map((g: any) => [String(g.id), g]));
            spareparts = spareparts.map((sp: any) => ({
              ...sp,
              goods: sp.goods_id ? goodsMap.get(String(sp.goods_id)) || null : null,
            }));
          }
        }

        entryData = { ...ve, vehicle_entry_spareparts: spareparts };
      }
      setEntry(entryData);

      const cnt = await incrementDocumentPrintCounter('SPK', String(id));
      setPrintCount(cnt);

      setTimeout(() => {
        window.print();
      }, 500);
    } catch (e) {
      console.error('Error fetching SPK:', e);
    } finally {
      setLoading(false);
    }
  }

  const content = useMemo(() => {
    if (!wo) return '';
    const WIDTH = 80;

    const agencyName = String(agency?.name || 'INSTANSI BELUM DISETTING').toUpperCase();
    const agencyAddress = String(agency?.address || '');
    const agencyPhone = String(agency?.phone || '');
    const agencyEmail = String(agency?.email || '');

    const woNumber = String(wo.wo_number || '-');
    const woDate = String(wo.work_date || '').replace(/-/g, '/');
    const dateLabel = `TGL ${woDate || '-'}`;
    const dateCol = Math.max(12, dateLabel.length);

    const v = wo.vehicle_entries?.vehicles;
    const licensePlate = String(v?.license_plate || '-');
    const brandType = String(v?.brand_type || '-');
    const nota = String(wo.vehicle_entries?.nota_dinas_number || '-');
    const mechanicName = String(wo.mechanics?.name || '-');
    const mechanicSpec = String(wo.mechanics?.specialization || '-');

    const copyLines =
      printCount > 1
        ? [padRight(`*** COPY SPK - CETAKAN KE-${printCount} ***`, WIDTH), line(WIDTH, '-')]
        : [];

    const headerLines = [
      padRight(agencyName, WIDTH),
      padRight(agencyAddress, WIDTH),
      padRight([agencyPhone ? `Telp: ${agencyPhone}` : '', agencyEmail ? `Email: ${agencyEmail}` : ''].filter(Boolean).join(' | '), WIDTH),
      line(WIDTH, '='),
      ...copyLines,
      padRight(`SURAT PERINTAH KERJA  ${woNumber}`, WIDTH - dateCol) + padLeft(dateLabel, dateCol),
      padRight(`CETAKAN KE-${printCount}`, WIDTH),
      line(WIDTH, '-'),
      padRight(`NO. POL  : ${licensePlate}`, WIDTH),
      padRight(`TIPE     : ${brandType}`, WIDTH),
      padRight(`NOTA     : ${nota}`, WIDTH),
      padRight(`MEKANIK  : ${mechanicName}`, WIDTH),
      padRight(`SPESIALIS: ${mechanicSpec}`, WIDTH),
      line(WIDTH, '='),
    ];

    const jobs = Array.isArray(entry?.vehicle_entry_jobs) ? entry.vehicle_entry_jobs : [];
    const parts = Array.isArray(entry?.vehicle_entry_spareparts) ? entry.vehicle_entry_spareparts : [];

    const jobLines: string[] = [];
    jobLines.push(padRight('DETAIL PEKERJAAN', WIDTH));
    jobLines.push(line(WIDTH, '-'));
    const jobColNo = 3;
    const jobColName = 56;
    const jobColNA = 5;
    const jobHead = padRight('NO', jobColNo) + ' ' + padRight('PEKERJAAN', jobColName) + ' ' + padRight('N/A', jobColNA);
    jobLines.push(jobHead);
    jobLines.push(line(WIDTH, '-'));
    if (jobs.length === 0) {
      jobLines.push(padRight('-', WIDTH));
    } else {
      jobs.forEach((j: any, idx: number) => {
        const group = String(j?.job_types?.job_group || '').trim();
        const name = String(j?.job_types?.job_name || j?.notes || '-').trim();
        const label = group ? `${group} - ${name}` : name;
        const na = Boolean(j?.value_only) ? 'N/A' : '';
        const lines = wrapText(label, jobColName);
        lines.forEach((seg, i) => {
          if (i === 0) {
            jobLines.push(padLeft(String(idx + 1), jobColNo) + ' ' + padRight(seg, jobColName) + ' ' + padRight(na, jobColNA));
          } else {
            jobLines.push(padRight('', jobColNo) + ' ' + padRight(seg, jobColName));
          }
        });
      });
    }

    const partLines: string[] = [];
    partLines.push('');
    partLines.push(padRight('ESTIMASI SPAREPART', WIDTH));
    partLines.push(line(WIDTH, '-'));
    const colNo = 3;
    const colName = 48;
    const colQty = 6;
    const colUnit = 8;
    const colNA = 5;
    const head =
      padRight('NO', colNo) +
      ' ' +
      padRight('NAMA SPAREPART', colName) +
      ' ' +
      padLeft('QTY', colQty) +
      ' ' +
      padRight('UNIT', colUnit) +
      ' ' +
      padRight('N/A', colNA);
    partLines.push(head);
    partLines.push(line(WIDTH, '-'));
    if (parts.length === 0) {
      partLines.push(padRight('-', WIDTH));
    } else {
      parts.forEach((sp: any, idx: number) => {
        const name = String(sp?.goods?.name || sp?.item_name || 'Nama tidak ditemukan').trim();
        const qty = Number(sp?.qty || 0);
        const unit = String(sp?.goods?.unit || '-').toUpperCase();
        const na = Boolean(sp?.value_only) ? 'N/A' : '';
        const nameParts = wrapText(name, colName);
        nameParts.forEach((seg, i) => {
          if (i === 0) {
            partLines.push(
              padLeft(String(idx + 1), colNo) +
                ' ' +
                padRight(seg, colName) +
                ' ' +
                padLeft(String(qty || ''), colQty) +
                ' ' +
                padRight(unit, colUnit) +
                ' ' +
                padRight(na, colNA)
            );
          } else {
            partLines.push(padRight('', colNo) + ' ' + padRight(seg, colName));
          }
        });
      });
    }

    const footerLines = [
      '',
      line(WIDTH, '-'),
      padRight('Pemohon,', 26) + padRight('Disetujui,', 27) + padRight('Mekanik,', 27),
      '',
      padRight('______________', 26) + padRight('______________', 27) + padRight(mechanicName || '______________', 27),
    ];

    return [...headerLines, ...jobLines, ...partLines, ...footerLines].join('\n');
  }, [agency, entry, printCount, wo]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!wo) return <div>Data WO tidak ditemukan.</div>;

  return (
    <div className="printable-area min-h-screen bg-white p-0">
      <pre className="spk-dotmatrix">{content}</pre>
      <style>{`
        .spk-dotmatrix {
          font-family: "Courier New", Courier, monospace;
          font-size: 13pt;
          line-height: 1.15;
          font-weight: 700;
          letter-spacing: 0.1px;
          white-space: pre;
          margin: 0;
          padding: 5mm 0 0 3mm;
        }
        @media print {
          @page { size: 241mm 279mm; margin: 10mm 1mm 6mm 2mm; }
          html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
          .printable-area { position: static !important; left: auto !important; top: auto !important; width: auto !important; }
        }
      `}</style>
    </div>
  );
}
