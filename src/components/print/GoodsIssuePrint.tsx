import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface GoodsIssuePrintProps {
  id: string;
}

export default function GoodsIssuePrint({ id }: GoodsIssuePrintProps) {
  const [issue, setIssue] = useState<any>(null);
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

      const { data: issueData, error: issueError } = await supabase
        .from('goods_issues')
        .select(`
          *,
          work_orders (
            wo_number,
            vehicle_entries (
              nota_dinas_number,
              vehicles (license_plate, brand_type, vehicle_type)
            )
          )
        `)
        .eq('id', id)
        .single();
      
      if (issueError) throw issueError;
      setIssue(issueData);

      const { data: itemData, error: itemError } = await supabase
        .from('goods_issue_items')
        .select(`
          *,
          goods (name, unit, item_code)
        `)
        .eq('issue_id', id);

      if (itemError) throw itemError;
      setItems(itemData || []);

      // Auto print after loading
      setTimeout(() => {
        window.print();
      }, 1000);

    } catch (error) {
      console.error('Error fetching Goods Issue:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  if (!issue) return <div>Data Barang Keluar tidak ditemukan.</div>;

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
              <p className="text-sm font-bold mt-0.5">BUKTI PENGELUARAN BARANG</p>
              <p className="text-gray-600 w-64 text-[9px] mt-0.5 leading-tight">
                {agency?.address}<br />
                {agency?.phone && `Telp: ${agency.phone}`} {agency?.email && `| Email: ${agency.email}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="mb-0.5">
              <span className="font-bold block text-sm">{issue.issue_number}</span>
              <span className="text-gray-500 text-[9px]">NO. TRANSAKSI</span>
            </div>
            <div>
              <span className="block text-[10px]">{formatDate(issue.issue_date)}</span>
              <span className="text-gray-500 text-[9px]">TANGGAL KELUAR</span>
            </div>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="border border-gray-400 p-1.5 rounded-sm mb-2">
        <h3 className="font-bold border-b border-gray-300 pb-0.5 mb-0.5 text-[9px] uppercase text-gray-500">INFORMASI PENGGUNAAN / PROJECT</h3>
        <div className="grid grid-cols-2 gap-4 text-[9px]">
            <div className="grid grid-cols-[70px_1fr] gap-0.5">
                <span className="text-gray-500">No. Work Order:</span>
                <span className="font-medium">{issue.work_orders?.wo_number || '-'}</span>
                
                <span className="text-gray-500">No. Nota Dinas:</span>
                <span className="font-medium">{issue.work_orders?.vehicle_entries?.nota_dinas_number || '-'}</span>
            </div>
            <div className="grid grid-cols-[70px_1fr] gap-0.5">
                <span className="text-gray-500">Kendaraan:</span>
                <span className="font-medium">
                  {issue.work_orders?.vehicle_entries?.vehicles?.license_plate || '-'} 
                </span>
                
                <span className="text-gray-500">Merk / Tipe:</span>
                <span className="font-medium">
                  {issue.work_orders?.vehicle_entries?.vehicles?.brand_type || '-'}
                </span>
            </div>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full mb-2 border-collapse text-[10px]">
        <thead>
          <tr className="bg-gray-100 border-y border-black">
            <th className="py-0.5 px-1 text-left w-8 border-r border-gray-300">NO</th>
            <th className="py-0.5 px-1 text-left w-24 border-r border-gray-300">KODE BARANG</th>
            <th className="py-0.5 px-1 text-left border-r border-gray-300">NAMA BARANG / SPAREPART</th>
            <th className="py-0.5 px-1 text-center w-16 border-r border-gray-300">QTY</th>
            <th className="py-0.5 px-1 text-center w-16">UNIT</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className="border-b border-gray-200">
              <td className="py-0.5 px-1 align-top text-center border-r border-gray-300">{index + 1}</td>
              <td className="py-0.5 px-1 align-top border-r border-gray-300 text-gray-600">{item.goods?.item_code}</td>
              <td className="py-0.5 px-1 align-top border-r border-gray-300 font-medium">
                {item.goods?.name}
              </td>
              <td className="py-0.5 px-1 align-top text-center font-bold border-r border-gray-300">{item.quantity}</td>
              <td className="py-0.5 px-1 align-top text-center text-gray-500 text-[9px] uppercase">{item.goods?.unit}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="py-2 text-center text-gray-500 italic">Tidak ada item barang.</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Footer / Signatures */}
      <div className="grid grid-cols-3 gap-4 mt-8 text-center page-break-inside-avoid text-[10px]">
        <div>
          <p className="mb-8 font-medium text-[9px] uppercase text-gray-500">Dikeluarkan Oleh,</p>
          <div className="border-t border-black w-3/4 mx-auto pt-0.5">
            <p className="font-bold">Bagian Gudang</p>
          </div>
        </div>
        <div>
          <p className="mb-8 font-medium text-[9px] uppercase text-gray-500">Diterima Oleh,</p>
          <div className="border-t border-black w-3/4 mx-auto pt-0.5">
            <p className="font-bold">Mekanik / Pemohon</p>
          </div>
        </div>
        <div>
          <p className="mb-8 font-medium text-[9px] uppercase text-gray-500">Mengetahui,</p>
          <div className="border-t border-black w-3/4 mx-auto pt-0.5">
            <p className="font-bold">Kepala Bengkel</p>
          </div>
        </div>
      </div>
      
      <div className="mt-4 text-center text-[8px] text-gray-400 border-t pt-1">
        Dicetak: {new Date().toLocaleString('id-ID')} | Lembar 1: Gudang, Lembar 2: Mekanik, Lembar 3: Arsip
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
