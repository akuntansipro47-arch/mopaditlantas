import { useEffect, useMemo, useState } from 'react';
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

interface PRPrintProps {
  id: string;
}

export default function PurchaseRequestPrintDotMatrix({ id }: PRPrintProps) {
  const [pr, setPr] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [agency, setAgency] = useState<any>(null);
  const [printCount, setPrintCount] = useState<number>(1);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
      const { data: agencyData } = await supabase.from('agency_profile').select('*').single();
      setAgency(agencyData);

      const { data: prData, error: prError } = await supabase
        .from('purchase_requests')
        .select(
          `
          *,
          work_orders (
             wo_number,
             vehicle_entries (
                vehicles (license_plate, brand_type)
             )
          )
        `
        )
        .eq('id', id)
        .single();

      if (prError) throw prError;
      setPr(prData);

      const { data: itemData, error: itemError } = await supabase
        .from('purchase_request_items')
        .select(
          `
          *,
          goods (name, unit, item_code),
          job_types (job_name)
        `
        )
        .eq('purchase_request_id', id)
        .order('created_at', { ascending: true });

      if (itemError) throw itemError;
      setItems(itemData || []);

      const cnt = await incrementDocumentPrintCounter('PR', String(id));
      setPrintCount(cnt);

      setTimeout(() => {
        window.print();
      }, 500);
    } catch (error) {
      console.error('Error fetching PR:', error);
    } finally {
      setLoading(false);
    }
  }

  const content = useMemo(() => {
    if (!pr) return '';
    const WIDTH = 80;

    const agencyName = String(agency?.name || 'INSTANSI BELUM DISETTING').toUpperCase();
    const agencyAddress = String(agency?.address || '');
    const agencyPhone = String(agency?.phone || '');
    const agencyEmail = String(agency?.email || '');

    const prNumber = String(pr.pr_number || '-');
    const prDateSource = String(pr.pr_date || String(pr.created_at || '').slice(0, 10) || '');
    const prDate = prDateSource ? String(prDateSource).replace(/-/g, '/') : '';
    const dateLabel = `TGL ${prDate || '-'}`;
    const dateCol = Math.max(12, dateLabel.length);

    const woNumber = String(pr.work_orders?.wo_number || '-');
    const ve = Array.isArray(pr.work_orders?.vehicle_entries) ? pr.work_orders?.vehicle_entries[0] : pr.work_orders?.vehicle_entries;
    const vehiclePlate = String(ve?.vehicles?.license_plate || '-');
    const vehicleName = String(ve?.vehicles?.brand_type || '-');

    const copyLines =
      printCount > 1
        ? [padRight(`*** COPY PR - CETAKAN KE-${printCount} ***`, WIDTH), line(WIDTH, '-')]
        : [];

    const headerLines = [
      padRight(agencyName, WIDTH),
      padRight(agencyAddress, WIDTH),
      padRight([agencyPhone ? `Telp: ${agencyPhone}` : '', agencyEmail ? `Email: ${agencyEmail}` : ''].filter(Boolean).join(' | '), WIDTH),
      line(WIDTH, '='),
      ...copyLines,
      padRight(`PERMINTAAN BARANG  ${prNumber}`, WIDTH - dateCol) + padLeft(dateLabel, dateCol),
      padRight(`CETAKAN KE-${printCount}`, WIDTH),
      line(WIDTH, '-'),
      padRight(`NO. WO   : ${woNumber}`, WIDTH),
      padRight(`KENDARAAN: ${vehiclePlate} ${vehicleName}`, WIDTH),
      line(WIDTH, '-'),
    ];

    const colNo = 3;
    const colName = 40;
    const colBrand = 15;
    const colQty = 6;
    const colUnit = 8;

    const head =
      padRight('NO', colNo) +
      ' ' +
      padRight('NAMA BARANG / JASA', colName) +
      ' ' +
      padRight('MERK', colBrand) +
      ' ' +
      padLeft('QTY', colQty) +
      ' ' +
      padRight('UNIT', colUnit);

    const itemLines: string[] = [];
    items.forEach((it, idx) => {
      const no = String(idx + 1);
      const name = it.line_type === 'PART' 
        ? String(it.goods?.name || it.notes || '-') 
        : String(it.job_types?.job_name || it.service_name || '-');
      const brand = String(it.brand || '-');
      const qty = Number(it.quantity || 0);
      const unit = it.line_type === 'PART' 
        ? String(it.goods?.unit || '-').toUpperCase() 
        : 'JASA';

      const nameParts = wrapText(name, colName);
      nameParts.forEach((namePart, nameIdx) => {
        if (nameIdx === 0) {
          itemLines.push(
            padLeft(no, colNo) +
              ' ' +
              padRight(namePart, colName) +
              ' ' +
              padRight(brand, colBrand) +
              ' ' +
              padLeft(String(qty), colQty) +
              ' ' +
              padRight(unit, colUnit)
          );
        } else {
          itemLines.push(padRight('', colNo) + ' ' + padRight(namePart, colName));
        }
      });
    });

    const footerLines = [
      line(WIDTH, '-'),
      '',
      padRight('Catatan: ' + (pr.notes || '-'), WIDTH),
      '',
      padRight('Diminta Oleh,', 40) + padRight('Disetujui Oleh,', 40),
      '',
      padRight('______________', 40) + padRight('______________', 40),
    ];

    return [...headerLines, head, line(WIDTH, '-'), ...itemLines, ...footerLines].join('\n');
  }, [agency, items, pr, printCount]);

  const lineCount = useMemo(() => {
    if (!content) return 0;
    return content.split('\n').length;
  }, [content]);

  const printVars = useMemo(() => {
    const pb = lineCount > 42 ? 0 : lineCount > 38 ? 1 : 2;
    return {
      ['--pr-pad-bottom' as any]: `${pb}mm`,
    };
  }, [lineCount]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!pr) return <div>Data Purchase Request tidak ditemukan.</div>;

  return (
    <div className="printable-area min-h-screen bg-white p-0" style={printVars}>
      <pre className="pr-dotmatrix">{content}</pre>
      <style>{`
        .pr-dotmatrix {
          font-family: "Courier New", Courier, monospace;
          font-size: 13pt;
          line-height: 1.15;
          font-weight: 700;
          letter-spacing: 0.1px;
          white-space: pre;
          margin: 0;
          padding: 5mm 0 var(--pr-pad-bottom, 0mm) 3mm;
        }
        @media print {
          @page { size: 241mm 140mm; margin: 10mm 1mm 4mm 2mm; }
          html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
          .printable-area { position: static !important; left: auto !important; top: auto !important; width: auto !important; }
        }
      `}</style>
    </div>
  );
}
