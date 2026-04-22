import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import { Loader2, Printer, X, AlertCircle } from 'lucide-react';

interface PrintSPKProps {
  id: string;
}

export default function PrintSPK({ id }: PrintSPKProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [agency, setAgency] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
      setError(null);
      
      // 1. Fetch Agency Profile
      const { data: agencyData } = await supabase.from('agency_profile').select('*').single();
      setAgency(agencyData);

      // 2. Fetch WO
      const { data: wo, error: woError } = await supabase
        .from('work_orders')
        .select(`*, mechanics (*), vehicle_entries (*, vehicles (*))`)
        .eq('id', id)
        .single();

      if (woError) throw new Error(`Gagal mengambil data WO: ${woError.message}`);
      if (!wo) throw new Error('Work Order tidak ditemukan');

      // 3. Fetch Entry Details - HANYA JIKA vehicle_entry_id ADA
      let entry = null;
      if (wo.vehicle_entry_id) {
        const { data: entryData, error: entryError } = await supabase
          .from('vehicle_entries')
          .select(`*, vehicle_entry_jobs (*, job_types (*)), vehicle_entry_spareparts (*)`)
          .eq('id', wo.vehicle_entry_id)
          .single();

        if (entryError) throw new Error(`Gagal mengambil data entry: ${entryError.message}`);
        entry = entryData;

        // 4. Enrich spareparts dengan data barang
        if (entry?.vehicle_entry_spareparts?.length > 0) {
          const goodsIds = entry.vehicle_entry_spareparts
            .map((sp: any) => sp.goods_id)
            .filter(Boolean);

          if (goodsIds.length > 0) {
            const { data: goodsData } = await supabase
              .from('goods')
              .select('*')
              .in('id', goodsIds);
            
            const goodsMap = new Map(goodsData?.map((g: any) => [g.id, g]) || []);
            entry.vehicle_entry_spareparts = entry.vehicle_entry_spareparts.map((sp: any) => ({
              ...sp,
              spareparts: sp.goods_id ? goodsMap.get(sp.goods_id) || null : null,
            }));
          }
        }
      }

      setData({ wo, entry });
    } catch (err: any) {
      console.error('Error fetching SPK data:', err);
      setError(err.message || 'Terjadi kesalahan saat memuat data');
    } finally {
      setLoading(false);
    }
  }

  const handlePrint = () => {
    window.print();
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <Loader2 className="animate-spin h-12 w-12 text-blue-600 mb-4" />
        <p className="text-gray-600 font-medium text-lg">Memuat dokumen SPK...</p>
        <p className="text-gray-400 text-sm mt-2">Mohon tunggu sebentar</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8">
        <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-red-600 mb-2">Gagal Memuat Data</h2>
        <p className="text-gray-600 text-center mb-6 max-w-md">{error}</p>
        <div className="flex gap-4">
          <button 
            onClick={() => window.close()}
            className="px-6 py-3 border-2 border-gray-300 rounded-lg font-bold hover:bg-gray-50"
          >
            Tutup
          </button>
          <button 
            onClick={() => { setLoading(true); setError(null); fetchData(); }}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  // No data state
  if (!data) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8">
        <AlertCircle className="h-16 w-16 text-yellow-500 mb-4" />
        <h2 className="text-xl font-bold text-yellow-600 mb-2">Data Tidak Ditemukan</h2>
        <p className="text-gray-600 text-center mb-6">Work Order dengan ID ini tidak ditemukan.</p>
        <button 
          onClick={() => window.close()}
          className="px-6 py-3 border-2 border-gray-300 rounded-lg font-bold hover:bg-gray-50"
        >
          Tutup
        </button>
      </div>
    );
  }

  const { wo, entry } = data;

  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Control Bar */}
      <div className="sticky top-0 z-50 bg-white border-b-2 border-gray-200 shadow-sm">
        <div className="max-w-[210mm] mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-green-500"></div>
            <span className="text-base font-bold text-gray-800 uppercase tracking-wide">
              Dokumen SPK Siap Cetak
            </span>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => window.close()} 
              className="px-5 py-2.5 text-sm font-bold border-2 border-gray-300 rounded-lg hover:bg-gray-100 transition-all flex items-center gap-2"
            >
              <X className="h-4 w-4" /> Tutup
            </button>
            <button 
              onClick={handlePrint} 
              className="px-8 py-2.5 text-sm font-black bg-blue-700 text-white rounded-lg hover:bg-blue-800 shadow-lg transition-all flex items-center gap-2 uppercase tracking-wider"
            >
              <Printer className="h-5 w-5" /> Cetak / Simpan PDF
            </button>
          </div>
        </div>
      </div>

      {/* Document Container */}
      <div className="max-w-[210mm] mx-auto my-8 p-10 bg-white shadow-2xl">
        
        {/* Header */}
        <header className="flex justify-between items-start border-b-4 border-gray-900 pb-6 mb-8">
          <div className="flex items-center gap-6">
            {agency?.logo_url && (
              <img src={agency.logo_url} alt="Logo" className="h-20 w-auto" />
            )}
            <div>
              <h1 className="text-2xl font-black uppercase">{agency?.name || 'INSTANSI'}</h1>
              <p className="text-xs font-bold text-blue-700 uppercase tracking-widest mt-1">Surat Perintah Kerja</p>
              <p className="text-[10px] text-gray-500 mt-1 max-w-md">{agency?.address}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="bg-gray-900 text-white px-6 py-2 rounded-md mb-2 inline-block">
              <h2 className="text-2xl font-black tracking-tight">SPK</h2>
            </div>
            <p className="text-sm font-black">NO: {wo.wo_number}</p>
            <p className="text-xs text-gray-500">{formatDate(wo.work_date)}</p>
          </div>
        </header>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="border-2 border-gray-200 rounded-lg p-4">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2 mb-3">Kendaraan</h3>
            <table className="w-full text-xs">
              <tbody className="space-y-2">
                <tr className="flex">
                  <td className="w-28 text-gray-500 font-bold uppercase">No. Polisi</td>
                  <td className="font-black text-gray-900">: {wo.vehicle_entries?.vehicles?.license_plate || '-'}</td>
                </tr>
                <tr className="flex">
                  <td className="w-28 text-gray-500 font-bold uppercase">Merek / Tipe</td>
                  <td className="font-bold text-gray-800">: {wo.vehicle_entries?.vehicles?.brand_type || '-'}</td>
                </tr>
                <tr className="flex border-t border-gray-100 pt-2 mt-2">
                  <td className="w-28 text-gray-500 font-bold uppercase">Nota Dinas</td>
                  <td className="font-medium text-gray-700">: {wo.vehicle_entries?.nota_dinas_number || '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div className="border-2 border-gray-200 rounded-lg p-4">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2 mb-3">Mekanik</h3>
            <table className="w-full text-xs">
              <tbody className="space-y-2">
                <tr className="flex">
                  <td className="w-28 text-gray-500 font-bold uppercase">Nama</td>
                  <td className="font-black text-gray-900">: {wo.mechanics?.name || '-'}</td>
                </tr>
                <tr className="flex">
                  <td className="w-28 text-gray-500 font-bold uppercase">Spesialisasi</td>
                  <td className="font-bold text-gray-800">: {wo.mechanics?.specialization || '-'}</td>
                </tr>
                <tr className="flex border-t border-gray-100 pt-2 mt-2">
                  <td className="w-28 text-gray-500 font-bold uppercase">Status</td>
                  <td className="font-black text-blue-700 uppercase">: {wo.status}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Jobs Table */}
        <div className="mb-8">
          <h3 className="text-xs font-black uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="h-5 w-1 bg-gray-900 rounded"></span>
            I. Rincian Pekerjaan
          </h3>
          <table className="w-full border-collapse border-2 border-gray-900 text-[11px]">
            <thead className="bg-gray-900 text-white">
              <tr>
                <th className="border border-gray-700 p-3 text-center w-12 font-black">NO</th>
                <th className="border border-gray-700 p-3 text-left w-48 font-black">KATEGORI</th>
                <th className="border border-gray-700 p-3 text-left font-black">DESKRIPSI PEKERJAAN</th>
                <th className="border border-gray-700 p-3 text-left font-black">CATATAN</th>
              </tr>
            </thead>
            <tbody>
              {entry?.vehicle_entry_jobs?.length > 0 ? (
                entry.vehicle_entry_jobs.map((job: any, index: number) => (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="border border-gray-200 p-3 text-center font-black">{index + 1}</td>
                    <td className="border border-gray-200 p-3 font-bold uppercase text-[10px] text-gray-600">{job.job_types?.job_group || '-'}</td>
                    <td className="border border-gray-200 p-3 font-black text-gray-900">{job.job_types?.job_name || '-'}</td>
                    <td className="border border-gray-200 p-3 italic text-gray-400">{job.notes || '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="border border-gray-200 p-6 text-center text-gray-400 italic font-medium">
                    Tidak ada detail pekerjaan
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Spareparts Table */}
        <div className="mb-10">
          <h3 className="text-xs font-black uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="h-5 w-1 bg-gray-900 rounded"></span>
            II. Estimasi Sparepart & Material
          </h3>
          <table className="w-full border-collapse border-2 border-gray-900 text-[11px]">
            <thead className="bg-gray-900 text-white">
              <tr>
                <th className="border border-gray-700 p-3 text-center w-12 font-black">NO</th>
                <th className="border border-gray-700 p-3 text-left font-black">NAMA BARANG</th>
                <th className="border border-gray-700 p-3 text-center w-28 font-black">QTY</th>
                <th className="border border-gray-700 p-3 text-center w-24 font-black">SATUAN</th>
              </tr>
            </thead>
            <tbody>
              {entry?.vehicle_entry_spareparts?.length > 0 ? (
                entry.vehicle_entry_spareparts.map((sp: any, index: number) => (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="border border-gray-200 p-3 text-center font-black">{index + 1}</td>
                    <td className="border border-gray-200 p-3 font-black text-gray-900">{sp.spareparts?.name || sp.item_name || '-'}</td>
                    <td className="border border-gray-200 p-3 text-center font-black text-gray-900">{sp.qty || 0}</td>
                    <td className="border border-gray-200 p-3 text-center uppercase text-gray-500 font-bold">{sp.spareparts?.unit || '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="border border-gray-200 p-6 text-center text-gray-400 italic font-medium uppercase">
                    Tidak ada estimasi sparepart
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Signatures */}
        <footer className="mt-16">
          <div className="grid grid-cols-3 gap-8 text-center">
            <div className="space-y-16">
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Pemohon / Driver</p>
              <div className="border-t-2 border-gray-900 w-40 mx-auto pt-3">
                <p className="text-xs font-black text-gray-600">( .......................... )</p>
              </div>
            </div>
            <div className="space-y-16">
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Workshop Head</p>
              <div className="border-t-2 border-gray-900 w-40 mx-auto pt-3">
                <p className="text-xs font-black text-gray-600">( .......................... )</p>
              </div>
            </div>
            <div className="space-y-16">
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Mekanik</p>
              <div className="border-t-2 border-gray-900 w-40 mx-auto pt-3">
                <p className="text-xs font-black text-gray-900 underline underline-offset-4">{wo.mechanics?.name || '(...........................)'}</p>
              </div>
            </div>
          </div>
          <div className="mt-16 pt-4 border-t border-gray-200 flex justify-between items-center text-[9px] text-gray-400 italic font-bold">
            <span className="uppercase tracking-widest">OtoSmart Workshop System</span>
            <span className="uppercase tracking-widest">ID: {wo.id?.slice(0, 13)?.toUpperCase() || 'N/A'} | {new Date().toLocaleString('id-ID')}</span>
          </div>
        </footer>
      </div>

      <style>{`
        @page { margin: 10mm; size: A4; }
        html, body { height: auto; overflow: visible; background: white; }
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
        @media print {
          .sticky { position: static !important; }
          .shadow-2xl { box-shadow: none !important; }
          .border-b-2 { border-bottom-width: 2px !important; }
          .bg-gray-100 { background: white !important; }
          .bg-white { background: white !important; }
          .bg-gray-900 { background: #111827 !important; color: white !important; }
          .text-white { color: white !important; }
          .border-gray-900 { border-color: #111827 !important; }
          .border-gray-700 { border-color: #374151 !important; }
          .border-gray-200 { border-color: #e5e7eb !important; }
          button { display: none !important; }
        }
      `}</style>
    </div>
  );
}
