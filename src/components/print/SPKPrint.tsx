import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

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

  // FUNGSI UTAMA: Panggil cetak HANYA saat data sudah benar-benar muncul di layar
  useEffect(() => {
    if (!loading && data) {
      const timer = setTimeout(() => {
        window.print();
      }, 500); // Jeda minimal hanya untuk memastikan render selesai
      return () => clearTimeout(timer);
    }
  }, [loading, data]);

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

      setData({ wo, entry: { ...entry, vehicle_entry_spareparts: enrichedSpareparts } });
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8 text-blue-600 mb-2" />
        <p className="text-sm text-gray-500 font-medium">Memuat SPK...</p>
      </div>
    );
  }

  if (!data) return <div className="p-8 text-center">Data tidak ditemukan.</div>;

  const { wo, entry } = data;

  return (
    <div className="p-4 max-w-[210mm] mx-auto bg-white min-h-screen text-[11px] font-sans leading-tight text-black">
      {/* Header Identik Surat Jalan */}
      <div className="border-b-2 border-black pb-2 mb-4">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            {agency?.logo_url && <img src={agency.logo_url} alt="Logo" className="h-12 w-auto object-contain" />}
            <div>
              <h1 className="text-lg font-bold uppercase tracking-wider">{agency?.name || 'INSTANSI'}</h1>
              <p className="text-sm font-bold mt-0.5">SURAT PERINTAH KERJA</p>
              <p className="text-gray-600 w-80 text-[9px] mt-0.5 leading-tight">{agency?.address}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="mb-1">
              <span className="font-bold block text-sm">{wo.wo_number}</span>
              <span className="text-gray-500 text-[8px]">NO. WO</span>
            </div>
            <div>
              <span className="block text-[10px]">{formatDate(wo.work_date)}</span>
              <span className="text-gray-500 text-[8px]">TANGGAL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Info Kendaraan & Mekanik */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border border-black p-2 rounded-sm">
          <p className="text-[9px] font-bold border-b border-black mb-1 pb-1 uppercase tracking-tighter">Informasi Unit</p>
          <div className="grid grid-cols-[70px_1fr] gap-0.5">
            <span className="text-gray-500">No. Polisi</span><span className="font-bold">: {wo.vehicle_entries?.vehicles?.license_plate}</span>
            <span className="text-gray-500">Merk/Tipe</span><span className="font-bold">: {wo.vehicle_entries?.vehicles?.brand_type}</span>
            <span className="text-gray-500">Nota Dinas</span><span>: {wo.vehicle_entries?.nota_dinas_number || '-'}</span>
          </div>
        </div>
        <div className="border border-black p-2 rounded-sm">
          <p className="text-[9px] font-bold border-b border-black mb-1 pb-1 uppercase tracking-tighter">Personel</p>
          <div className="grid grid-cols-[70px_1fr] gap-0.5">
            <span className="text-gray-500">Mekanik</span><span className="font-bold">: {wo.mechanics?.name}</span>
            <span className="text-gray-500">Spesialisasi</span><span>: {wo.mechanics?.specialization || '-'}</span>
            <span className="text-gray-500">Status</span><span className="uppercase font-bold text-blue-700">: {wo.status}</span>
          </div>
        </div>
      </div>

      {/* Daftar Pekerjaan */}
      <div className="mb-4">
        <p className="text-[9px] font-bold mb-1 uppercase">I. Rincian Pekerjaan / Jasa</p>
        <table className="w-full border-collapse border border-black text-[10px]">
          <thead className="bg-gray-100 border-b border-black">
            <tr>
              <th className="border border-black p-1 text-center w-8">NO</th>
              <th className="border border-black p-1 text-left w-32">KATEGORI</th>
              <th className="border border-black p-1 text-left">DESKRIPSI PEKERJAAN</th>
              <th className="border border-black p-1 text-left w-40">CATATAN</th>
            </tr>
          </thead>
          <tbody>
            {entry?.vehicle_entry_jobs?.map((job: any, index: number) => (
              <tr key={index} className="border-b border-gray-200">
                <td className="border border-black p-1 text-center font-bold">{index + 1}</td>
                <td className="border border-black p-1 uppercase text-[9px]">{job.job_types?.job_group}</td>
                <td className="border border-black p-1 font-bold">{job.job_types?.job_name}</td>
                <td className="border border-black p-1 italic text-gray-500">{job.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Estimasi Sparepart */}
      <div className="mb-8">
        <p className="text-[9px] font-bold mb-1 uppercase">II. Estimasi Suku Cadang & Material</p>
        <table className="w-full border-collapse border border-black text-[10px]">
          <thead className="bg-gray-100 border-b border-black">
            <tr>
              <th className="border border-black p-1 text-center w-8">NO</th>
              <th className="border border-black p-1 text-left">NAMA BARANG / MATERIAL</th>
              <th className="border border-black p-1 text-center w-16">QTY</th>
              <th className="border border-black p-1 text-center w-16">SATUAN</th>
            </tr>
          </thead>
          <tbody>
            {entry?.vehicle_entry_spareparts?.length > 0 ? (
              entry.vehicle_entry_spareparts.map((sp: any, index: number) => (
                <tr key={index} className="border-b border-gray-200">
                  <td className="border border-black p-1 text-center font-bold">{index + 1}</td>
                  <td className="border border-black p-1 font-bold">{sp.spareparts?.name || sp.item_name}</td>
                  <td className="border border-black p-1 text-center font-bold">{sp.qty}</td>
                  <td className="border border-black p-1 text-center uppercase text-gray-400">{sp.spareparts?.unit || '-'}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={4} className="border border-black p-4 text-center italic text-gray-400">TIDAK ADA ESTIMASI SPAREPART</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Tanda Tangan */}
      <div className="grid grid-cols-3 gap-2 mt-8 text-center page-break-inside-avoid">
        <div>
          <p className="mb-12 font-medium text-[9px] uppercase text-gray-500">Pemohon (Driver)</p>
          <div className="border-t border-black w-3/4 mx-auto pt-1">
            <p className="text-[9px]">( .......................... )</p>
          </div>
        </div>
        <div>
          <p className="mb-12 font-medium text-[9px] uppercase text-gray-500">Workshop Head</p>
          <div className="border-t border-black w-3/4 mx-auto pt-1">
            <p className="text-[9px]">( .......................... )</p>
          </div>
        </div>
        <div>
          <p className="mb-12 font-medium text-[9px] uppercase text-gray-500">Mekanik Pelaksana</p>
          <div className="border-t border-black w-3/4 mx-auto pt-1">
            <p className="font-bold text-[10px] underline uppercase">{wo.mechanics?.name}</p>
          </div>
        </div>
      </div>

      <div className="mt-12 text-center text-[8px] text-gray-400 border-t pt-2 italic">
        Dicetak otomatis oleh sistem OtoSmart pada {new Date().toLocaleString('id-ID')}
      </div>

      <style>{`
        @media print {
          @page { margin: 10mm; size: A4; }
          body { margin: 0; padding: 0; background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
