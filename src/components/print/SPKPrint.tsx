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
      }, 2000);

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
    <div className="p-8 max-w-[210mm] mx-auto bg-white min-h-screen font-sans text-[11px] leading-relaxed">
      {/* Control Bar - Only visible on screen */}
      <div className="no-print mb-6 flex justify-between items-center bg-slate-100 p-4 rounded-lg shadow-sm">
        <div className="text-slate-600 text-xs">
          <strong>Mode Cetak:</strong> Jika preview di bawah kosong, klik tombol biru.
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => window.close()} 
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded text-sm font-medium transition-colors"
          >
            Tutup
          </button>
          <button 
            onClick={() => window.print()} 
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-bold shadow-sm transition-colors"
          >
            Cetak Sekarang
          </button>
        </div>
      </div>

      {/* Main Print Content */}
      <div className="print:m-0">
        <header className="flex justify-between items-start pb-4 border-b-2 border-gray-800 mb-6">
          <div className="flex gap-4 items-center">
            {agency?.logo_url && (
              <img src={agency.logo_url} alt="Logo" className="h-16 w-auto object-contain" />
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-800 uppercase leading-tight">{agency?.name || 'SURAT PERINTAH KERJA'}</h1>
              <p className="text-[10px] text-gray-500 mt-1 max-w-sm">{agency?.address}</p>
              <p className="text-[9px] text-gray-400 mt-0.5 italic">Workshop Monitoring System</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-black text-slate-800 tracking-tighter">SPK</h2>
            <p className="text-sm font-bold text-blue-900 mt-1">{wo.wo_number}</p>
            <p className="text-[10px] text-gray-500 uppercase">{formatDate(wo.work_date)}</p>
          </div>
        </header>

        <main>
          <div className="grid grid-cols-2 gap-12 mb-8">
            <section>
              <h3 className="font-bold border-b border-gray-300 pb-1 mb-2 uppercase text-[9px] text-gray-500 tracking-widest">Data Kendaraan</h3>
              <table className="w-full text-[11px]">
                <tbody>
                  <tr><td className="w-24 py-0.5 text-gray-500">No. Polisi</td><td className="font-bold">: {wo.vehicle_entries?.vehicles?.license_plate}</td></tr>
                  <tr><td className="py-0.5 text-gray-500">Merek/Tipe</td><td className="font-semibold">: {wo.vehicle_entries?.vehicles?.brand_type}</td></tr>
                  <tr><td className="py-0.5 text-gray-500">Nota Dinas</td><td className="">: {wo.vehicle_entries?.nota_dinas_number}</td></tr>
                </tbody>
              </table>
            </section>
            
            <section>
              <h3 className="font-bold border-b border-gray-300 pb-1 mb-2 uppercase text-[9px] text-gray-500 tracking-widest">Data Mekanik</h3>
              <table className="w-full text-[11px]">
                <tbody>
                  <tr><td className="w-24 py-0.5 text-gray-500">Nama</td><td className="font-bold">: {wo.mechanics?.name}</td></tr>
                  <tr><td className="py-0.5 text-gray-500">Spesialisasi</td><td className="">: {wo.mechanics?.specialization}</td></tr>
                  <tr><td className="py-0.5 text-gray-500">Status WO</td><td className="uppercase font-medium text-blue-700">: {wo.status}</td></tr>
                </tbody>
              </table>
            </section>
          </div>

          <section className="mb-8">
            <h3 className="font-bold uppercase text-[9px] text-gray-500 tracking-widest mb-2">I. Rincian Pekerjaan (Job List)</h3>
            <table className="w-full border-collapse border border-gray-300">
              <thead className="bg-gray-50">
                <tr className="text-[10px] font-bold text-gray-700">
                  <th className="border border-gray-300 p-2 w-10 text-center">NO</th>
                  <th className="border border-gray-300 p-2 text-left w-48">JENIS / GRUP</th>
                  <th className="border border-gray-300 p-2 text-left">DESKRIPSI PEKERJAAN</th>
                  <th className="border border-gray-300 p-2 text-left w-40">CATATAN</th>
                </tr>
              </thead>
              <tbody className="text-[10px]">
                {entry?.vehicle_entry_jobs?.map((job: any, index: number) => (
                  <tr key={index}>
                    <td className="border border-gray-300 p-2 text-center">{index + 1}</td>
                    <td className="border border-gray-300 p-2 font-medium uppercase">{job.job_types?.job_group}</td>
                    <td className="border border-gray-300 p-2 font-bold">{job.job_types?.job_name}</td>
                    <td className="border border-gray-300 p-2 italic text-gray-500">{job.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mb-8">
            <h3 className="font-bold uppercase text-[9px] text-gray-500 tracking-widest mb-2">II. Estimasi Suku Cadang & Material</h3>
            <table className="w-full border-collapse border border-gray-300">
              <thead className="bg-gray-50">
                <tr className="text-[10px] font-bold text-gray-700">
                  <th className="border border-gray-300 p-2 w-10 text-center">NO</th>
                  <th className="border border-gray-300 p-2 text-left">NAMA BARANG / MATERIAL</th>
                  <th className="border border-gray-300 p-2 text-center w-24">QUANTITY</th>
                  <th className="border border-gray-300 p-2 text-center w-24">SATUAN</th>
                </tr>
              </thead>
              <tbody className="text-[10px]">
                {entry?.vehicle_entry_spareparts && entry.vehicle_entry_spareparts.length > 0 ? (
                  entry.vehicle_entry_spareparts.map((sp: any, index: number) => (
                    <tr key={index}>
                      <td className="border border-gray-300 p-2 text-center">{index + 1}</td>
                      <td className="border border-gray-300 p-2 font-bold">{sp.spareparts?.name || sp.item_name}</td>
                      <td className="border border-gray-300 p-2 text-center font-bold">{sp.qty}</td>
                      <td className="border border-gray-300 p-2 text-center uppercase text-gray-400">{sp.spareparts?.unit || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={4} className="border border-gray-300 p-4 text-center italic text-gray-400 text-[11px]">Tidak ada estimasi sparepart/material.</td></tr>
                )}
              </tbody>
            </table>
          </section>
        </main>

        <footer className="mt-16">
          <div className="grid grid-cols-3 gap-8 text-center text-[10px]">
            <div className="space-y-12">
              <p className="font-bold uppercase text-gray-400 tracking-widest">Pemohon / Driver</p>
              <div className="border-t border-gray-800 w-32 mx-auto pt-1">
                <p className="">( .......................... )</p>
              </div>
            </div>
            <div className="space-y-12">
              <p className="font-bold uppercase text-gray-400 tracking-widest">Pemeriksa / SA</p>
              <div className="border-t border-gray-800 w-32 mx-auto pt-1">
                <p className="">( .......................... )</p>
              </div>
            </div>
            <div className="space-y-12">
              <p className="font-bold uppercase text-gray-400 tracking-widest">Mekanik Pelaksana</p>
              <div className="border-t border-gray-800 w-32 mx-auto pt-1">
                <p className="font-bold underline">{wo.mechanics?.name}</p>
              </div>
            </div>
          </div>
          <div className="mt-12 pt-4 border-t border-gray-100 flex justify-between items-end text-[8px] text-gray-400">
            <div>Dicetak otomatis oleh sistem OtoSmart Monitoring</div>
            <div className="italic uppercase">ID WO: {wo.id} | {new Date().toLocaleString('id-ID')}</div>
          </div>
        </footer>
      </div>

      <style>{`
        @media print {
          @page { margin: 10mm; size: A4; }
          body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
  );
}
