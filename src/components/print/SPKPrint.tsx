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
      
      // Tandai data siap, lalu beri jeda sebelum cetak otomatis
      setIsReady(true);
      setTimeout(() => {
        window.print();
      }, 2000);

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
        <p className="text-slate-600 font-medium">Mempersiapkan Dokumen SPK...</p>
      </div>
    );
  }

  if (!data) return <div className="p-8 text-center text-red-500 font-bold">Data SPK tidak ditemukan.</div>;

  const { wo, entry } = data;

  return (
    <div className="bg-slate-100 min-h-screen print:bg-white print:min-h-0">
      {/* Control Bar - Layar Saja */}
      <div className="no-print sticky top-0 z-50 bg-white border-b shadow-sm p-4 mb-6">
        <div className="max-w-[210mm] mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`h-5 w-5 ${isReady ? 'text-green-500' : 'text-slate-300'}`} />
            <span className="text-sm font-semibold text-slate-700">
              {isReady ? 'Dokumen Siap Dicetak' : 'Memuat Data...'}
            </span>
          </div>
          <div className="flex gap-3">
            <button onClick={() => window.close()} className="px-4 py-2 text-sm font-medium border rounded-md hover:bg-slate-50 transition-colors flex items-center gap-2">
              <X className="h-4 w-4" /> Tutup
            </button>
            <button onClick={() => window.print()} className="px-6 py-2 text-sm font-bold bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-md transition-all flex items-center gap-2">
              <Printer className="h-4 w-4" /> Cetak Sekarang
            </button>
          </div>
        </div>
      </div>

      {/* KONTEN UTAMA - Desain Modern (Enhanced) */}
      <div className="max-w-[210mm] mx-auto p-[15mm] bg-white shadow-xl print:shadow-none print:p-0 print:m-0 mb-10 overflow-visible">
        
        {/* Header dengan Kotak Biru SPK */}
        <header className="flex justify-between items-start pb-6 border-b-2 border-slate-800 mb-8">
          <div className="flex gap-6 items-center">
            {agency?.logo_url && (
              <img src={agency.logo_url} alt="Logo" className="h-20 w-auto object-contain" width="80" height="80" />
            )}
            <div>
              <h1 className="text-2xl font-black text-slate-900 uppercase leading-tight">{agency?.name || 'SURAT PERINTAH KERJA'}</h1>
              <p className="text-xs text-slate-500 font-medium mt-1 uppercase tracking-wide">Workshop Monitoring System</p>
              <p className="text-[10px] text-slate-400 mt-1 max-w-xs leading-relaxed">{agency?.address}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="bg-blue-900 text-white px-6 py-2 rounded-sm mb-2 inline-block">
                <h2 className="text-2xl font-black tracking-tighter">SPK</h2>
            </div>
            <p className="text-sm font-bold text-slate-800">No: {wo.wo_number}</p>
            <p className="text-xs text-slate-500 font-medium">{formatDate(wo.work_date)}</p>
          </div>
        </header>

        <main className="space-y-8">
          {/* Grid Informasi */}
          <div className="grid grid-cols-2 gap-10">
            <section>
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b pb-1 mb-3">Detail Kendaraan</h3>
              <table className="w-full text-xs">
                <tbody>
                  <tr><td className="w-24 py-1.5 text-slate-500 font-medium">No. Polisi</td><td className="font-bold text-slate-900">: {wo.vehicle_entries?.vehicles?.license_plate}</td></tr>
                  <tr><td className="py-1.5 text-slate-500 font-medium">Merek / Tipe</td><td className="font-bold text-slate-900">: {wo.vehicle_entries?.vehicles?.brand_type}</td></tr>
                  <tr><td className="py-1.5 text-slate-500 font-medium">Nota Dinas</td><td className="font-medium">: {wo.vehicle_entries?.nota_dinas_number}</td></tr>
                </tbody>
              </table>
            </section>
            <section>
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b pb-1 mb-3">Penanggung Jawab</h3>
              <table className="w-full text-xs">
                <tbody>
                  <tr><td className="w-24 py-1.5 text-slate-500 font-medium">Mekanik</td><td className="font-bold text-slate-900">: {wo.mechanics?.name}</td></tr>
                  <tr><td className="py-1.5 text-slate-500 font-medium">Spesialisasi</td><td className="font-medium">: {wo.mechanics?.specialization}</td></tr>
                  <tr><td className="py-1.5 text-slate-500 font-medium">Status WO</td><td className="font-bold text-blue-700 uppercase">: {wo.status}</td></tr>
                </tbody>
              </table>
            </section>
          </div>

          {/* Tabel Pekerjaan */}
          <section>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-slate-400"></div>
                I. Daftar Pekerjaan (Service Items)
            </h3>
            <div className="border border-slate-300 rounded-sm overflow-hidden">
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-slate-50 border-b border-slate-300">
                  <tr className="text-slate-600">
                    <th className="p-2.5 text-center w-10 border-r border-slate-300 font-bold">NO</th>
                    <th className="p-2.5 text-left w-48 border-r border-slate-300 font-bold">KATEGORI</th>
                    <th className="p-2.5 text-left border-r border-slate-300 font-bold">DESKRIPSI PEKERJAAN</th>
                    <th className="p-2.5 text-left font-bold">CATATAN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {entry?.vehicle_entry_jobs?.map((job: any, index: number) => (
                    <tr key={index} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2.5 text-center border-r border-slate-300 font-semibold">{index + 1}</td>
                      <td className="p-2.5 border-r border-slate-300 font-medium uppercase text-[10px] text-slate-500">{job.job_types?.job_group}</td>
                      <td className="p-2.5 border-r border-slate-300 font-bold text-slate-800">{job.job_types?.job_name}</td>
                      <td className="p-2.5 italic text-slate-400 text-[10px]">{job.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Tabel Sparepart */}
          <section>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-slate-400"></div>
                II. Estimasi Sparepart & Material
            </h3>
            <div className="border border-slate-300 rounded-sm overflow-hidden">
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-slate-50 border-b border-slate-300">
                  <tr className="text-slate-600">
                    <th className="p-2.5 text-center w-10 border-r border-slate-300 font-bold">NO</th>
                    <th className="p-2.5 text-left border-r border-slate-300 font-bold">NAMA BARANG / MATERIAL</th>
                    <th className="p-2.5 text-center w-24 border-r border-slate-300 font-bold">QTY</th>
                    <th className="p-2.5 text-center font-bold">SATUAN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {entry?.vehicle_entry_spareparts?.length > 0 ? (
                    entry.vehicle_entry_spareparts.map((sp: any, index: number) => (
                      <tr key={index} className="hover:bg-slate-50 transition-colors">
                        <td className="p-2.5 text-center border-r border-slate-300 font-semibold">{index + 1}</td>
                        <td className="p-2.5 border-r border-slate-300 font-bold text-slate-800">{sp.spareparts?.name || sp.item_name}</td>
                        <td className="p-2.5 text-center font-bold border-r border-slate-300 text-slate-900">{sp.qty}</td>
                        <td className="p-2.5 text-center uppercase text-slate-400 font-medium">{sp.spareparts?.unit || '-'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={4} className="p-6 text-center text-slate-400 italic font-medium">Tidak ada estimasi sparepart untuk pekerjaan ini.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        {/* Footer Tanda Tangan */}
        <footer className="mt-20">
          <div className="grid grid-cols-3 gap-10 text-center">
            <div className="space-y-16">
              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Pemohon / Driver</p>
              <div className="border-t border-slate-800 w-40 mx-auto pt-2">
                <p className="text-xs font-medium text-slate-600">( .......................... )</p>
              </div>
            </div>
            <div className="space-y-16">
              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Workshop Head</p>
              <div className="border-t border-slate-800 w-40 mx-auto pt-2">
                <p className="text-xs font-medium text-slate-600">Pemeriksa</p>
              </div>
            </div>
            <div className="space-y-16">
              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Mekanik Pelaksana</p>
              <div className="border-t border-slate-800 w-40 mx-auto pt-2">
                <p className="text-xs font-bold text-slate-900 underline uppercase">{wo.mechanics?.name}</p>
              </div>
            </div>
          </div>
          <div className="mt-20 pt-4 border-t border-slate-100 flex justify-between items-center text-[9px] text-slate-400 italic">
            <span>Dokumen dicetak otomatis oleh Workshop Monitoring System</span>
            <span>{new Date().toLocaleString('id-ID')} | ID WO: {wo.id.slice(0,8)}</span>
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
          }
          body { 
            margin: 0 !important; 
            padding: 0 !important; 
            background: white !important; 
            -webkit-print-color-adjust: exact !important; 
          }
          .no-print { 
            display: none !important; 
          }
          .shadow-xl { 
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
        }
      `}</style>
    </div>
  );
}
