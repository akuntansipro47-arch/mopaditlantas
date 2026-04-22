import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

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

  useEffect(() => {
    if (!loading && data && agency) {
      // Pastikan semua gambar sudah dimuat sebelum cetak
      const images = document.querySelectorAll('img');
      const promises = Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      });

      Promise.all(promises).then(() => {
        setTimeout(() => {
          window.print();
          window.onafterprint = () => window.close();
        }, 500);
      });
    }
  }, [loading, data, agency]);

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

  if (loading) return null;
  if (!data) return null;

  const { wo, entry } = data;

  return (
    <div style={{ padding: '20mm', background: 'white', color: 'black', fontSize: '11pt', fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <table style={{ width: '100%', borderBottom: '2px solid black', marginBottom: '10mm' }}>
        <tr>
          <td style={{ width: '15%', paddingBottom: '10px' }}>
            {agency?.logo_url && <img src={agency.logo_url} alt="Logo" style={{ height: '60px', width: 'auto' }} />}
          </td>
          <td style={{ width: '55%', paddingLeft: '20px', verticalAlign: 'top' }}>
            <h2 style={{ margin: 0, textTransform: 'uppercase' }}>{agency?.name || 'SURAT PERINTAH KERJA'}</h2>
            <p style={{ margin: '5px 0', fontSize: '10pt' }}>{agency?.address}</p>
          </td>
          <td style={{ width: '30%', textAlign: 'right', verticalAlign: 'top' }}>
            <h1 style={{ margin: 0, fontSize: '16pt' }}>SPK</h1>
            <p style={{ margin: '5px 0' }}>No: {wo.wo_number}</p>
            <p style={{ margin: '5px 0' }}>{new Date(wo.work_date).toLocaleDateString('id-ID')}</p>
          </td>
        </tr>
      </table>

      {/* Info Utama */}
      <table style={{ width: '100%', marginBottom: '10mm', border: '1px solid black', borderCollapse: 'collapse' }}>
        <tr>
          <td style={{ width: '50%', border: '1px solid black', padding: '10px', verticalAlign: 'top' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '10pt', textTransform: 'uppercase', borderBottom: '1px solid black' }}>Data Kendaraan</h3>
            <table style={{ width: '100%' }}>
              <tr><td style={{ width: '30%' }}>No Polisi</td><td>: <strong>{wo.vehicle_entries?.vehicles?.license_plate}</strong></td></tr>
              <tr><td>Merk/Tipe</td><td>: {wo.vehicle_entries?.vehicles?.brand_type}</td></tr>
              <tr><td>Nota Dinas</td><td>: {wo.vehicle_entries?.nota_dinas_number || '-'}</td></tr>
            </table>
          </td>
          <td style={{ width: '50%', border: '1px solid black', padding: '10px', verticalAlign: 'top' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '10pt', textTransform: 'uppercase', borderBottom: '1px solid black' }}>Personel & Status</h3>
            <table style={{ width: '100%' }}>
              <tr><td style={{ width: '30%' }}>Mekanik</td><td>: <strong>{wo.mechanics?.name}</strong></td></tr>
              <tr><td>Spesialisasi</td><td>: {wo.mechanics?.specialization || '-'}</td></tr>
              <tr><td>Status WO</td><td>: <strong>{wo.status}</strong></td></tr>
            </table>
          </td>
        </tr>
      </table>

      {/* Rincian Pekerjaan */}
      <div style={{ marginBottom: '10mm' }}>
        <h3 style={{ margin: '0 0 5px 0', fontSize: '10pt', textTransform: 'uppercase' }}>I. Rincian Pekerjaan</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid black' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={{ border: '1px solid black', padding: '8px', textAlign: 'center', width: '40px' }}>No</th>
              <th style={{ border: '1px solid black', padding: '8px', textAlign: 'left', width: '150px' }}>Kategori</th>
              <th style={{ border: '1px solid black', padding: '8px', textAlign: 'left' }}>Pekerjaan</th>
              <th style={{ border: '1px solid black', padding: '8px', textAlign: 'left', width: '150px' }}>Catatan</th>
            </tr>
          </thead>
          <tbody>
            {entry?.vehicle_entry_jobs?.map((job: any, index: number) => (
              <tr key={index}>
                <td style={{ border: '1px solid black', padding: '8px', textAlign: 'center' }}>{index + 1}</td>
                <td style={{ border: '1px solid black', padding: '8px' }}>{job.job_types?.job_group}</td>
                <td style={{ border: '1px solid black', padding: '8px' }}><strong>{job.job_types?.job_name}</strong></td>
                <td style={{ border: '1px solid black', padding: '8px', fontStyle: 'italic' }}>{job.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rincian Sparepart */}
      <div style={{ marginBottom: '15mm' }}>
        <h3 style={{ margin: '0 0 5px 0', fontSize: '10pt', textTransform: 'uppercase' }}>II. Estimasi Sparepart</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid black' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={{ border: '1px solid black', padding: '8px', textAlign: 'center', width: '40px' }}>No</th>
              <th style={{ border: '1px solid black', padding: '8px', textAlign: 'left' }}>Nama Barang</th>
              <th style={{ border: '1px solid black', padding: '8px', textAlign: 'center', width: '80px' }}>Qty</th>
              <th style={{ border: '1px solid black', padding: '8px', textAlign: 'center', width: '80px' }}>Satuan</th>
            </tr>
          </thead>
          <tbody>
            {entry?.vehicle_entry_spareparts?.length > 0 ? (
              entry.vehicle_entry_spareparts.map((sp: any, index: number) => (
                <tr key={index}>
                  <td style={{ border: '1px solid black', padding: '8px', textAlign: 'center' }}>{index + 1}</td>
                  <td style={{ border: '1px solid black', padding: '8px' }}><strong>{sp.spareparts?.name || sp.item_name}</strong></td>
                  <td style={{ border: '1px solid black', padding: '8px', textAlign: 'center' }}>{sp.qty}</td>
                  <td style={{ border: '1px solid black', padding: '8px', textAlign: 'center' }}>{sp.spareparts?.unit || '-'}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={4} style={{ border: '1px solid black', padding: '15px', textAlign: 'center', fontStyle: 'italic' }}>Tidak ada sparepart</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Tanda Tangan */}
      <table style={{ width: '100%', textAlign: 'center', fontSize: '10pt' }}>
        <tr>
          <td style={{ width: '33%', paddingBottom: '60px' }}>PEMOHON (DRIVER)</td>
          <td style={{ width: '33%', paddingBottom: '60px' }}>WORKSHOP HEAD</td>
          <td style={{ width: '33%', paddingBottom: '60px' }}>MEKANIK PELAKSANA</td>
        </tr>
        <tr>
          <td>( ............................ )</td>
          <td>( ............................ )</td>
          <td><strong>( {wo.mechanics?.name} )</strong></td>
        </tr>
      </table>

      <div style={{ marginTop: '20mm', textAlign: 'center', fontSize: '8pt', color: '#888', fontStyle: 'italic' }}>
        Dicetak otomatis oleh sistem OtoSmart pada {new Date().toLocaleString('id-ID')}
      </div>

      <style>{`
        @media print {
          @page { margin: 15mm; size: A4; }
          body { background: white !important; -webkit-print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
