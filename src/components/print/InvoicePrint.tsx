import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface InvoicePrintProps {
  id: string;
}

export default function InvoicePrint({ id }: InvoicePrintProps) {
  const [wo, setWo] = useState<any>(null);
  const [billings, setBillings] = useState<any[]>([]);
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

      const { data: woData, error: woError } = await supabase
        .from('work_orders')
        .select(`
          *,
          mechanics (*),
          vehicle_entries (
            *,
            vehicles (*)
          )
        `)
        .eq('id', id)
        .single();
      
      if (woError) throw woError;
      setWo(woData);

      const { data: billingData, error: billingError } = await supabase
        .from('work_order_billings')
        .select('*')
        .eq('work_order_id', id);

      if (billingError) throw billingError;
      setBillings(billingData || []);

      // Auto print after loading
      setTimeout(() => {
        window.print();
      }, 1000);

    } catch (error) {
      console.error('Error fetching Invoice:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  if (!wo) return <div>Data Invoice tidak ditemukan.</div>;

  const totalAmount = billings.reduce((sum, item) => sum + item.total_price, 0);

  return (
    <div className="p-2 max-w-[215mm] mx-auto bg-white min-h-screen font-sans text-[10px] leading-tight">
      {/* Header */}
      <div className="border-b-2 border-black pb-2 mb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            {agency?.logo_url && (
              <img src={agency.logo_url} alt="Logo" className="h-12 w-auto object-contain" />
            )}
            <div>
              <h1 className="text-lg font-bold uppercase tracking-wider text-blue-800">{agency?.name || 'INSTANSI BELUM DISETTING'}</h1>
              <p className="text-sm font-bold mt-0.5">INVOICE / TAGIHAN</p>
              <p className="text-gray-600 text-[9px] mt-0.5 leading-tight">
                {agency?.address}<br />
                {agency?.phone && `Telp: ${agency.phone}`} {agency?.email && `| Email: ${agency.email}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="mb-1">
              <span className="font-bold block text-sm">{wo.wo_number}</span>
              <span className="text-gray-500 text-[9px]">NO. WO</span>
            </div>
            <div>
              <span className="block text-[10px] font-medium">{formatDate(new Date().toISOString())}</span>
              <span className="text-gray-500 text-[9px]">TANGGAL CETAK</span>
            </div>
          </div>
        </div>
      </div>

      {/* Customer & Vehicle Info */}
      <div className="grid grid-cols-2 gap-4 mb-2">
        <div className="border p-2 rounded-md bg-gray-50">
          <h3 className="font-bold border-b pb-0.5 mb-1 text-[9px] uppercase text-gray-500">INFORMASI KENDARAAN</h3>
          <table className="w-full text-[10px]">
            <tbody>
              <tr>
                <td className="w-20 text-gray-600">No. Polisi</td>
                <td className="font-bold">: {wo.vehicle_entries?.vehicles?.license_plate}</td>
              </tr>
              <tr>
                <td className="text-gray-600">Tipe/Merk</td>
                <td>: {wo.vehicle_entries?.vehicles?.brand_type}</td>
              </tr>
              <tr>
                <td className="text-gray-600">No. Rangka</td>
                <td>: {wo.vehicle_entries?.vehicles?.chassis_number || '-'}</td>
              </tr>
              <tr>
                <td className="text-gray-600">No. Mesin</td>
                <td>: {wo.vehicle_entries?.vehicles?.engine_number || '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="border p-2 rounded-md bg-gray-50">
          <h3 className="font-bold border-b pb-0.5 mb-1 text-[9px] uppercase text-gray-500">INFORMASI PEKERJAAN</h3>
          <table className="w-full text-[10px]">
            <tbody>
              <tr>
                <td className="w-20 text-gray-600">Mekanik</td>
                <td className="font-medium">: {wo.mechanics?.name}</td>
              </tr>
              <tr>
                <td className="text-gray-600">Tgl. Masuk</td>
                <td>: {formatDate(wo.vehicle_entries?.entry_date)}</td>
              </tr>
              <tr>
                <td className="text-gray-600">No. Nota Dinas</td>
                <td>: {wo.vehicle_entries?.nota_dinas_number || '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Items Table */}
      <div className="mb-2">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="py-1 px-2 text-left w-8">NO</th>
              <th className="py-1 px-2 text-left">DESKRIPSI PEKERJAAN / SPAREPART</th>
              <th className="py-1 px-2 text-center w-20">JENIS</th>
              <th className="py-1 px-2 text-center w-12">QTY</th>
              <th className="py-1 px-2 text-right w-24">HARGA SATUAN</th>
              <th className="py-1 px-2 text-right w-24">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {billings.map((item, index) => (
              <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="py-1 px-2 text-center align-top">{index + 1}</td>
                <td className="py-1 px-2 align-top font-medium">{item.item_name}</td>
                <td className="py-1 px-2 text-center align-top text-[9px]">
                  <span className={`px-1.5 py-0.5 rounded-full ${item.item_type === 'JOB' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
                    {item.item_type === 'JOB' ? 'JASA' : 'PART'}
                  </span>
                </td>
                <td className="py-1 px-2 text-center align-top">{item.qty}</td>
                <td className="py-1 px-2 text-right align-top">{formatCurrency(item.unit_price)}</td>
                <td className="py-1 px-2 text-right align-top font-bold">{formatCurrency(item.total_price)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="py-2 px-2 text-right font-bold text-sm uppercase">Total Tagihan</td>
              <td className="py-2 px-2 text-right font-bold text-sm bg-gray-100 border-t border-black">
                {formatCurrency(totalAmount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer / Signatures */}
      <div className="grid grid-cols-3 gap-4 mt-6 text-center text-[10px] page-break-inside-avoid">
        <div>
          <p className="mb-10 font-medium">Hormat Kami,</p>
          <div className="border-t border-black w-2/3 mx-auto pt-1">
            <p className="font-bold">Kasir / Admin</p>
          </div>
        </div>
        <div>
          <p className="mb-10 font-medium">Mengetahui,</p>
          <div className="border-t border-black w-2/3 mx-auto pt-1">
            <p className="font-bold">Kepala Bengkel</p>
          </div>
        </div>
        <div>
          <p className="mb-10 font-medium">Penyerah / Customer,</p>
          <div className="border-t border-black w-2/3 mx-auto pt-1">
            <p className="font-bold">Tanda Tangan & Nama Jelas</p>
          </div>
        </div>
      </div>
      
      <div className="mt-4 text-center text-[8px] text-gray-400 border-t pt-1">
        Dokumen ini dicetak secara otomatis oleh sistem. Harap simpan sebagai bukti pembayaran yang sah.
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
