import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

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

function formatMoney(v: number) {
  const n = Math.round(Number(v) || 0);
  const sign = n < 0 ? '-' : '';
  const s = String(Math.abs(n));
  const out = s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return sign + out;
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

interface POPrintProps {
  id: string;
}

export default function PurchaseOrderPrintDotMatrix({ id }: POPrintProps) {
  const [po, setPo] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [agency, setAgency] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
      const { data: agencyData } = await supabase.from('agency_profile').select('*').single();
      setAgency(agencyData);

      const { data: poData, error: poError } = await supabase
        .from('purchase_orders')
        .select(
          `
          *,
          suppliers (*),
          work_orders (
             wo_number,
             vehicle_entries (
                nota_dinas_number,
                vehicles (license_plate, brand_type)
             )
          )
        `
        )
        .eq('id', id)
        .single();

      if (poError) throw poError;
      setPo(poData);

      const { data: itemData, error: itemError } = await supabase
        .from('purchase_order_items')
        .select(
          `
          *,
          goods (name, unit, item_code)
        `
        )
        .eq('po_id', id)
        .order('created_at', { ascending: true });

      if (itemError) throw itemError;
      setItems(itemData || []);

      setTimeout(() => {
        window.print();
      }, 500);
    } catch (error) {
      console.error('Error fetching PO:', error);
    } finally {
      setLoading(false);
    }
  }

  const content = useMemo(() => {
    if (!po) return '';
    const WIDTH = 80;

    const agencyName = String(agency?.name || 'INSTANSI BELUM DISETTING').toUpperCase();
    const agencyAddress = String(agency?.address || '');
    const agencyPhone = String(agency?.phone || '');
    const agencyEmail = String(agency?.email || '');

    const poNumber = String(po.po_number || '-');
    const poDate = String(po.po_date || '').replace(/-/g, '/');

    const supplierName = String(po.suppliers?.name || '-');
    const supplierAddress = String(po.suppliers?.address || '-');
    const supplierPhone = String(po.suppliers?.phone || '-');

    const woNumber = String(po.work_orders?.wo_number || '-');
    const vehiclePlate = String(po.work_orders?.vehicle_entries?.vehicles?.license_plate || '-');
    const vehicleName = String(po.work_orders?.vehicle_entries?.vehicles?.brand_type || '-');

    const headerLines = [
      padRight(agencyName, WIDTH),
      padRight(agencyAddress, WIDTH),
      padRight([agencyPhone ? `Telp: ${agencyPhone}` : '', agencyEmail ? `Email: ${agencyEmail}` : ''].filter(Boolean).join(' | '), WIDTH),
      line(WIDTH, '='),
      padRight(`PURCHASE ORDER  ${poNumber}`, WIDTH - 12) + padLeft(`TGL ${poDate}`, 12),
      line(WIDTH, '-'),
      padRight(`SUPPLIER : ${supplierName}`, WIDTH),
      padRight(`ALAMAT   : ${supplierAddress}`, WIDTH),
      padRight(`TELP     : ${supplierPhone}`, WIDTH),
    ];

    const projectLines = po.work_order_id
      ? [
          padRight(`TIPE     : PROJECT (WO)`, WIDTH),
          padRight(`NO. WO   : ${woNumber}`, WIDTH),
          padRight(`KENDARAAN: ${vehiclePlate} ${vehicleName}`, WIDTH),
        ]
      : [padRight(`TIPE     : STOK GUDANG`, WIDTH)];

    const colNo = 3;
    const colName = 28;
    const colBrand = 10;
    const colQty = 4;
    const colUnit = 4;
    const colPrice = 10;
    const colTotal = 10;

    const head =
      padRight('NO', colNo) +
      ' ' +
      padRight('NAMA BARANG', colName) +
      ' ' +
      padRight('MERK', colBrand) +
      ' ' +
      padLeft('QTY', colQty) +
      ' ' +
      padRight('UNIT', colUnit) +
      ' ' +
      padLeft('HARGA', colPrice) +
      ' ' +
      padLeft('TOTAL', colTotal);

    const itemLines: string[] = [];
    items.forEach((it, idx) => {
      const no = String(idx + 1);
      const name = String(it.goods?.name || it.estimated_name || '-');
      const brand = String(it.brand || '-');
      const qty = Number(it.quantity || 0);
      const unit = String(it.goods?.unit || '-').toUpperCase();
      const price = Number(it.unit_price || 0);
      const total = Number(it.total_price || qty * price);

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
              padRight(unit, colUnit) +
              ' ' +
              padLeft(formatMoney(price), colPrice) +
              ' ' +
              padLeft(formatMoney(total), colTotal)
          );
        } else {
          itemLines.push(padRight('', colNo) + ' ' + padRight(namePart, colName));
        }
      });
    });

    const totalAmount = Number(po.total_amount || items.reduce((s, it) => s + Number(it.total_price || 0), 0));
    const footerLines = [
      line(WIDTH, '-'),
      padRight('', WIDTH - 15) + padLeft(`TOTAL: ${formatMoney(totalAmount)}`, 15),
      '',
      padRight('Dibuat Oleh,', 26) + padRight('Disetujui Oleh,', 27) + padRight('Diketahui Oleh,', 27),
      '',
      padRight('______________', 26) + padRight('______________', 27) + padRight('______________', 27),
    ];

    return [...headerLines, ...projectLines, line(WIDTH, '-'), head, line(WIDTH, '-'), ...itemLines, ...footerLines].join('\n');
  }, [agency, items, po]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!po) return <div>Data PO tidak ditemukan.</div>;

  return (
    <div className="min-h-screen bg-white p-0">
      <pre className="po-dotmatrix">{content}</pre>
      <style>{`
        .po-dotmatrix {
          font-family: "Courier New", Courier, monospace;
          font-size: 9pt;
          line-height: 1.15;
          white-space: pre;
          margin: 0;
          padding: 0;
        }
        @media print {
          @page { size: 241mm 140mm; margin: 4mm; }
          html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
