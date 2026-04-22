import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import { Loader2, Printer, X, CheckCircle2 } from 'lucide-react';

interface PrintSPKProps {
  id: string;
}

export default function PrintSPK({ id }: PrintSPKProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [agency, setAgency] = useState<any>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
      const { data: agencyData } = await supabase.from('agency_profile').select('*').single();
      setAgency(agencyData);

      const { data: wo, error: woError } = await supabase
        .from('work_orders')
        .select(`*, mechanics (*), vehicle_entries (*, vehicles (*))`)
        .eq('id', id)
        .single();

      if (woError) throw woError;

      const { data: entry, error: entryError } = await supabase
        .from('vehicle_entries')
        .select(`*, vehicle_entry_jobs (*, job_types (*)), vehicle_entry_spareparts (*)`)
        .eq('id', wo.vehicle_entry_id)
        .single();

      if (entryError) throw entryError;

      let enrichedSpareparts = [];
      if (entry.vehicle_entry_spareparts?.length > 0) {
        const goodsIds = entry.vehicle_entry_spareparts.map((sp: any) => sp.goods_id).filter(Boolean);
        if (goodsIds.length > 0) {
          const { data: goodsData } = await supabase.from('goods').select('*').in('id', goodsIds);
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
      
      setIsReady(true);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-slate-50">
        <Loader2 className="animate-spin h-10 w-10 text-blue-600 mb-4" />
        <p className="text-slate-600 font-medium text-lg">Mempersiapkan Data SPK...</p>
      </div>
    );
  }

  if (!data) return <div className="p-8 text-center text-red-500 font-bold">Data SPK tidak ditemukan.</div>;

  const { wo, entry } = data;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Control Bar - Layar Saja */}
      <div className="no-print sticky top-0 z-50 bg-white border-b shadow-md p-4 mb-6">
        <div className="max-w-[210mm] mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <CheckCircle2 className={`h-6 w-6 ${isReady ? 'text-green-500' : 'text-slate-300'}`} />
            <span className="text-base font-bold text-slate-800 uppercase tracking-wide">
              {isReady ? 'Data SPK Siap Dicetak' : 'Memuat Data...'}
            </span>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => window.close()} 
              className="px-5 py-2.5 text-sm font-bold border-2 border-slate-300 rounded-lg hover:bg-slate-100 transition-all flex items-center gap-2 uppercase"
            >
              <X className="h-4 w-4" /> Tutup
            </button>
            <button 
              onClick={handlePrint} 
              className="px-8 py-2.5 text-sm font-black bg-blue-700 text-white rounded-lg hover:bg-blue-800 shadow-xl transition-all flex items-center gap-2 uppercase tracking-wider"
            >
              <Printer className="h-5 w-5" /> Cetak SPK / Simpan PDF
            </button>
          </div>
        </div>
      </div>

      {/* KONTEN UTAMA - Desain Enhanced Modern */}
      <div className="max-w-[210mm] mx-auto p-[10mm] bg-white shadow-2xl print:shadow-none print:p-0 print:m-0 mb-20 overflow-visible relative">
        
        {/* Header SPK Modern */}
        <header className="flex justify-between items-start pb-8 border-b-4 border-slate-900 mb-10">
          <div className="flex gap-8 items-center">
            {agency?.logo_url && (
              <div className="bg-white p-1 rounded-sm border shadow-sm">
                <img src={agency.logo_url} alt="Logo" className="h-20 w-auto object-contain" width="80" height="80" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-black text-slate-900 uppercase leading-none tracking-tighter mb-1">{agency?.name || 'SURAT PERINTAH KERJA'}</h1>
              <p className="text-[11px] font-black text-blue-700 uppercase tracking-[0.2em] mb-3">Workshop Monitoring System</p>
              <div className="max-w-sm">
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed uppercase">{agency?.address}</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="bg-blue-900 text-white px-8 py-3 rounded-md mb-3 inline-block shadow-lg">
                <h2 className="text-3xl font-black tracking-tighter leading-none">SPK</h2>
            </div>
            <div className="space-y-0.5">
              <p className="text-base font-black text-slate-900 uppercase">NO: {wo.wo_number}</p>
              <p className="text-xs font-bold text-slate-500 tracking-wider">{formatDate(wo.work_date)}</p>
            </div>
          </div>
        </header>

        <main className="space-y-10">
          {/* Grid Informasi Kendaraan & Mekanik */}
          <div className="grid grid-cols-2 gap-12">
            <section className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4">Informasi Kendaraan</h3>
              <table className="w-full text-xs">
                <tbody className="space-y-2">
                  <tr className="flex">
                    <td className="w-28 text-slate-500 font-bold uppercase text-[10px]">No. Polisi</td>
                    <td className="font-black text-slate-900 text-sm">: {wo.vehicle_entries?.vehicles?.license_plate}</td>
                  </tr>
                  <tr className="flex">
                    <td className="w-28 text-slate-500 font-bold uppercase text-[10px]">Merek / Tipe</td>
                    <td className="font-bold text-slate-800">: {wo.vehicle_entries?.vehicles?.brand_type}</td>
                  </tr>
                  <tr className="flex border-t border-slate-100 pt-2 mt-2">
                    <td className="w-28 text-slate-500 font-bold uppercase text-[10px]">Nota Dinas</td>
                    <td className="font-medium text-slate-700">: {wo.vehicle_entries?.nota_dinas_number}</td>
                  </tr>
                </tbody>
              </table>
            </section>
            
            <section className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4">Mekanik Pelaksana</h3>
              <table className="w-full text-xs">
                <tbody className="space-y-2">
                  <tr className="flex">
                    <td className="w-28 text-slate-500 font-bold uppercase text-[10px]">Nama Mekanik</td>
                    <td className="font-black text-slate-900 text-sm">: {wo.mechanics?.name}</td>
                  </tr>
                  <tr className="flex">
                    <td className="w-28 text-slate-500 font-bold uppercase text-[10px]">Spesialisasi</td>
                    <td className="font-bold text-slate-800">: {wo.mechanics?.specialization}</td>
                  </tr>
                  <tr className="flex border-t border-slate-100 pt-2 mt-2">
                    <td className="w-28 text-slate-500 font-bold uppercase text-[10px]">Status WO</td>
                    <td className="font-black text-blue-700 uppercase tracking-wider">: {wo.status}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>

          {/* Daftar Pekerjaan */}
          <section>
            <div className="flex items-center gap-3 mb-4">
                <div className="h-6 w-1.5 bg-blue-900 rounded-full"></div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">I. Rincian Item Pekerjaan (Service)</h3>
            </div>
            <div className="border-2 border-slate-900 rounded-lg overflow-hidden shadow-md">
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="p-3 text-center w-12 border-r border-slate-800 font-black">NO</th>
                    <th className="p-3 text-left w-48 border-r border-slate-800 font-black">KATEGORI</th>
                    <th className="p-3 text-left border-r border-slate-800 font-black">DESKRIPSI PEKERJAAN</th>
                    <th className="p-3 text-left font-black">CATATAN</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-100">
                  {entry?.vehicle_entry_jobs?.map((job: any, index: number) => (
                    <tr key={index} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-center border-r border-slate-100 font-black bg-slate-50/50">{index + 1}</td>
                      <td className="p-3 border-r border-slate-100 font-bold uppercase text-[10px] text-slate-500 tracking-tighter">{job.job_types?.job_group}</td>
                      <td className="p-3 border-r border-slate-100 font-black text-slate-900 text-xs">{job.job_types?.job_name}</td>
                      <td className="p-3 italic text-slate-400 text-[10px] leading-relaxed">{job.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Daftar Sparepart */}
          <section>
            <div className="flex items-center gap-3 mb-4">
                <div className="h-6 w-1.5 bg-blue-900 rounded-full"></div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">II. Estimasi Sparepart & Material</h3>
            </div>
            <div className="border-2 border-slate-900 rounded-lg overflow-hidden shadow-md">
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="p-3 text-center w-12 border-r border-slate-800 font-black">NO</th>
                    <th className="p-3 text-left border-r border-slate-800 font-black">NAMA BARANG / MATERIAL</th>
                    <th className="p-3 text-center w-28 border-r border-slate-800 font-black">KUANTITAS</th>
                    <th className="p-3 text-center font-black">SATUAN</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-100">
                  {entry?.vehicle_entry_spareparts?.length > 0 ? (
                    entry.vehicle_entry_spareparts.map((sp: any, index: number) => (
                      <tr key={index} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-center border-r border-slate-100 font-black bg-slate-50/50">{index + 1}</td>
                        <td className="p-3 border-r border-slate-100 font-black text-slate-900 text-xs">{sp.spareparts?.name || sp.item_name}</td>
                        <td className="p-3 text-center font-black border-r border-slate-100 text-sm text-slate-900">{sp.qty}</td>
                        <td className="p-3 text-center uppercase text-slate-500 font-black tracking-widest text-[10px]">{sp.spareparts?.unit || '-'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={4} className="p-10 text-center text-slate-400 italic font-bold text-sm uppercase tracking-widest bg-slate-50/50">Tidak Ada Kebutuhan Sparepart</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        {/* Footer Tanda Tangan */}
        <footer className="mt-24">
          <div className="grid grid-cols-3 gap-16 text-center">
            <div className="space-y-20">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">Pemohon / Driver</p>
              <div className="border-t-2 border-slate-900 w-44 mx-auto pt-3">
                <p className="text-xs font-black text-slate-600 uppercase tracking-tighter">( .......................... )</p>
              </div>
            </div>
            <div className="space-y-20">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">Workshop Head</p>
              <div className="border-t-2 border-slate-900 w-44 mx-auto pt-3">
                <p className="text-xs font-black text-slate-600 uppercase tracking-tighter">Pemeriksa</p>
              </div>
            </div>
            <div className="space-y-20">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">Mekanik Pelaksana</p>
              <div className="border-t-2 border-slate-900 w-44 mx-auto pt-3">
                <p className="text-xs font-black text-slate-900 underline uppercase tracking-tighter decoration-2 underline-offset-4">{wo.mechanics?.name}</p>
              </div>
            </div>
          </div>
          <div className="mt-24 pt-6 border-t border-slate-200 flex justify-between items-center text-[9px] text-slate-400 italic font-bold">
            <span className="uppercase tracking-widest">OtoSmart Monitoring System - Digital SPK</span>
            <span className="uppercase tracking-widest">ID: {wo.id.slice(0,13).toUpperCase()} | {new Date().toLocaleString('id-ID')}</span>
          </div>
        </footer>
      </div>

      <style>{`
        @media screen {
          .no-print-bg { background-color: #f8fafc; }
        }
        @media print {
          @page { 
            margin: 10mm; 
            size: A4; 
          }
          html, body {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }
          body { 
            margin: 0 !important; 
            padding: 0 !important; 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important;
          }
          .no-print { 
            display: none !important; 
          }
          .shadow-2xl { 
            box-shadow: none !important; 
          }
          div {
            overflow: visible !important;
            display: block !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          .bg-slate-50 { background-color: #f8fafc !important; }
          .bg-slate-900 { background-color: #0f172a !important; }
          .bg-blue-900 { background-color: #1e3a8a !important; }
          .text-white { color: white !important; }
        }
      `}</style>
    </div>
  );
}
