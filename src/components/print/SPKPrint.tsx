import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import { Loader2, Printer, X } from 'lucide-react';

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
      // 1. Fetch Agency Profile
      const { data: agencyData } = await supabase.from('agency_profile').select('*').single();
      setAgency(agencyData);

      // 2. Fetch WO
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

      // 3. Fetch entry details
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

      // 4. Enriched Spareparts
      let enrichedSpareparts = [];
      if (entry.vehicle_entry_spareparts && entry.vehicle_entry_spareparts.length > 0) {
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

      // 5. AUTO PRINT - Identical to SuratJalanPrint.tsx
      setTimeout(() => {
        window.print();
      }, 1500);

    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>;
  }

  if (!data) return <div className="p-8 text-center">Data SPK tidak ditemukan.</div>;

  const { wo, entry } = data;

  return (
    <div className="p-2 max-w-[210mm] mx-auto bg-white min-h-screen text-[11px] font-sans leading-tight text-black">
      {/* Control Bar - Hidden on Print */}
      <div className="no-print mb-4 flex justify-between items-center bg-gray-800 text-white p-2 rounded shadow">
        <span className="text-[10px] font-bold px-2">MODE CETAK SPK</span>
        <div className="flex gap-2">
            <button onClick={() => window.close()} className="px-3 py-1 bg-gray-600 text-[10px] rounded hover:bg-gray-500 flex items-center gap-1">
                <X className="h-3 w-3" /> Tutup
            </button>
            <button onClick={() => window.print()} className="px-4 py-1 bg-blue-600 text-[10px] rounded hover:bg-blue-500 font-bold flex items-center gap-1">
                <Printer className="h-3 w-3" /> Cetak Manual
            </button>
        </div>
      </div>

      {/* Header Section - Same style as Surat Jalan */}
      <div className="border-b-2 border-black pb-2 mb-4">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            {agency?.logo_url && (
              <img src={agency.logo_url} alt="Logo" className="h-12 w-auto object-contain" />
            )}
            <div>
              <h1 className="text-lg font-bold uppercase tracking-wider leading-none">{agency?.name || 'INSTANSI'}</h1>
              <p className="text-sm font-bold mt-1">SURAT PERINTAH KERJA (SPK)</p>
              <p className="text-gray-600 w-80 text-[9px] mt-1 leading-tight">
                {agency?.address}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="mb-1">
              <span className="font-bold block text-sm">{wo.wo_number}</span>
              <span className="text-gray-500 text-[8px] uppercase">NOMOR WO</span>
            </div>
            <div>
              <span className="block text-[10px]">{formatDate(wo.work_date)}</span>
              <span className="text-gray-500 text-[8px] uppercase">TANGGAL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Data Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border border-black p-2 rounded-sm">
            <h3 className="text-[9px] font-bold uppercase border-b border-black mb-1 pb-1">Data Kendaraan</h3>
            <table className="w-full text-[10px]">
                <tbody>
                    <tr><td className="w-20 text-gray-500">No. Polisi</td><td className="font-bold">: {wo.vehicle_entries?.vehicles?.license_plate}</td></tr>
                    <tr><td className="text-gray-500">Merk/Tipe</td><td className="font-bold">: {wo.vehicle_entries?.vehicles?.brand_type}</td></tr>
                    <tr><td className="text-gray-500">Nota Dinas</td><td>: {wo.vehicle_entries?.nota_dinas_number}</td></tr>
                </tbody>
            </table>
        </div>
        <div className="border border-black p-2 rounded-sm">
            <h3 className="text-[9px] font-bold uppercase border-b border-black mb-1 pb-1">Data Mekanik</h3>
            <table className="w-full text-[10px]">
                <tbody>
                    <tr><td className="w-20 text-gray-500">Nama</td><td className="font-bold">: {wo.mechanics?.name}</td></tr>
                    <tr><td className="text-gray-500">Spesialisasi</td><td>: {wo.mechanics?.specialization}</td></tr>
                    <tr><td className="text-gray-500">Status</td><td className="uppercase font-bold text-blue-800">: {wo.status}</td></tr>
                </tbody>
            </table>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="mb-4">
        <h3 className="text-[9px] font-bold uppercase mb-1 px-1">I. DAFTAR PEKERJAAN</h3>
        <table className="w-full border-collapse border border-black text-[10px]">
            <thead>
                <tr className="bg-gray-100">
                    <th className="border border-black p-1 text-center w-8">NO</th>
                    <th className="border border-black p-1 text-left w-32">GRUP</th>
                    <th className="border border-black p-1 text-left">DESKRIPSI PEKERJAAN</th>
                </tr>
            </thead>
            <tbody>
                {entry?.vehicle_entry_jobs?.map((job: any, index: number) => (
                    <tr key={index}>
                        <td className="border border-black p-1 text-center font-bold">{index + 1}</td>
                        <td className="border border-black p-1 uppercase">{job.job_types?.job_group}</td>
                        <td className="border border-black p-1 font-bold">{job.job_types?.job_name}</td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {/* Spareparts Table */}
      <div className="mb-6">
        <h3 className="text-[9px] font-bold uppercase mb-1 px-1">II. ESTIMASI SPAREPART / MATERIAL</h3>
        <table className="w-full border-collapse border border-black text-[10px]">
            <thead>
                <tr className="bg-gray-100">
                    <th className="border border-black p-1 text-center w-8">NO</th>
                    <th className="border border-black p-1 text-left">NAMA BARANG</th>
                    <th className="border border-black p-1 text-center w-16">QTY</th>
                    <th className="border border-black p-1 text-center w-16">SATUAN</th>
                </tr>
            </thead>
            <tbody>
                {entry?.vehicle_entry_spareparts && entry.vehicle_entry_spareparts.length > 0 ? (
                    entry.vehicle_entry_spareparts.map((sp: any, index: number) => (
                        <tr key={index}>
                            <td className="border border-black p-1 text-center font-bold">{index + 1}</td>
                            <td className="border border-black p-1 font-bold">{sp.spareparts?.name || sp.item_name}</td>
                            <td className="border border-black p-1 text-center font-bold">{sp.qty}</td>
                            <td className="border border-black p-1 text-center uppercase text-gray-400">{sp.spareparts?.unit || '-'}</td>
                        </tr>
                    ))
                ) : (
                    <tr><td colSpan={4} className="border border-black p-2 text-center italic text-gray-400 uppercase">Tidak ada estimasi sparepart</td></tr>
                )}
            </tbody>
        </table>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-2 mt-8 text-center page-break-inside-avoid">
        <div>
          <p className="mb-10 font-medium text-[9px] uppercase text-gray-500">Pemohon (Driver)</p>
          <div className="border-t border-black w-3/4 mx-auto pt-1">
            <p className="text-[9px]">( .......................... )</p>
          </div>
        </div>
        <div>
          <p className="mb-10 font-medium text-[9px] uppercase text-gray-500">Pemeriksa (SA)</p>
          <div className="border-t border-black w-3/4 mx-auto pt-1">
            <p className="text-[9px]">( .......................... )</p>
          </div>
        </div>
        <div>
          <p className="mb-10 font-medium text-[9px] uppercase text-gray-500">Mekanik Pelaksana</p>
          <div className="border-t border-black w-3/4 mx-auto pt-1">
            <p className="font-bold text-[10px] underline uppercase">{wo.mechanics?.name}</p>
          </div>
        </div>
      </div>

      <div className="mt-8 text-center text-[8px] text-gray-400 border-t pt-2 italic">
        Dicetak otomatis oleh sistem OtoSmart pada {new Date().toLocaleString('id-ID')}
      </div>

      <style>{`
        @media print {
          @page { margin: 5mm !important; size: A4 !important; }
          body { margin: 0 !important; padding: 0 !important; background: white !important; color: black !important; -webkit-print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
        }
      `}</style>
    </div>
  );
}
