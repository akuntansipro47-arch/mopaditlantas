
import React from 'react';
import { WOWithDetails } from '@/pages/transactions/WorkOrder';
import { formatDate } from '@/lib/utils';
import { Badge } from './badge';

interface PrintSPKProps {
  data: {
    wo: WOWithDetails;
    entry: any;
  };
}

const PrintSPK: React.FC<PrintSPKProps> = ({ data }) => {
  const { wo, entry } = data;

  return (
    <div className="printable-area p-8 font-sans bg-white text-gray-900">
      <header className="flex justify-between items-center pb-4 border-b-2 border-gray-800">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">SURAT PERINTAH KERJA</h1>
          <p className="text-lg text-gray-600">Work Order</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">No. WO: {wo.wo_number}</p>
          <p className="text-sm text-gray-500">Tanggal: {formatDate(wo.work_date)}</p>
        </div>
      </header>

      <main className="mt-6">
        <section className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Informasi Kendaraan</h2>
            <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1">
              <span className="font-medium">No. Polisi:</span>
              <span>{wo.vehicle_entries?.vehicles?.license_plate}</span>
              <span className="font-medium">Tipe / Merek:</span>
              <span>{wo.vehicle_entries?.vehicles?.brand_type}</span>
              <span className="font-medium">No. Nota Dinas:</span>
              <span>{wo.vehicle_entries?.nota_dinas_number}</span>
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Penugasan</h2>
            <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1">
              <span className="font-medium">Mekanik:</span>
              <span>{wo.mechanics?.name}</span>
              <span className="font-medium">Spesialisasi:</span>
              <span>{wo.mechanics?.specialization}</span>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Detail Pekerjaan</h2>
          <div className="border rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left font-medium">Jenis</th>
                  <th className="p-2 text-left font-medium">Pekerjaan</th>
                  <th className="p-2 text-left font-medium">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {entry?.vehicle_entry_jobs?.map((job: any, index: number) => (
                  <tr key={index} className="border-t">
                    <td className="p-2">
                      <Badge variant={job.job_types?.job_group === 'PERBAIKAN' ? 'destructive' : 'secondary'}>
                        {job.job_types?.job_group}
                      </Badge>
                    </td>
                    <td className="p-2">{job.job_types?.job_name}</td>
                    <td className="p-2 italic text-gray-600">{job.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {entry?.notes && (
            <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md text-xs text-yellow-800">
              <strong>Catatan Entry:</strong> {entry.notes}
            </div>
          )}
        </section>

        <section className="mt-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Estimasi Sparepart</h2>
          <div className="border rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left font-medium w-8">No</th>
                  <th className="p-2 text-left font-medium">Nama Sparepart</th>
                  <th className="p-2 text-right font-medium">Jumlah</th>
                  <th className="p-2 text-left font-medium">Satuan</th>
                </tr>
              </thead>
              <tbody>
                {entry?.vehicle_entry_spareparts && entry.vehicle_entry_spareparts.length > 0 ? (
                  entry.vehicle_entry_spareparts.map((sp: any, index: number) => (
                    <tr key={index} className="border-t">
                      <td className="p-2">{index + 1}</td>
                      <td className="p-2">{sp.spareparts?.name || sp.item_name || 'Nama tidak ditemukan'}</td>
                      <td className="p-2 text-right">{sp.qty}</td>
                      <td className="p-2">{sp.spareparts?.unit || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">Tidak ada estimasi sparepart.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="mt-10 pt-4 border-t text-xs text-gray-500">
        <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
                <p className="font-bold">Pemohon</p>
                <div className="h-12"></div>
                <p className="border-t pt-1">(_________________________)</p>
            </div>
            <div className="text-center">
                <p className="font-bold">Disetujui</p>
                <div className="h-12"></div>
                <p className="border-t pt-1">(_________________________)</p>
            </div>
            <div className="text-center">
                <p className="font-bold">Mekanik</p>
                <div className="h-12"></div>
                <p className="border-t pt-1">{wo.mechanics?.name || '(_________________________)'}</p>
            </div>
        </div>
        <p className="text-center mt-6">Dokumen ini dicetak secara otomatis oleh sistem.</p>
      </footer>
    </div>
  );
};

export default PrintSPK;
