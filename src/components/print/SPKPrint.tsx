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

  // Trigger cetak hanya setelah data benar-benar siap dan loading selesai
  useEffect(() => {
    if (!loading && data && agency) {
      const timer = setTimeout(() => {
        window.print();
      }, 3000); // Jeda 3 detik agar render stabil
      return () => clearTimeout(timer);
    }
  }, [loading, data, agency]);

  async function fetchData() {
    try {
      // 1. Fetch Agency Profile
      const { data: agencyData } = await supabase.from('agency_profile').select('*').single();
      setAgency(agencyData);

      // 2. Fetch WO with basic details
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

      // 3. Fetch entry with jobs and spareparts
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

      // 4. Fetch spareparts detail from 'goods' table
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

    } catch (error) {
      console.error('Error fetching SPK data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen gap-4">
        <Loader2 className="animate-spin h-10 w-10 text-blue-600" />
        <p className="text-slate-500 font-medium">Menyiapkan Dokumen SPK...</p>
      </div>
    );
  }

  if (!data) return <div className="p-8 text-center font-bold text-red-500">Data SPK tidak ditemukan atau gagal dimuat.</div>;

  const { wo, entry } = data;

  return (
    <div className="bg-white min-h-screen font-sans text-black">
      {/* Control Bar - Only visible on screen */}
      <div className="no-print sticky top-0 z-50 flex items-center justify-between bg-slate-800 p-4 text-white shadow-lg">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-sm font-medium">Dokumen Siap Dicetak</span>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => window.close()} 
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-sm transition-colors"
          >
            <X className="h-4 w-4" /> Tutup
          </button>
          <button 
            onClick={() => window.print()} 
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-md text-sm font-bold shadow-md transition-all active:scale-95"
          >
            <Printer className="h-4 w-4" /> Cetak Sekarang
          </button>
        </div>
      </div>

      {/* Main Print Area */}
      <div className="mx-auto max-w-[210mm] p-10 print:p-0">
        <div className="border-b-4 border-double border-black pb-4 mb-6">
          <table className="w-full">
            <tbody>
              <tr>
                <td className="w-20">
                  {agency?.logo_url && (
                    <img src={agency.logo_url} alt="Logo" className="h-20 w-auto object-contain" />
                  )}
                </td>
                <td className="pl-6">
                  <h1 className="text-2xl font-black uppercase leading-none">{agency?.name || 'SURAT PERINTAH KERJA'}</h1>
                  <p className="text-[11px] mt-2 leading-tight text-gray-700">
                    {agency?.address}<br />
                    {agency?.phone && `Telp: ${agency.phone}`} {agency?.email && `| Email: ${agency.email}`}
                  </p>
                </td>
                <td className="text-right align-top">
                  <div className="inline-block border-2 border-black p-2 text-center">
                    <h2 className="text-2xl font-black leading-none">SPK</h2>
                    <p className="text-[10px] font-bold mt-1 uppercase">Work Order</p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mb-8">
          <table className="w-full text-xs">
            <tbody>
              <tr>
                <td className="w-1/2 align-top pr-4">
                  <table className="w-full border-collapse">
                    <tbody>
                      <tr><td className="w-24 py-1 font-bold">NOMOR WO</td><td className="py-1">: {wo.wo_number}</td></tr>
                      <tr><td className="py-1 font-bold">TANGGAL</td><td className="py-1">: {formatDate(wo.work_date)}</td></tr>
                      <tr><td className="py-1 font-bold">MEKANIK</td><td className="py-1">: <span className="font-black underline">{wo.mechanics?.name}</span></td></tr>
                    </tbody>
                  </table>
                </td>
                <td className="w-1/2 align-top pl-4 border-l border-gray-300">
                  <table className="w-full border-collapse">
                    <tbody>
                      <tr><td className="w-24 py-1 font-bold">NO. POLISI</td><td className="py-1">: <span className="font-black text-sm">{wo.vehicle_entries?.vehicles?.license_plate}</span></td></tr>
                      <tr><td className="py-1 font-bold">MERK/TIPE</td><td className="py-1">: {wo.vehicle_entries?.vehicles?.brand_type}</td></tr>
                      <tr><td className="py-1 font-bold">NOTA DINAS</td><td className="py-1">: {wo.vehicle_entries?.nota_dinas_number}</td></tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mb-8">
          <h3 className="text-xs font-black uppercase mb-2 border-b border-black inline-block">I. RINCIAN PEKERJAAN</h3>
          <table className="w-full border-collapse border-2 border-black text-[11px]">
            <thead>
              <tr className="bg-gray-100">
                <th className="border-2 border-black p-2 w-10 text-center">NO</th>
                <th className="border-2 border-black p-2 text-left w-40">GRUP</th>
                <th className="border-2 border-black p-2 text-left">DESKRIPSI PEKERJAAN</th>
                <th className="border-2 border-black p-2 text-left w-48">CATATAN MEKANIK</th>
              </tr>
            </thead>
            <tbody>
              {entry?.vehicle_entry_jobs?.map((job: any, index: number) => (
                <tr key={index}>
                  <td className="border border-black p-2 text-center font-bold">{index + 1}</td>
                  <td className="border border-black p-2 uppercase font-medium">{job.job_types?.job_group}</td>
                  <td className="border border-black p-2 font-black">{job.job_types?.job_name}</td>
                  <td className="border border-black p-2 italic text-gray-400">....................................</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mb-10">
          <h3 className="text-xs font-black uppercase mb-2 border-b border-black inline-block">II. ESTIMASI SUKU CADANG / MATERIAL</h3>
          <table className="w-full border-collapse border-2 border-black text-[11px]">
            <thead>
              <tr className="bg-gray-100">
                <th className="border-2 border-black p-2 w-10 text-center">NO</th>
                <th className="border-2 border-black p-2 text-left">NAMA BARANG / MATERIAL</th>
                <th className="border-2 border-black p-2 text-center w-20">QTY</th>
                <th className="border-2 border-black p-2 text-center w-20">SATUAN</th>
              </tr>
            </thead>
            <tbody>
              {entry?.vehicle_entry_spareparts && entry.vehicle_entry_spareparts.length > 0 ? (
                entry.vehicle_entry_spareparts.map((sp: any, index: number) => (
                  <tr key={index}>
                    <td className="border border-black p-2 text-center font-bold">{index + 1}</td>
                    <td className="border border-black p-2 font-black">{sp.spareparts?.name || sp.item_name}</td>
                    <td className="border border-black p-2 text-center font-bold">{sp.qty}</td>
                    <td className="border border-black p-2 text-center uppercase">{sp.spareparts?.unit || '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="border border-black p-4 text-center italic text-gray-500">
                    Tidak ada estimasi sparepart/material.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-16">
          <table className="w-full text-center text-[11px]">
            <tbody>
              <tr>
                <td className="w-1/3 pb-20 font-bold uppercase">Pemohon / Driver</td>
                <td className="w-1/3 pb-20 font-bold uppercase">Workshop Head</td>
                <td className="w-1/3 pb-20 font-bold uppercase">Mekanik Pelaksana</td>
              </tr>
              <tr>
                <td>( ............................ )</td>
                <td>( ............................ )</td>
                <td><span className="font-black underline">{wo.mechanics?.name}</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-20 pt-2 border-t border-gray-400 flex justify-between items-center text-[9px] text-gray-500 italic">
          <span>Dicetak otomatis oleh Workshop Monitoring System</span>
          <span>{new Date().toLocaleString('id-ID')} | ID: {wo.id.slice(0,8)}</span>
        </div>
      </div>

      <style>{`
        @media print {
          @page { 
            margin: 15mm; 
            size: A4; 
          }
          body { 
            margin: 0; 
            padding: 0; 
            background: white !important;
            color: black !important;
          }
          .no-print { 
            display: none !important; 
          }
          table {
            border-collapse: collapse !important;
          }
          th, td {
            border-color: black !important;
          }
        }
      `}</style>
    </div>
  );
}
