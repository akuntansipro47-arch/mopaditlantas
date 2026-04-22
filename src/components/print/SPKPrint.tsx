import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface PrintSPKProps {
  id: string;
}

export default function PrintSPK({ id }: PrintSPKProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [agency, setAgency] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
      // 0. Fetch Agency Profile
      const { data: agencyData } = await supabase.from('agency_profile').select('*').single();
      setAgency(agencyData);

      // 1. Fetch WO with basic details
      const { data: wo, error: woError } = await supabase
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

      // 2. Fetch entry with jobs and spareparts
      const { data: entry, error: entryError } = await supabase
        .from('vehicle_entries')
        .select(`
          *,
          vehicle_entry_jobs (
            *,
            job_types (*)
          ),
          vehicle_entry_spareparts (*)
        `)
        .eq('id', wo.vehicle_entry_id)
        .single();

      if (entryError) throw entryError;

      // 3. Fetch spareparts detail from 'goods' table
      let enrichedSpareparts = [];
      if (entry.vehicle_entry_spareparts && entry.vehicle_entry_spareparts.length > 0) {
        const goodsIds = entry.vehicle_entry_spareparts
          .map((sp: any) => sp.goods_id)
          .filter(Boolean);
        
        if (goodsIds.length > 0) {
          const { data: goodsData } = await supabase
            .from('goods')
            .select('*')
            .in('id', goodsIds);
          
          const goodsMap = new Map(goodsData?.map((g: any) => [g.id, g]) || []);
          enrichedSpareparts = entry.vehicle_entry_spareparts.map((sp: any) => ({
            ...sp,
            spareparts: sp.goods_id ? goodsMap.get(sp.goods_id) || null : null,
          }));
        } else {
          enrichedSpareparts = entry.vehicle_entry_spareparts;
        }
      }

      setData({
        wo,
        entry: { ...entry, vehicle_entry_spareparts: enrichedSpareparts }
      });

      // 4. Auto print after state is stable
      setTimeout(() => {
        window.print();
      }, 1500);

    } catch (error) {
      console.error('Error fetching SPK data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  if (!data) return <div className="p-8 text-center">Data SPK tidak ditemukan.</div>;

  const { wo, entry } = data;

  return (
    <div className="bg-slate-100 min-h-screen py-8 no-print-bg">
      {/* Control Bar - Only visible on screen */}
      <div className="max-w-[210mm] mx-auto mb-4 flex justify-between items-center no-print px-4">
        <button 
          onClick={() => window.close()} 
          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded text-sm font-medium transition-colors"
        >
          Kembali
        </button>
        <button 
          onClick={() => window.print()} 
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-bold shadow-sm transition-colors"
        >
          Cetak Sekarang
        </button>
      </div>

      <div className="max-w-[210mm] mx-auto p-[15mm] bg-white shadow-lg text-gray-900 print:shadow-none print:p-0 min-h-[297mm]">
        <header className="flex justify-between items-start pb-4 border-b-2 border-gray-800">
          <div className="flex gap-4 items-center">
            {agency?.logo_url && (
              <img src={agency.logo_url} alt="Logo" className="h-16 w-auto object-contain" />
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-800 uppercase leading-tight">{agency?.name || 'SURAT PERINTAH KERJA'}</h1>
              <p className="text-sm text-gray-600 italic">Workshop Monitoring System</p>
              <p className="text-[10px] text-gray-500 mt-1 max-w-xs">{agency?.address}</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-black text-blue-900">SPK</h2>
            <p className="text-sm font-bold">No: {wo.wo_number}</p>
            <p className="text-xs text-gray-500">{formatDate(wo.work_date)}</p>
          </div>
        </header>

        <main className="mt-8">
          <div className="grid grid-cols-2 gap-8 text-xs">
            <section className="space-y-3">
              <h3 className="font-bold border-b pb-1 uppercase tracking-wider text-gray-500 text-[10px]">Detail Kendaraan</h3>
              <table className="w-full">
                <tbody>
                  <tr><td className="w-24 py-1 text-gray-600">No. Polisi</td><td className="font-bold">: {wo.vehicle_entries?.vehicles?.license_plate}</td></tr>
                  <tr><td className="py-1 text-gray-600">Merek/Tipe</td><td className="font-bold">: {wo.vehicle_entries?.vehicles?.brand_type}</td></tr>
                  <tr><td className="py-1 text-gray-600">Nota Dinas</td><td className="font-bold">: {wo.vehicle_entries?.nota_dinas_number}</td></tr>
                </tbody>
              </table>
            </section>
            
            <section className="space-y-3">
              <h3 className="font-bold border-b pb-1 uppercase tracking-wider text-gray-500 text-[10px]">Penanggung Jawab</h3>
              <table className="w-full">
                <tbody>
                  <tr><td className="w-24 py-1 text-gray-600">Mekanik</td><td className="font-bold">: {wo.mechanics?.name}</td></tr>
                  <tr><td className="py-1 text-gray-600">Spesialisasi</td><td className="font-bold">: {wo.mechanics?.specialization}</td></tr>
                </tbody>
              </table>
            </section>
          </div>

          <section className="mt-10">
            <h3 className="font-bold uppercase tracking-wider text-gray-500 text-[10px] mb-2">I. Daftar Pekerjaan (Services)</h3>
            <div className="border rounded-md overflow-hidden border-gray-300">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-300">
                  <tr>
                    <th className="p-2 text-center w-10 border-r">NO</th>
                    <th className="p-2 text-left w-40 border-r">KATEGORI</th>
                    <th className="p-2 text-left border-r">DESKRIPSI PEKERJAAN</th>
                    <th className="p-2 text-left">CATATAN</th>
                  </tr>
                </thead>
                <tbody>
                  {entry?.vehicle_entry_jobs?.map((job: any, index: number) => (
                    <tr key={index} className="border-b last:border-0">
                      <td className="p-2 text-center border-r">{index + 1}</td>
                      <td className="p-2 border-r font-medium uppercase text-[10px]">{job.job_types?.job_group}</td>
                      <td className="p-2 border-r font-bold">{job.job_types?.job_name}</td>
                      <td className="p-2 italic text-gray-500">{job.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10">
            <h3 className="font-bold uppercase tracking-wider text-gray-500 text-[10px] mb-2">II. Estimasi Sparepart & Material</h3>
            <div className="border rounded-md overflow-hidden border-gray-300">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-300">
                  <tr>
                    <th className="p-2 text-center w-10 border-r">NO</th>
                    <th className="p-2 text-left border-r">NAMA BARANG</th>
                    <th className="p-2 text-center w-20 border-r">QTY</th>
                    <th className="p-2 text-center w-24">SATUAN</th>
                  </tr>
                </thead>
                <tbody>
                  {entry?.vehicle_entry_spareparts && entry.vehicle_entry_spareparts.length > 0 ? (
                    entry.vehicle_entry_spareparts.map((sp: any, index: number) => (
                      <tr key={index} className="border-b last:border-0">
                        <td className="p-2 text-center border-r">{index + 1}</td>
                        <td className="p-2 border-r font-bold">{sp.spareparts?.name || sp.item_name}</td>
                        <td className="p-2 text-center font-bold border-r">{sp.qty}</td>
                        <td className="p-2 text-center uppercase text-gray-500">{sp.spareparts?.unit || '-'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={4} className="p-4 text-center text-gray-400 italic">Tidak ada estimasi sparepart.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <footer className="mt-20">
          <div className="grid grid-cols-3 gap-8 text-center">
            <div className="space-y-16">
              <p className="text-[10px] font-bold uppercase text-gray-500">Pemohon</p>
              <div className="border-t border-gray-800 w-32 mx-auto pt-1">
                <p className="text-xs font-medium">( Nama Terang )</p>
              </div>
            </div>
            <div className="space-y-16">
              <p className="text-[10px] font-bold uppercase text-gray-500">Workshop Head</p>
              <div className="border-t border-gray-800 w-32 mx-auto pt-1">
                <p className="text-xs font-medium">Pemeriksa</p>
              </div>
            </div>
            <div className="space-y-16">
              <p className="text-[10px] font-bold uppercase text-gray-500">Mekanik</p>
              <div className="border-t border-gray-800 w-32 mx-auto pt-1">
                <p className="text-xs font-bold underline">{wo.mechanics?.name}</p>
              </div>
            </div>
          </div>
          <div className="mt-16 text-center text-[9px] text-gray-400 border-t pt-2">
            Dokumen ini dihasilkan secara otomatis oleh sistem pada {new Date().toLocaleString('id-ID')}
          </div>
        </footer>
      </div>

      <style>{`
        @media screen {
          .no-print-bg { background-color: #f1f5f9; }
        }
        @media print {
          @page { margin: 0mm !important; size: A4 !important; }
          body { margin: 0mm !important; padding: 0mm !important; background: white !important; -webkit-print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          .shadow-lg { shadow: none !important; box-shadow: none !important; }
          .bg-slate-100 { background-color: white !important; }
          .min-h-screen { min-height: 0 !important; }
          .py-8 { padding-top: 0 !important; padding-bottom: 0 !important; }
        }
      `}</style>
    </div>
  );
}
