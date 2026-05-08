import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import { incrementDocumentPrintCounter } from '@/lib/printCounter';

console.log('[SPKPrint] Component mounted');

export default function PrintSPK({ id }: { id: string }) {
  const [phase, setPhase] = useState<string>('initial');
  const [data, setData] = useState<any>(null);
  const [agency, setAgency] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [printCount, setPrintCount] = useState<number>(1);

  useEffect(() => {
    console.log('[SPKPrint] useEffect triggered, id:', id);
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
      setPhase('fetching-agency');
      console.log('[SPKPrint] Fetching agency...');
      const { data: agencyData, error: agencyError } = await supabase.from('agency_profile').select('*').single();
      if (agencyError) console.error('[SPKPrint] Agency error:', agencyError);
      setAgency(agencyData);
      console.log('[SPKPrint] Agency fetched:', agencyData);

      setPhase('fetching-wo');
      console.log('[SPKPrint] Fetching WO with id:', id);
      const { data: wo, error: woError } = await supabase
        .from('work_orders')
        .select('*, mechanics (*), vehicle_entries (*, vehicles (*))')
        .eq('id', id)
        .single();
      
      console.log('[SPKPrint] WO result:', { wo, woError });
      
      if (woError) throw new Error(`Gagal mengambil WO: ${woError.message}`);
      if (!wo) throw new Error('Work Order tidak ditemukan');

      let entry = null;
      if (wo.vehicle_entry_id) {
        setPhase('fetching-entry');
        console.log('[SPKPrint] Fetching entry for vehicle_entry_id:', wo.vehicle_entry_id);
        const { data: entryData, error: entryError } = await supabase
          .from('vehicle_entries')
          .select('*, vehicle_entry_jobs (*, job_types (*)), vehicle_entry_spareparts (*)')
          .eq('id', wo.vehicle_entry_id)
          .single();
        
        console.log('[SPKPrint] Entry result:', { entryData, entryError });
        
        if (entryError) throw new Error(`Gagal mengambil entry: ${entryError.message}`);
        entry = entryData;
      } else {
        console.log('[SPKPrint] No vehicle_entry_id, skipping entry fetch');
      }

      setPhase('success');
      console.log('[SPKPrint] Setting data, entry:', entry);
      setData({ wo, entry });
      console.log('[SPKPrint] Data set successfully');
      
    } catch (err: any) {
      console.error('[SPKPrint] Error caught:', err);
      setPhase('error');
      setError(err.message || 'Unknown error');
    }
  }

  const handlePrint = async () => {
    console.log('[SPKPrint] Print button clicked');
    const cnt = await incrementDocumentPrintCounter('SPK', String(id));
    setPrintCount(cnt);
    window.setTimeout(() => window.print(), 50);
  };

  console.log('[SPKPrint] Rendering, phase:', phase, 'error:', error, 'has data:', !!data);

  // PHASE 1: Loading
  if (phase === 'initial' || phase === 'fetching-agency' || phase === 'fetching-wo' || phase === 'fetching-entry') {
    return (
      <div className="printable-area" style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'white',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div style={{ 
          width: '40px', 
          height: '40px', 
          border: '4px solid #e5e7eb', 
          borderTopColor: '#2563eb',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <p style={{ marginTop: '16px', color: '#374151', fontSize: '16px' }}>
          Memuat SPK...
        </p>
        <p style={{ marginTop: '8px', color: '#9ca3af', fontSize: '12px' }}>
          Phase: {phase}
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // PHASE 2: Error
  if (phase === 'error') {
    return (
      <div className="printable-area" style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'white',
        padding: '32px',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <h2 style={{ color: '#dc2626', marginBottom: '8px' }}>Gagal Memuat Data</h2>
        <p style={{ color: '#6b7280', textAlign: 'center', maxWidth: '400px' }}>{error}</p>
        <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
          <button 
            onClick={() => window.close()}
            style={{ padding: '10px 20px', border: '2px solid #d1d5db', borderRadius: '8px', cursor: 'pointer' }}
          >
            Tutup
          </button>
          <button 
            onClick={() => { setPhase('initial'); fetchData(); }}
            style={{ padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  // PHASE 3: Success - Render Document
  if (!data) {
    return (
      <div className="printable-area" style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'white',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>❓</div>
        <h2 style={{ color: '#d97706', marginBottom: '8px' }}>Data Tidak Ditemukan</h2>
        <p style={{ color: '#6b7280' }}>Work Order dengan ID ini tidak ditemukan.</p>
        <button 
          onClick={() => window.close()}
          style={{ marginTop: '24px', padding: '10px 20px', border: '2px solid #d1d5db', borderRadius: '8px', cursor: 'pointer' }}
        >
          Tutup
        </button>
      </div>
    );
  }

  const { wo, entry } = data;
  const isCopy = printCount > 1;

  return (
    <div className="printable-area" style={{ background: '#f3f4f6', minHeight: '100vh' }}>
      {/* Control Bar */}
      <div style={{ 
        position: 'sticky', 
        top: 0, 
        zIndex: 50, 
        background: 'white', 
        borderBottom: '2px solid #e5e7eb',
        padding: '16px 24px'
      }}>
        <div style={{ 
          maxWidth: '210mm', 
          margin: '0 auto', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontWeight: 'bold', color: '#1f2937' }}>DOKUMEN SPK SIAP CETAK</span>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              onClick={() => window.close()} 
              style={{ 
                padding: '10px 20px', 
                fontWeight: 'bold',
                border: '2px solid #d1d5db', 
                borderRadius: '8px', 
                cursor: 'pointer',
                background: 'white'
              }}
            >
              ✕ Tutup
            </button>
            <button 
              onClick={handlePrint} 
              style={{ 
                padding: '10px 24px', 
                fontWeight: 'bold',
                background: '#2563eb', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px', 
                cursor: 'pointer'
              }}
            >
              🖨️ Cetak / Simpan PDF
            </button>
          </div>
        </div>
      </div>

      {/* Document */}
      <div style={{ maxWidth: '210mm', margin: '32px auto', padding: '40px', background: 'white', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', position: 'relative' }}>
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
                fontSize: '84px',
                fontWeight: 900,
                color: '#000',
                opacity: 0.1,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              COPY WO
            </div>
          </div>
        )}
        <div style={{ position: 'relative', zIndex: 1 }}>
        
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '4px solid #111827', paddingBottom: '24px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            {agency?.logo_url && (
              <img src={agency.logo_url} alt="Logo" style={{ height: '80px', width: 'auto' }} />
            )}
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '900', textTransform: 'uppercase' }}>{agency?.name || 'INSTANSI'}</h1>
              <p style={{ margin: '4px 0', fontSize: '12px', fontWeight: 'bold', color: '#1d4ed8' }}>SURAT PERINTAH KERJA</p>
              <p style={{ margin: 0, fontSize: '10px', color: '#6b7280' }}>{agency?.address}</p>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ background: '#111827', color: 'white', padding: '12px 24px', borderRadius: '8px', marginBottom: '8px', display: 'inline-block' }}>
              <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '900' }}>SPK</h2>
            </div>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>NO: {wo.wo_number}</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>{formatDate(wo.work_date)}</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', fontWeight: isCopy ? 'bold' : 'normal', color: isCopy ? '#b91c1c' : '#6b7280' }}>
              Cetakan ke-{printCount}
            </p>
          </div>
        </header>

        {/* Info Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
          <div style={{ border: '2px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '10px', fontWeight: '900', color: '#6b7280', textTransform: 'uppercase' }}>Kendaraan</h3>
            <table style={{ width: '100%', fontSize: '12px' }}>
              <tbody>
                <tr><td style={{ width: '100px', color: '#6b7280' }}>No. Polisi</td><td style={{ fontWeight: 'bold' }}>: {wo.vehicle_entries?.vehicles?.license_plate || '-'}</td></tr>
                <tr><td style={{ color: '#6b7280' }}>Merek / Tipe</td><td style={{ fontWeight: 'bold' }}>: {wo.vehicle_entries?.vehicles?.brand_type || '-'}</td></tr>
                <tr><td style={{ color: '#6b7280' }}>Nota Dinas</td><td>: {wo.vehicle_entries?.nota_dinas_number || '-'}</td></tr>
              </tbody>
            </table>
          </div>
          
          <div style={{ border: '2px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '10px', fontWeight: '900', color: '#6b7280', textTransform: 'uppercase' }}>Mekanik</h3>
            <table style={{ width: '100%', fontSize: '12px' }}>
              <tbody>
                <tr><td style={{ width: '100px', color: '#6b7280' }}>Nama</td><td style={{ fontWeight: 'bold' }}>: {wo.mechanics?.name || '-'}</td></tr>
                <tr><td style={{ color: '#6b7280' }}>Spesialisasi</td><td>: {wo.mechanics?.specialization || '-'}</td></tr>
                <tr><td style={{ color: '#6b7280' }}>Status</td><td style={{ fontWeight: 'bold', color: '#1d4ed8' }}>: {wo.status}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Jobs Table */}
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', marginBottom: '12px' }}>I. Rincian Pekerjaan</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #111827', fontSize: '11px' }}>
            <thead style={{ background: '#111827', color: 'white' }}>
              <tr>
                <th style={{ padding: '12px', textAlign: 'center', width: '40px' }}>NO</th>
                <th style={{ padding: '12px', textAlign: 'left' }}>KATEGORI</th>
                <th style={{ padding: '12px', textAlign: 'left' }}>PEKERJAAN</th>
                <th style={{ padding: '12px', textAlign: 'left' }}>CATATAN</th>
              </tr>
            </thead>
            <tbody>
              {entry?.vehicle_entry_jobs?.length > 0 ? (
                entry.vehicle_entry_jobs.map((job: any, index: number) => (
                  <tr key={index} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>{index + 1}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '10px', color: '#6b7280' }}>{job.job_types?.job_group || '-'}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{job.job_types?.job_name || '-'}</td>
                    <td style={{ padding: '12px', fontStyle: 'italic', color: '#9ca3af' }}>{job.notes || '-'}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>Tidak ada detail pekerjaan</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Spareparts Table */}
        <div style={{ marginBottom: '40px' }}>
          <h3 style={{ fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', marginBottom: '12px' }}>II. Estimasi Sparepart & Material</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #111827', fontSize: '11px' }}>
            <thead style={{ background: '#111827', color: 'white' }}>
              <tr>
                <th style={{ padding: '12px', textAlign: 'center', width: '40px' }}>NO</th>
                <th style={{ padding: '12px', textAlign: 'left' }}>NAMA BARANG</th>
                <th style={{ padding: '12px', textAlign: 'center', width: '80px' }}>QTY</th>
                <th style={{ padding: '12px', textAlign: 'center', width: '80px' }}>SATUAN</th>
              </tr>
            </thead>
            <tbody>
              {entry?.vehicle_entry_spareparts?.length > 0 ? (
                entry.vehicle_entry_spareparts.map((sp: any, index: number) => (
                  <tr key={index} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>{index + 1}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{sp.spareparts?.name || sp.item_name || '-'}</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>{sp.qty || 0}</td>
                    <td style={{ padding: '12px', textAlign: 'center', textTransform: 'uppercase', color: '#6b7280' }}>{sp.spareparts?.unit || '-'}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>Tidak ada estimasi sparepart</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Signatures */}
        <footer style={{ marginTop: '64px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '32px', textAlign: 'center' }}>
            <div>
              <p style={{ fontSize: '10px', fontWeight: '900', color: '#6b7280', marginBottom: '64px' }}>PEMOHON / DRIVER</p>
              <div style={{ borderTop: '2px solid #111827', paddingTop: '12px' }}>( .......................... )</div>
            </div>
            <div>
              <p style={{ fontSize: '10px', fontWeight: '900', color: '#6b7280', marginBottom: '64px' }}>WORKSHOP HEAD</p>
              <div style={{ borderTop: '2px solid #111827', paddingTop: '12px' }}>( .......................... )</div>
            </div>
            <div>
              <p style={{ fontSize: '10px', fontWeight: '900', color: '#6b7280', marginBottom: '64px' }}>MEKANIK</p>
              <div style={{ borderTop: '2px solid #111827', paddingTop: '12px', fontWeight: 'bold', textDecoration: 'underline' }}>{wo.mechanics?.name || '(...........................)'}</div>
            </div>
          </div>
          <div style={{ marginTop: '64px', paddingTop: '16px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#9ca3af', fontStyle: 'italic' }}>
            <span>OtoSmart Workshop System</span>
            <span>ID: {wo.id?.slice(0, 13)?.toUpperCase() || 'N/A'} | {new Date().toLocaleString('id-ID')}</span>
          </div>
        </footer>
      </div>
      </div>

      <style>{`
        @page { margin: 10mm; size: A4; }
        @media print {
          .sticky { position: static !important; }
          button { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
