import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';

interface GoodsReceiptPrintProps {
  id: string;
}

export default function GoodsReceiptPrint({ id }: GoodsReceiptPrintProps) {
  const [receipt, setReceipt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [agency, setAgency] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
      const { data: agencyData } = await supabase.from('agency_profile').select('*').single();
      setAgency(agencyData);

      const { data: receiptData, error: receiptError } = await supabase
        .from('goods_receipts')
        .select(`
          *,
          purchase_orders (
            po_number,
            suppliers (name),
            work_orders (
              wo_number,
              vehicle_entries (
                nota_dinas_number,
                vehicles (license_plate, brand_type, vehicle_type)
              )
            )
          ),
          items:goods_receipt_items (
            *,
            goods (name, unit, item_code)
          )
        `)
        .eq('id', id)
        .single();

      if (receiptError) throw receiptError;
      setReceipt(receiptData);

      setTimeout(() => {
        window.print();
      }, 700);
    } catch (e) {
      console.error('Error fetching Goods Receipt:', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!receipt) return <div>Data Penerimaan Barang tidak ditemukan.</div>;

  return (
    <div className="printable-area p-2 max-w-[210mm] mx-auto bg-white min-h-screen text-[10px] font-sans leading-tight">
      <div className="border-b-2 border-black pb-1 mb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            {agency?.logo_url && (
              <img src={agency.logo_url} alt="Logo" className="h-12 w-auto object-contain" />
            )}
            <div>
              <h1 className="text-lg font-bold uppercase tracking-wider">{agency?.name || 'INSTANSI BELUM DISETTING'}</h1>
              <p className="text-sm font-bold mt-0.5">BUKTI PENERIMAAN BARANG</p>
              <p className="text-gray-600 w-64 text-[9px] mt-0.5 leading-tight">
                {agency?.address}<br />
                {agency?.phone && `Telp: ${agency.phone}`} {agency?.email && `| Email: ${agency.email}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="mb-0.5">
              <span className="font-bold block text-sm">{receipt.receipt_number}</span>
              <span className="text-gray-500 text-[9px]">NO. TRANSAKSI</span>
            </div>
            <div>
              <span className="block text-[10px]">{formatDate(receipt.receipt_date)}</span>
              <span className="text-gray-500 text-[9px]">TANGGAL TERIMA</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border border-gray-400 p-1.5 rounded-sm mb-2">
        <h3 className="font-bold border-b border-gray-300 pb-0.5 mb-0.5 text-[9px] uppercase text-gray-500">INFORMASI PO / PROJECT</h3>
        <div className="grid grid-cols-2 gap-4 text-[9px]">
          <div className="grid grid-cols-[80px_1fr] gap-0.5">
            <span className="text-gray-500">No. PO:</span>
            <span className="font-medium">{receipt.purchase_orders?.po_number || '-'}</span>

            <span className="text-gray-500">Supplier:</span>
            <span className="font-medium">{receipt.purchase_orders?.suppliers?.name || '-'}</span>

            <span className="text-gray-500">Catatan:</span>
            <span className="font-medium">{receipt.notes || '-'}</span>
          </div>
          <div className="grid grid-cols-[80px_1fr] gap-0.5">
            <span className="text-gray-500">No. WO:</span>
            <span className="font-medium">{receipt.purchase_orders?.work_orders?.wo_number || '-'}</span>

            <span className="text-gray-500">No. Nota:</span>
            <span className="font-medium">{receipt.purchase_orders?.work_orders?.vehicle_entries?.nota_dinas_number || '-'}</span>

            <span className="text-gray-500">Kendaraan:</span>
            <span className="font-medium">
              {receipt.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.license_plate || '-'}{' '}
              {receipt.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.brand_type ? `(${receipt.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.brand_type})` : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="border border-gray-400 rounded-sm overflow-hidden mb-2">
        <table className="w-full text-[9px]">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-400">
              <th className="p-1 text-left font-bold w-10">No</th>
              <th className="p-1 text-left font-bold">Barang</th>
              <th className="p-1 text-left font-bold w-24">Kode</th>
              <th className="p-1 text-center font-bold w-20">Qty</th>
              <th className="p-1 text-left font-bold w-20">Satuan</th>
              <th className="p-1 text-left font-bold">Catatan</th>
            </tr>
          </thead>
          <tbody>
            {(receipt.items || []).length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center italic text-gray-500">Tidak ada item.</td>
              </tr>
            ) : (
              (receipt.items || []).map((it: any, idx: number) => (
                <tr key={it.id} className="border-b border-gray-200">
                  <td className="p-1 align-top">{idx + 1}</td>
                  <td className="p-1 align-top">
                    <div className="font-medium">{it.goods?.name || '-'}</div>
                  </td>
                  <td className="p-1 align-top">{it.goods?.item_code || it.goods_id || '-'}</td>
                  <td className="p-1 text-center align-top">{it.quantity_received}</td>
                  <td className="p-1 align-top">{it.goods?.unit || '-'}</td>
                  <td className="p-1 align-top">{it.notes || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-10 grid grid-cols-3 gap-6 text-center text-[9px]">
        <div>
          <div className="mb-10 font-bold text-gray-600 uppercase tracking-wider">Diterima</div>
          <div className="border-t border-gray-800 pt-1">( .......................... )</div>
        </div>
        <div>
          <div className="mb-10 font-bold text-gray-600 uppercase tracking-wider">Diperiksa</div>
          <div className="border-t border-gray-800 pt-1">( .......................... )</div>
        </div>
        <div>
          <div className="mb-10 font-bold text-gray-600 uppercase tracking-wider">Mengetahui</div>
          <div className="border-t border-gray-800 pt-1">( .......................... )</div>
        </div>
      </div>

      <div className="mt-10 text-center text-[8px] text-gray-400 border-t pt-2 italic">
        Dicetak otomatis oleh sistem pada {new Date().toLocaleString('id-ID')}
      </div>

      <style>{`
        @media print {
          @page { margin: 10mm; size: A4; }
          body { margin: 0; padding: 0; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}

