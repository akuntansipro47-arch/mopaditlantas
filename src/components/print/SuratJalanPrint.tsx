import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { incrementDocumentPrintCounter } from '@/lib/printCounter';

interface SuratJalanPrintProps {
  id: string;
}

export default function SuratJalanPrint({ id }: SuratJalanPrintProps) {
  const [wo, setWo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [agency, setAgency] = useState<any>(null);
  const [printCount, setPrintCount] = useState<number>(1);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
      // Fetch Agency Profile
      const { data: agencyData } = await supabase.from('agency_profile').select('*').single();
      setAgency(agencyData);

      const { data, error } = await supabase
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
      
      if (error) throw error;
      setWo(data);

      const cnt = await incrementDocumentPrintCounter('SURAT_JALAN', String(id));
      setPrintCount(cnt);

      // Auto print after loading
      setTimeout(() => {
        window.print();
      }, 1000);

    } catch (error) {
      console.error('Error fetching WO:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }

  if (!wo) return <div>Data Surat Jalan tidak ditemukan.</div>;

  const isCopy = printCount > 1;

  return (
    <div className="printable-area p-2 max-w-[210mm] mx-auto bg-white min-h-screen text-[10px] font-sans leading-tight relative">
      {isCopy && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          <div
            style={{
              transform: 'rotate(-30deg)',
              fontSize: '72px',
              fontWeight: 900,
              color: '#000',
              opacity: 0.1,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            COPY SURAT JALAN
          </div>
        </div>
      )}
      <div className="relative z-10">
      {/* Header */}
      <div className="border-b-2 border-black pb-1 mb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            {agency?.logo_url && (
              <img src={agency.logo_url} alt="Logo" className="h-12 w-auto object-contain" />
            )}
            <div>
              <h1 className="text-lg font-bold uppercase tracking-wider">{agency?.name || 'INSTANSI BELUM DISETTING'}</h1>
              <p className="text-sm font-bold mt-0.5">SURAT JALAN</p>
              <p className="text-gray-600 w-64 text-[9px] mt-0.5 leading-tight">
                {agency?.address}<br />
                {agency?.phone && `Telp: ${agency.phone}`} {agency?.email && `| Email: ${agency.email}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="mb-0.5">
              <span className="font-bold block text-sm">SJ/{wo.wo_number.replace('WO-', '')}</span>
              <span className="text-gray-500 text-[9px]">NO. SJ</span>
            </div>
            <div>
              <span className="block text-[10px]">{formatDate(wo.completed_at || wo.work_date || new Date())}</span>
              <span className="text-gray-500 text-[9px]">TANGGAL</span>
            </div>
            <div>
              <span className={`block text-[9px] ${isCopy ? 'font-bold text-red-700' : 'text-gray-500'}`}>
                Cetakan ke-{printCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Info Grid (Compact) */}
      <div className="border border-gray-400 p-1.5 rounded-sm mb-2">
         <div className="grid grid-cols-2 gap-4">
             <div>
                <span className="text-[9px] text-gray-500 block uppercase">Ref Work Order</span>
                <span className="font-bold">{wo.wo_number}</span>
             </div>
             <div>
                <span className="text-[9px] text-gray-500 block uppercase">No. Nota Dinas</span>
                <span className="font-bold">{wo.vehicle_entries?.nota_dinas_number || '-'}</span>
             </div>
             <div>
                <span className="text-[9px] text-gray-500 block uppercase">Kendaraan / Nopol</span>
                <span className="font-bold text-sm bg-gray-100 px-1 border rounded">{wo.vehicle_entries?.vehicles?.license_plate}</span>
             </div>
             <div>
                <span className="text-[9px] text-gray-500 block uppercase">Merk / Tipe</span>
                <span className="font-bold">{wo.vehicle_entries?.vehicles?.brand_type}</span>
             </div>
         </div>
      </div>

      {/* Main Content Table (Compact) */}
      <div className="mb-2 border border-black">
        <div className="grid grid-cols-12 border-b border-black bg-gray-100">
            <div className="col-span-1 p-1 font-bold border-r border-black text-center text-[9px]">NO</div>
            <div className="col-span-11 p-1 font-bold text-center text-[9px]">KETERANGAN KENDARAAN</div>
        </div>
        
        <div className="grid grid-cols-12 border-b border-gray-300">
            <div className="col-span-1 p-1 border-r border-black text-center">1</div>
            <div className="col-span-11 p-1">
                <span className="font-bold block">UNIT KENDARAAN: {wo.vehicle_entries?.vehicles?.license_plate}</span>
                <span className="text-[9px] text-gray-600 block">Merk: {wo.vehicle_entries?.vehicles?.brand_type}</span>
            </div>
        </div>

        <div className="grid grid-cols-12 border-b border-gray-300">
            <div className="col-span-1 p-1 border-r border-black text-center">2</div>
            <div className="col-span-11 p-1">
                <span className="font-bold block">STATUS: SELESAI / COMPLETED</span>
                <span className="text-[9px] text-gray-600 block">Kendaraan telah selesai diperbaiki dan siap diserahterimakan.</span>
            </div>
        </div>
      </div>

      {/* Checklist / Statement (Minimalist) */}
      <div className="mb-4 px-1">
        <p className="text-[9px] text-justify leading-tight text-gray-600">
          <span className="font-bold text-black">Pernyataan:</span> Kendaraan telah diperiksa fisik dan kelengkapannya. Pemilik/Pengemudi menerima kendaraan dalam kondisi baik. Bengkel tidak bertanggung jawab atas kerusakan/kehilangan setelah kendaraan keluar.
        </p>
      </div>

      {/* Signatures (Compact) */}
      <div className="grid grid-cols-3 gap-2 mt-4 text-center page-break-inside-avoid">
        <div>
          <p className="mb-8 font-medium text-[9px] uppercase text-gray-500">Diserahkan (Bengkel)</p>
          <div className="border-t border-black w-3/4 mx-auto pt-0.5">
            <p className="font-bold text-[10px]">{wo.mechanics?.name || 'Kepala Bengkel'}</p>
          </div>
        </div>
        
        <div>
          <p className="mb-8 font-medium text-[9px] uppercase text-gray-500">Diperiksa (Security)</p>
          <div className="border-t border-black w-3/4 mx-auto pt-0.5">
            <p className="font-bold text-[10px]">Security / Gate</p>
          </div>
        </div>

        <div>
          <p className="mb-8 font-medium text-[9px] uppercase text-gray-500">Diterima (Driver/Owner)</p>
          <div className="border-t border-black w-3/4 mx-auto pt-0.5">
            <p className="font-bold text-[10px]">.........................</p>
          </div>
        </div>
      </div>
      
      <div className="mt-8 text-center text-[9px] text-gray-400 border-t pt-2">
        Dokumen ini dicetak otomatis oleh sistem OtoSmart pada {new Date().toLocaleString('id-ID')}
      </div>
      
      {/* Print specific styles */}
      <style>{`
        @media print {
          @page { margin: 0mm !important; size: 215mm 297mm !important; }
          body { margin: 0mm !important; padding: 1mm !important; background: white !important; -webkit-print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      </div>
    </div>
  );
}
