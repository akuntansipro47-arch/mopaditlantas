import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface POPrintProps {
  id: string;
}

export default function PurchaseOrderPrint({ id }: POPrintProps) {
  const [po, setPo] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [agency, setAgency] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
      // Fetch Agency Profile
      const { data: agencyData } = await supabase.from('agency_profile').select('*').single();
      setAgency(agencyData);

      const { data: poData, error: poError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers (*),
          work_orders (
             wo_number,
             vehicle_entries (
                nota_dinas_number,
                vehicles (license_plate, brand_type)
             )
          )
        `)
        .eq('id', id)
        .single();
      
      if (poError) throw poError;
      setPo(poData);

      const { data: itemData, error: itemError } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          goods (name, unit, item_code)
        `)
        .eq('po_id', id);

      if (itemError) throw itemError;
      setItems(itemData || []);

      // Auto print after loading
      setTimeout(() => {
        window.print();
      }, 1000);

    } catch (error) {
      console.error('Error fetching PO:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  if (!po) return <div>Data PO tidak ditemukan.</div>;

  return (
    <div className="p-2 max-w-[210mm] mx-auto bg-white min-h-screen text-[10px] font-sans leading-tight">
      {/* Header */}
      <div className="border-b-2 border-black pb-1 mb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            {agency?.logo_url && (
              <img src={agency.logo_url} alt="Logo" className="h-12 w-auto object-contain" />
            )}
            <div>
              <h1 className="text-lg font-bold uppercase tracking-wider">{agency?.name || 'INSTANSI BELUM DISETTING'}</h1>
              <p className="text-sm font-bold mt-0.5">PURCHASE ORDER</p>
              <p className="text-gray-600 w-64 text-[9px] mt-0.5 leading-tight">
                {agency?.address}<br />
                {agency?.phone && `Telp: ${agency.phone}`} {agency?.email && `| Email: ${agency.email}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="mb-0.5">
              <span className="font-bold block text-sm">{po.po_number}</span>
              <span className="text-gray-500 text-[9px]">NO. PO</span>
            </div>
            <div>
              <span className="block text-[10px]">{formatDate(po.po_date)}</span>
              <span className="text-gray-500 text-[9px]">TANGGAL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="border border-gray-400 p-1.5 rounded-sm">
          <h3 className="font-bold border-b border-gray-300 pb-0.5 mb-0.5 text-[9px] uppercase text-gray-500">KEPADA (SUPPLIER)</h3>
          <p className="font-bold text-[10px]">{po.suppliers?.name}</p>
          <p className="text-[9px]">{po.suppliers?.address || '-'}</p>
          <p className="text-[9px]">{po.suppliers?.phone || '-'}</p>
        </div>
        <div className="border border-gray-400 p-1.5 rounded-sm">
          <h3 className="font-bold border-b border-gray-300 pb-0.5 mb-0.5 text-[9px] uppercase text-gray-500">INFORMASI PENGIRIMAN / PROJECT</h3>
          <div className="grid grid-cols-[60px_1fr] gap-0.5 text-[9px]">
            <span className="text-gray-500">Tipe:</span>
            <span className="font-medium">{po.work_order_id ? 'PROJECT (WO)' : 'STOK GUDANG'}</span>
            
            {po.work_order_id && (
              <>
                <span className="text-gray-500">No. WO:</span>
                <span className="font-medium">{po.work_orders?.wo_number}</span>
                <span className="text-gray-500">Kendaraan:</span>
                <span className="font-medium">
                  {po.work_orders?.vehicle_entries?.vehicles?.license_plate} ({po.work_orders?.vehicle_entries?.vehicles?.brand_type})
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full mb-2 border-collapse text-[10px]">
        <thead>
          <tr className="bg-gray-100 border-y border-black">
            <th className="py-0.5 px-1 text-left w-6 border-r border-gray-300">NO</th>
            <th className="py-0.5 px-1 text-left border-r border-gray-300">NAMA BARANG</th>
            <th className="py-0.5 px-1 text-left w-24 border-r border-gray-300">MERK / TIPE</th>
            <th className="py-0.5 px-1 text-center w-10 border-r border-gray-300">QTY</th>
            <th className="py-0.5 px-1 text-center w-10 border-r border-gray-300">UNIT</th>
            <th className="py-0.5 px-1 text-right w-24 border-r border-gray-300">HARGA</th>
            <th className="py-0.5 px-1 text-right w-24">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className="border-b border-gray-200">
              <td className="py-0.5 px-1 align-top text-center border-r border-gray-300">{index + 1}</td>
              <td className="py-0.5 px-1 align-top border-r border-gray-300">
                <span className="font-medium block leading-tight">{item.goods?.name}</span>
              </td>
              <td className="py-0.5 px-1 align-top border-r border-gray-300 leading-tight">{item.brand || '-'}</td>
              <td className="py-0.5 px-1 align-top text-center font-medium border-r border-gray-300">{item.quantity}</td>
              <td className="py-0.5 px-1 align-top text-center text-gray-500 text-[9px] uppercase border-r border-gray-300">{item.goods?.unit}</td>
              <td className="py-0.5 px-1 align-top text-right border-r border-gray-300">{formatCurrency(item.unit_price)}</td>
              <td className="py-0.5 px-1 align-top text-right font-bold">{formatCurrency(item.total_price)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}></td>
            <td className="py-1 px-1 text-right font-bold uppercase text-gray-600 text-[9px]">Total Tagihan</td>
            <td className="py-1 px-1 text-right font-bold text-xs border-t border-black bg-gray-50">
              {formatCurrency(po.total_amount)}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Footer / Signatures */}
      <div className="grid grid-cols-3 gap-4 mt-4 text-center page-break-inside-avoid text-[10px]">
        <div>
          <p className="mb-8 font-medium text-[9px] uppercase text-gray-500">Dibuat Oleh,</p>
          <div className="border-t border-black w-3/4 mx-auto pt-0.5">
            <p className="font-bold">Admin Procurement</p>
          </div>
        </div>
        <div>
          <p className="mb-8 font-medium text-[9px] uppercase text-gray-500">Disetujui Oleh,</p>
          <div className="border-t border-black w-3/4 mx-auto pt-0.5">
            <p className="font-bold">Kepala Gudang</p>
          </div>
        </div>
        <div>
          <p className="mb-8 font-medium text-[9px] uppercase text-gray-500">Diketahui Oleh,</p>
          <div className="border-t border-black w-3/4 mx-auto pt-0.5">
            <p className="font-bold">Kepala Bengkel</p>
          </div>
        </div>
      </div>
      
      <div className="mt-4 text-center text-[8px] text-gray-400 border-t pt-1">
        Dicetak: {new Date().toLocaleString('id-ID')}
      </div>
      
      {/* Print specific styles */}
      <style>{`
        @media print {
          @page { margin: 0mm !important; size: 215mm 297mm !important; }
          body { margin: 0mm !important; padding: 1mm !important; background: white !important; -webkit-print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}