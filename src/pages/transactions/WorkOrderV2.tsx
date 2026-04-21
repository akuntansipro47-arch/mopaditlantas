import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useReactToPrint } from 'react-to-print';
import { toast } from 'sonner';

// --- Interface Definitions ---
// Pastikan interface ini sesuai dengan struktur tabel Anda

interface Vehicle {
  id: string;
  license_plate: string;
  brand_type: string;
  owner_name: string;
}

interface Mechanic {
  id: string;
  name: string;
}

interface VehicleEntry {
  id: string;
  notes: string; // DIGANTI: dari 'complaint' menjadi 'notes'
  vehicles: Vehicle | null;
}

interface WorkOrder {
  id: string;
  work_order_number: string;
  work_date: string;
  vehicle_entry_id: string;
  mechanic_id: string;
  vehicle_entries: VehicleEntry | null;
  mechanics: Mechanic | null;
}

// --- Helper Function ---
const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};


// --- Main Component ---
export default function WorkOrderV2() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWoForPrint, setSelectedWoForPrint] = useState<WorkOrder | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
  });

  useEffect(() => {
    const fetchWorkOrders = async () => {
      setLoading(true);
      setError(null);

      try {
        // 1. Ambil data utama dari work_orders
        const { data: woData, error: woError } = await supabase
          .from('work_orders')
          .select('*')
          .order('created_at', { ascending: false });

        if (woError) throw new Error(`Gagal mengambil data WO: ${woError.message}`);
        if (!woData) return;

        // 2. Kumpulkan semua ID yang dibutuhkan untuk relasi
        const entryIds = [...new Set(woData.map((wo) => wo.vehicle_entry_id).filter(Boolean))];
        const mechanicIds = [...new Set(woData.map((wo) => wo.mechanic_id).filter(Boolean))];

        // 3. Ambil data relasi (vehicle_entries dan mechanics) secara paralel
        const [entriesResponse, mechanicsResponse] = await Promise.all([
          entryIds.length > 0 ? supabase.from('vehicle_entries').select('id, notes, vehicle_id').in('id', entryIds) : Promise.resolve({ data: [], error: null }),
          mechanicIds.length > 0 ? supabase.from('mechanics').select('id, name').in('id', mechanicIds) : Promise.resolve({ data: [], error: null }),
        ]);

        if (entriesResponse.error) throw new Error(`Gagal mengambil data Vehicle Entries: ${entriesResponse.error.message}`);
        if (mechanicsResponse.error) throw new Error(`Gagal mengambil data Mechanics: ${mechanicsResponse.error.message}`);

        const vehicleIds = [...new Set(entriesResponse.data?.map((entry) => entry.vehicle_id).filter(Boolean) || [])];

        // 4. Ambil data kendaraan (vehicles)
        const { data: vehiclesData, error: vehiclesError } = vehicleIds.length > 0
          ? await supabase.from('vehicles').select('*').in('id', vehicleIds)
          : { data: [], error: null };

        if (vehiclesError) throw new Error(`Gagal mengambil data Vehicles: ${vehiclesError.message}`);

        // 5. Buat "peta" untuk mempermudah pencarian data relasi
        const entriesMap = new Map(entriesResponse.data?.map(entry => [entry.id, entry]));
        const mechanicsMap = new Map(mechanicsResponse.data?.map(mech => [mech.id, mech]));
        const vehiclesMap = new Map(vehiclesData?.map(vehicle => [vehicle.id, vehicle]));

        // 6. Gabungkan semua data menjadi satu struktur yang lengkap
        const combinedData = woData.map((wo) => {
          const vehicleEntry = entriesMap.get(wo.vehicle_entry_id) || null;
          if (vehicleEntry) {
            (vehicleEntry as any).vehicles = vehiclesMap.get(vehicleEntry.vehicle_id) || null;
          }

          return {
            ...wo,
            vehicle_entries: vehicleEntry,
            mechanics: mechanicsMap.get(wo.mechanic_id) || null,
          };
        });

        setWorkOrders(combinedData as WorkOrder[]);

      } catch (err: any) {
        setError(err.message);
        toast.error(err.message);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkOrders();
  }, []);

  useEffect(() => {
    if (selectedWoForPrint) {
      handlePrint();
    }
  }, [selectedWoForPrint, handlePrint]);


  if (loading) {
    return <div className="p-4">Memuat data...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">Terjadi kesalahan: {error}</div>;
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-4">Manajemen Work Order</h1>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No. WO</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>No. Polisi</TableHead>
              <TableHead>Keluhan</TableHead>
              <TableHead>Mekanik</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workOrders.length > 0 ? (
              workOrders.map((wo) => (
                <TableRow key={wo.id}>
                  <TableCell className="font-medium">{wo.work_order_number}</TableCell>
                  <TableCell>{formatDate(wo.work_date)}</TableCell>
                  <TableCell>{wo.vehicle_entries?.vehicles?.license_plate || '-'}</TableCell>
                  {/* KODE DIPERBAIKI: Menggunakan 'notes' dan sintaks JSX yang benar */}
                  <TableCell className="max-w-[300px] truncate">{wo.vehicle_entries?.notes || '-'}</TableCell>
                  <TableCell>{wo.mechanics?.name || '-'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setSelectedWoForPrint(wo)}>
                      Cetak
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Tidak ada data work order.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Elemen untuk dicetak (disembunyikan dari layar) */}
      <div className="hidden">
        {selectedWoForPrint && (
          <div ref={printRef} className="p-8">
            <h2 className="text-xl font-bold mb-4">Work Order: {selectedWoForPrint.work_order_number}</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <strong>No. Polisi:</strong> <span>{selectedWoForPrint.vehicle_entries?.vehicles?.license_plate}</span>
              </div>
              <div>
                <strong>Kendaraan:</strong> <span>{selectedWoForPrint.vehicle_entries?.vehicles?.brand_type}</span>
              </div>
              <div>
                <strong>Pemilik:</strong> <span>{selectedWoForPrint.vehicle_entries?.vehicles?.owner_name}</span>
              </div>
              <div>
                <strong>Tanggal:</strong> <span>{formatDate(selectedWoForPrint.work_date)}</span>
              </div>
            </div>
            <div className="mt-6">
              <h3 className="font-bold">Keluhan Pelanggan:</h3>
              {/* KODE DIPERBAIKI: Menggunakan 'notes' */}
              <p className="mt-2 text-sm">{selectedWoForPrint.vehicle_entries?.notes}</p>
            </div>
            <div className="mt-6">
              <h3 className="font-bold">Mekanik Bertugas:</h3>
              <p className="mt-2 text-sm">{selectedWoForPrint.mechanics?.name}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}