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

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
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

      // 4. Auto print
      setTimeout(() => {
        window.print();
      }, 1000);

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
    <div className="p-8 font-sans bg-white text-gray-900 min-h-screen">
      <header className="flex justify-between items-center pb-4 border-b-2 border-gray-800">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 uppercase">Surat Perintah Kerja</h1>
          <p className="text-lg text-gray-600 italic">Work Order</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">No. WO: {wo.wo_number}</p>
          <p className="text-sm text-gray-500">Tanggal: {formatDate(wo.work_date)}</p>
        </div>
      </header>

      <main className="mt-6">
        <section className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
          <div className="space-y-2">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b pb-1">Informasi Kendaraan</h2>
            <div className="grid grid-cols-[100px,1fr] gap-x-2 gap-y-1">
              <span className="font-medium">No. Polisi</span>
              <span>: {wo.vehicle_entries?.vehicles?.license_plate}</span>
              <span className="font-medium">Tipe / Merek</span>
              <span>: {wo.vehicle_entries?.vehicles?.brand_type}</span>
              <span className="font-medium">No. Nota Dinas</span>
              <span>: {wo.vehicle_entries?.nota_dinas_number}</span>
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b pb-1">Penugasan Mekanik</h2>
            <div className="grid grid-cols-[100px,1fr] gap-x-2 gap-y-1">
              <span className="font-medium">Nama</span>
              <span>: {wo.mechanics?.name}</span>
              <span className="font-medium">Spesialisasi</span>
              <span>: {wo.mechanics?.specialization}</span>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Detail Pekerjaan</h2>
          <div className="border border-gray-300 rounded-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 border-b border-gray-300">
                <tr>
                  <th className="p-2 text-left font-bold w-12 border-r border-gray-300">NO</th>
                  <th className="p-2 text-left font-bold w-32 border-r border-gray-300">JENIS</th>
                  <th className="p-2 text-left font-bold border-r border-gray-300">DESKRIPSI PEKERJAAN</th>
                  <th className="p-2 text-left font-bold">CATATAN</th>
                </tr>
              </thead>
              <tbody>
                {entry?.vehicle_entry_jobs?.map((job: any, index: number) => (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="p-2 text-center border-r border-gray-300">{index + 1}</td>
                    <td className="p-2 border-r border-gray-300 uppercase font-medium">{job.job_types?.job_group}</td>
                    <td className="p-2 border-r border-gray-300 font-semibold">{job.job_types?.job_name}</td>
                    <td className="p-2 italic text-gray-600">{job.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {entry?.notes && (
            <div className="mt-3 p-3 bg-gray-50 border border-dashed border-gray-300 rounded-sm text-xs">
              <strong>Catatan Tambahan:</strong> {entry.notes}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Estimasi Sparepart / Material</h2>
          <div className="border border-gray-300 rounded-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 border-b border-gray-300">
                <tr>
                  <th className="p-2 text-left font-bold w-12 border-r border-gray-300">NO</th>
                  <th className="p-2 text-left font-bold border-r border-gray-300">NAMA BARANG</th>
                  <th className="p-2 text-center font-bold w-20 border-r border-gray-300">QTY</th>
                  <th className="p-2 text-center font-bold w-24">SATUAN</th>
                </tr>
              </thead>
              <tbody>
                {entry?.vehicle_entry_spareparts && entry.vehicle_entry_spareparts.length > 0 ? (
                  entry.vehicle_entry_spareparts.map((sp: any, index: number) => (
                    <tr key={index} className="border-b border-gray-200">
                      <td className="p-2 text-center border-r border-gray-300">{index + 1}</td>
                      <td className="p-2 border-r border-gray-300 font-semibold">{sp.spareparts?.name || sp.item_name}</td>
                      <td className="p-2 text-center font-bold border-r border-gray-300">{sp.qty}</td>
                      <td className="p-2 text-center uppercase text-gray-500">{sp.spareparts?.unit || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-400 italic">Tidak ada estimasi sparepart.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="mt-12">
        <div className="grid grid-cols-3 gap-4 text-xs text-center">
            <div>
                <p className="font-bold mb-16 uppercase">Pemohon</p>
                <div className="w-32 mx-auto border-b border-black"></div>
                <p className="mt-1">( Nama Terang )</p>
            </div>
            <div>
                <p className="font-bold mb-16 uppercase">Pemeriksa</p>
                <div className="w-32 mx-auto border-b border-black"></div>
                <p className="mt-1">( Workshop Head )</p>
            </div>
            <div>
                <p className="font-bold mb-16 uppercase">Mekanik</p>
                <div className="w-32 mx-auto border-b border-black"></div>
                <p className="mt-1 font-bold">{wo.mechanics?.name || '( Nama Mekanik )'}</p>
            </div>
        </div>
        <div className="mt-12 text-center text-[9px] text-gray-400 border-t pt-2">
            Dokumen ini dicetak secara otomatis oleh sistem pada {new Date().toLocaleString('id-ID')}
        </div>
      </footer>

      <style>{`
        @media print {
          @page { margin: 15mm; size: A4; }
          body { -webkit-print-color-adjust: exact; }
          .no-print { display: none; }
        }
      `}</style>
    </div>
  );
}
