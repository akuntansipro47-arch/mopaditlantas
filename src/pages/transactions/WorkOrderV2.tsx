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
// Disesuaikan dengan skema tabel baru Anda

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
  id:string;
  notes: string;
  vehicles: Vehicle | null;
}

interface WorkOrderImage {
  id: string;
  image_url: string;
}

interface WorkOrderBilling {
  id: string;
  item_name: string;
  qty: number;
  total_price: number;
  item_type: 'PART' | 'JOB';
}

interface WorkOrder {
  id: string;
  work_order_number: string;
  work_date: string;
  vehicle_entries: VehicleEntry | null;
  mechanics: Mechanic | null;
  work_order_images: WorkOrderImage[]; // Menjadi array
  work_order_billings: WorkOrderBilling[]; // Menjadi array
}

// --- Helper Functions ---
const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};

const formatCurrency = (amount: number) => {
  if (typeof amount !== 'number') return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
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
        // --- QUERY DIPERBARUI ---
        // Mengambil semua data terkait termasuk gambar dan billing
        const { data, error } = await supabase
          .from('work_orders')
          .select(`
            *,
            vehicle_entries (
              *,
              vehicles (*)
            ),
            mechanics (*),
            work_order_images (*),
            work_order_billings (*)
          `)
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(`Gagal mengambil data WO: ${error.message}`);
        }

        setWorkOrders(data as WorkOrder[]);

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
    return <div className="p-4 text-center">Memuat data work order...</div>;
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

      {/* --- BAGIAN CETAK DIPERBARUI --- */}
      <div className="hidden">
        {selectedWoForPrint && (
          <div ref={printRef} className="p-8">
            <h2 className="text-xl font-bold mb-4">Work Order: {selectedWoForPrint.work_order_number}</h2>
            
            {/* Info Kendaraan */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><strong>No. Polisi:</strong> <span>{selectedWoForPrint.vehicle_entries?.vehicles?.license_plate}</span></div>
              <div><strong>Kendaraan:</strong> <span>{selectedWoForPrint.vehicle_entries?.vehicles?.brand_type}</span></div>
              <div><strong>Pemilik:</strong> <span>{selectedWoForPrint.vehicle_entries?.vehicles?.owner_name}</span></div>
              <div><strong>Tanggal:</strong> <span>{formatDate(selectedWoForPrint.work_date)}</span></div>
            </div>

            {/* Keluhan */}
            <div className="mt-6">
              <h3 className="font-bold">Keluhan Pelanggan:</h3>
              <p className="mt-2 text-sm">{selectedWoForPrint.vehicle_entries?.notes}</p>
            </div>

            {/* Rincian Biaya */}
            <div className="mt-6">
              <h3 className="font-bold">Rincian Biaya:</h3>
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 px-2">Deskripsi</th>
                    <th className="text-center py-1 px-2">Qty</th>
                    <th className="text-right py-1 px-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedWoForPrint.work_order_billings?.map(item => (
                    <tr key={item.id}>
                      <td className="py-1 px-2">{item.item_name}</td>
                      <td className="text-center py-1 px-2">{item.qty}</td>
                      <td className="text-right py-1 px-2">{formatCurrency(item.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Dokumentasi Foto */}
            <div className="mt-6">
              <h3 className="font-bold">Dokumentasi Foto:</h3>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {selectedWoForPrint.work_order_images?.map(img => (
                  <img key={img.id} src={img.image_url} alt="Dokumentasi WO" className="w-full h-auto object-cover border" />
                ))}
              </div>
            </div>

            {/* Mekanik */}
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