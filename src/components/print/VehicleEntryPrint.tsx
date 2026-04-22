import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface VehicleEntryPrintProps {
  id: string;
}

export default function VehicleEntryPrint({ id }: VehicleEntryPrintProps) {
  const [entry, setEntry] = useState<any>(null);
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

      const { data, error } = await supabase
        .from('vehicle_entries')
        .select(`
          *,
          vehicles (*),
          vehicle_entry_jobs (
            *,
            job_types (*)
          ),
          vehicle_entry_spareparts (*)
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      setEntry(data);

      // Auto print after loading
      setTimeout(() => {
        window.print();
      }, 1000);

    } catch (error) {
      console.error('Error fetching Entry:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  if (!entry) return <div>Data Entry tidak ditemukan.</div>;

  const getJobEstimation = (job: any) => {
    const epRaw = job?.estimated_price;
    const ep = Number(epRaw);
    const sp = Number(job?.job_types?.selling_price || 0);
    if (Number.isFinite(ep) && ep > 0) return ep;
    if ((!Number.isFinite(ep) || epRaw === null || epRaw === undefined) && sp > 0) return sp;
    if (Number.isFinite(ep) && ep === 0 && sp > 0) return sp;
    return Number.isFinite(ep) ? ep : 0;
  };

  const totalJobEstimation = entry.vehicle_entry_jobs?.reduce((sum: number, job: any) => {
    return sum + getJobEstimation(job);
  }, 0) || 0;

  const totalPartEstimation = entry.vehicle_entry_spareparts?.reduce((sum: number, part: any) => {
    return sum + (part.total_price || 0);
  }, 0) || 0;

  const totalEstimation = totalJobEstimation + totalPartEstimation;

  return (
    <div className="printable-area p-8 max-w-[210mm] mx-auto bg-white min-h-screen font-sans text-[11px] leading-relaxed">
      {/* Header */}
      <div className="border-b border-gray-800 pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-4">
            {agency?.logo_url && (
              <img src={agency.logo_url} alt="Logo" className="h-16 w-auto object-contain" />
            )}
            <div>
              <h1 className="text-xl font-bold uppercase tracking-widest text-slate-800">{agency?.name || 'INSTANSI BELUM DISETTING'}</h1>
              <h2 className="text-sm font-bold text-slate-600 mt-1">ESTIMASI AWAL KENDARAAN MASUK</h2>
              <p className="text-slate-500 text-[9px] mt-1 leading-tight">
                {agency?.address}<br />
                {agency?.phone && `Telp: ${agency.phone}`} {agency?.email && `| Email: ${agency.email}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="mb-2">
              <span className="font-bold block text-base text-slate-800">{entry.entry_number}</span>
              <span className="text-slate-400 text-[9px] uppercase tracking-wide">NO. ENTRY</span>
            </div>
            <div>
              <span className="block font-medium">{formatDate(entry.entry_date)}</span>
              <span className="text-slate-400 text-[9px] uppercase tracking-wide">TANGGAL MASUK</span>
            </div>
          </div>
        </div>
      </div>

      {/* Vehicle & Customer Info */}
      <div className="grid grid-cols-2 gap-8 mb-6">
        <div className="space-y-1">
           <h3 className="font-bold border-b border-gray-300 pb-1 mb-2 text-slate-700 uppercase text-[10px]">Informasi Kendaraan</h3>
           <div className="grid grid-cols-[80px_1fr] gap-1">
             <span className="text-slate-500">No. Polisi</span>
             <span className="font-bold">: {entry.vehicles?.license_plate}</span>
             
             <span className="text-slate-500">Merk / Tipe</span>
             <span className="font-semibold">: {entry.vehicles?.brand_type}</span>
             
             <span className="text-slate-500">Jenis</span>
             <span>: {entry.vehicles?.vehicle_type}</span>
           </div>
        </div>
        <div className="space-y-1">
           <h3 className="font-bold border-b border-gray-300 pb-1 mb-2 text-slate-700 uppercase text-[10px]">Informasi Administrasi</h3>
           <div className="grid grid-cols-[80px_1fr] gap-1">
             <span className="text-slate-500">No. Nota Dinas</span>
             <span className="font-semibold">: {entry.nota_dinas_number || '-'}</span>
             
             <span className="text-slate-500">Klasifikasi</span>
             <span>: {entry.service_group?.replace('_', ' ')}</span>
             
             <span className="text-slate-500">Status Entry</span>
             <span className="uppercase">: {entry.status}</span>
           </div>
        </div>
      </div>

      {/* Job List */}
      <div className="mb-8">
        <h3 className="font-bold mb-2 text-slate-700 uppercase text-[10px]">Rincian Estimasi Pekerjaan & Suku Cadang</h3>
        <table className="w-full border-collapse border border-gray-300 text-[10px]">
          <thead>
            <tr className="bg-gray-100 text-slate-700">
              <th className="border border-gray-300 p-2 w-10 text-center font-semibold">No</th>
              <th className="border border-gray-300 p-2 text-left font-semibold">Deskripsi Pekerjaan / Barang</th>
              <th className="border border-gray-300 p-2 text-left font-semibold w-1/3">Qty / Catatan</th>
              <th className="border border-gray-300 p-2 text-right font-semibold w-24">Estimasi Biaya</th>
            </tr>
          </thead>
          <tbody>
            {/* JASA SECTION */}
            <tr className="bg-slate-50">
                <td colSpan={4} className="border border-gray-300 p-1.5 px-2 font-bold text-slate-600 text-[9px] uppercase tracking-wider">
                    A. Jasa / Perbaikan
                </td>
            </tr>
            {entry.vehicle_entry_jobs && entry.vehicle_entry_jobs.length > 0 ? (
                entry.vehicle_entry_jobs.map((job: any, index: number) => (
                  <tr key={`job-${index}`} className="border-b border-gray-200">
                    <td className="border-x border-gray-300 p-2 text-center align-top">{index + 1}</td>
                    <td className="border-x border-gray-300 p-2 align-top">
                      <div className="font-medium text-slate-800">{job.job_types?.job_name}</div>
                      <div className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-tight">
                        {job.job_types?.job_group?.replace('_', ' ')}
                      </div>
                    </td>
                    <td className="border-x border-gray-300 p-2 text-slate-600 italic align-top">{job.notes || '-'}</td>
                    <td className="border-x border-gray-300 p-2 text-right font-medium align-top">
                        {getJobEstimation(job) ? formatCurrency(getJobEstimation(job)) : '-'}
                    </td>
                  </tr>
                ))
            ) : (
                <tr><td colSpan={4} className="border border-gray-300 p-4 text-center italic text-slate-400">Tidak ada jasa.</td></tr>
            )}

            {/* SPAREPART SECTION */}
            <tr className="bg-slate-50">
                <td colSpan={4} className="border border-gray-300 p-1.5 px-2 font-bold text-slate-600 text-[9px] uppercase tracking-wider">
                    B. Suku Cadang / Sparepart
                </td>
            </tr>
            {entry.vehicle_entry_spareparts && entry.vehicle_entry_spareparts.length > 0 ? (
                entry.vehicle_entry_spareparts.map((part: any, index: number) => (
                  <tr key={`part-${index}`} className="border-b border-gray-200">
                    <td className="border-x border-gray-300 p-2 text-center align-top">{index + 1}</td>
                    <td className="border-x border-gray-300 p-2 align-top font-medium text-slate-800">
                      {part.item_name}
                    </td>
                    <td className="border-x border-gray-300 p-2 text-slate-600 align-top">
                        {part.qty} x {formatCurrency(part.estimated_price)}
                    </td>
                    <td className="border-x border-gray-300 p-2 text-right font-medium align-top">
                        {formatCurrency(part.total_price || 0)}
                    </td>
                  </tr>
                ))
            ) : (
                <tr><td colSpan={4} className="border border-gray-300 p-4 text-center italic text-slate-400">Tidak ada estimasi sparepart.</td></tr>
            )}

            {/* TOTAL */}
            <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                <td colSpan={3} className="border border-gray-300 p-2 text-right text-slate-800">TOTAL ESTIMASI AWAL</td>
                <td className="border border-gray-300 p-2 text-right text-slate-900 text-sm">{formatCurrency(totalEstimation)}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-[9px] text-slate-500 mt-2 italic">
            * Harga di atas adalah estimasi awal berdasarkan daftar pekerjaan standar. Biaya aktual dapat berubah sesuai kondisi kendaraan dan penggantian sparepart tambahan.
        </p>
      </div>
      
      {/* Notes Section if any */}
      {entry.notes && (
          <div className="mb-8 border border-gray-200 rounded p-3 bg-gray-50">
              <h4 className="font-bold text-[10px] text-slate-600 mb-1">Catatan Tambahan:</h4>
              <p className="text-slate-800">{entry.notes}</p>
          </div>
      )}

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-4 mt-12 page-break-inside-avoid text-center">
        <div>
          <p className="mb-12 font-medium text-slate-600">Diketahui Oleh (Manager Operasional)</p>
          <div className="border-t border-slate-400 w-3/4 mx-auto pt-2">
            <p className="font-bold text-slate-800">( ....................................... )</p>
          </div>
        </div>
        
        <div>
          <p className="mb-12 font-medium text-slate-600">Disetujui Oleh (PIC Ditlantas)</p>
          <div className="border-t border-slate-400 w-3/4 mx-auto pt-2">
            <p className="font-bold text-slate-800">( ....................................... )</p>
          </div>
        </div>

        <div>
          <p className="mb-12 font-medium text-slate-600">Dibuat Oleh (Service Advisor)</p>
          <div className="border-t border-slate-400 w-3/4 mx-auto pt-2">
            <p className="font-bold text-slate-800">( Admin / SA )</p>
          </div>
        </div>
      </div>
      
      <div className="mt-12 flex justify-between items-end border-t border-gray-200 pt-4 text-[9px] text-slate-400">
        <div>
            Dicetak oleh sistem OtoSmart
        </div>
        <div>
            {new Date().toLocaleString('id-ID')}
        </div>
      </div>
      
      {/* Print specific styles */}
      <style>{`
        @media print {
          @page { margin: 10mm; size: A4; }
          body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact; }
          .no-print { display: none; }
        }
      `}</style>
    </div>
  );
}
