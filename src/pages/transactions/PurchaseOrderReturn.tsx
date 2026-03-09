import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from '@/lib/utils';

export default function PurchaseOrderReturn() {
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Date Filter State (Default to current month)
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchCompletedPOs();
  }, [dateFilter]);

  async function fetchCompletedPOs() {
    setLoading(true);
    try {
      // Fetch POs that are fully received or partially received within date range
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers (name),
          goods_receipts (receipt_number)
        `)
        .in('status', ['RECEIVED_FULL', 'RECEIVED_PARTIAL', 'CLOSED'])
        .gte('po_date', dateFilter.startDate)
        .lte('po_date', dateFilter.endDate)
        .order('po_date', { ascending: false });

      if (error) throw error;
      setPos(data || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data PO: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleReturnClick = (po: any) => {
    setSelectedPO(po);
    setIsConfirmOpen(true);
  };

  const processReturn = async () => {
    if (!selectedPO) return;
    setIsProcessing(true);

    try {
      // 1. Get PO items to know what stock to deduct
      const { data: poItems } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('po_id', selectedPO.id);

      if (poItems && poItems.length > 0) {
        // 2. Deduct stock for each item (Reversing the receipt)
        for (const item of poItems) {
           // Only deduct if quantity_received > 0
           if (item.quantity_received && item.quantity_received > 0) {
               const { data: currentGood } = await supabase
                 .from('goods')
                 .select('current_stock')
                 .eq('id', item.goods_id)
                 .single();
               
               if (currentGood) {
                   const newStock = Math.max(0, (currentGood.current_stock || 0) - item.quantity_received);
                   await supabase
                     .from('goods')
                     .update({ current_stock: newStock })
                     .eq('id', item.goods_id);
               }
               
               // Reset received quantity in PO Item
               await supabase
                 .from('purchase_order_items')
                 .update({ quantity_received: 0 })
                 .eq('id', item.id);
           }
        }
      }

      // 3. Reset PO Status to ISSUED (so it can be received again or cancelled)
      // Also reset total_received_amount if it exists in your schema (optional)
      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({ 
            status: 'ISSUED',
            // You might want to add a note or log about this return
        })
        .eq('id', selectedPO.id);

      if (updateError) throw updateError;

      // 4. Delete related Goods Receipt records (Crucial step to fix FK error)
      // First, get all receipts related to this PO
      const { data: receipts } = await supabase
        .from('goods_receipts')
        .select('id')
        .eq('po_id', selectedPO.id);

      if (receipts && receipts.length > 0) {
          const receiptIds = receipts.map(r => r.id);

          // Delete receipt items first
          await supabase
            .from('goods_receipt_items')
            .delete()
            .in('receipt_id', receiptIds);

          // Then delete receipts
          await supabase
            .from('goods_receipts')
            .delete()
            .in('id', receiptIds);
      }

      toast.success(`PO ${selectedPO.po_number} berhasil diretur. Status kembali ke ISSUED.`);
      setIsConfirmOpen(false);
      fetchCompletedPOs();

    } catch (error: any) {
      toast.error('Gagal memproses retur: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredPos = pos.filter(po => 
    po.po_number.toLowerCase().includes(search.toLowerCase()) ||
    po.suppliers?.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Retur Pembelian (Batal Terima)</h2>
        <p className="text-muted-foreground">
            Modul ini digunakan untuk membatalkan penerimaan barang (PO) yang sudah selesai. 
            <br/><span className="text-red-500 font-bold">PERHATIAN:</span> Stok barang akan otomatis dikurangi kembali sesuai jumlah yang diterima sebelumnya.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center mb-4">
             <CardTitle>Daftar PO Selesai / Diterima</CardTitle>
             <div className="flex gap-2 items-center">
                <div className="flex items-center gap-2 bg-white border rounded-md px-2 py-1">
                  <span className="text-sm text-gray-500">Periode:</span>
                  <Input 
                    type="date" 
                    className="w-auto border-0 p-0 h-auto focus-visible:ring-0 text-xs"
                    value={dateFilter.startDate} 
                    onChange={(e) => setDateFilter({...dateFilter, startDate: e.target.value})} 
                  />
                  <span className="text-sm text-gray-500">-</span>
                  <Input 
                    type="date" 
                    className="w-auto border-0 p-0 h-auto focus-visible:ring-0 text-xs"
                    value={dateFilter.endDate} 
                    onChange={(e) => setDateFilter({...dateFilter, endDate: e.target.value})} 
                  />
                </div>
                <div className="relative w-64 ml-4">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Cari No. PO / Supplier..." 
                    className="pl-8 h-9" 
                    value={search} 
                    onChange={e => setSearch(e.target.value)} 
                  />
                </div>
             </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. PO</TableHead>
                  <TableHead>No. Terima</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Total Nilai</TableHead>
                  <TableHead>Status Saat Ini</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPos.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center h-24">Tidak ada PO yang dapat diretur dalam periode ini.</TableCell></TableRow>
                ) : (
                  filteredPos.map((po) => (
                    <TableRow key={po.id}>
                      <TableCell className="font-medium">{po.po_number}</TableCell>
                      <TableCell className="text-xs text-blue-600 font-medium">
                        {po.goods_receipts && po.goods_receipts.length > 0 
                          ? po.goods_receipts.map((r: any) => r.receipt_number).join(', ')
                          : '-'}
                      </TableCell>
                      <TableCell>{formatDate(po.po_date)}</TableCell>
                      <TableCell>{po.suppliers?.name}</TableCell>
                      <TableCell>{formatCurrency(po.total_amount)}</TableCell>
                      <TableCell>
                        <Badge variant={po.status === 'RECEIVED_FULL' ? 'default' : 'secondary'} className={
                            po.status === 'RECEIVED_FULL' ? 'bg-green-600' : 'bg-blue-600'
                        }>
                            {po.status === 'RECEIVED_FULL' ? 'Diterima Penuh' : po.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                            variant="destructive" 
                            size="sm" 
                            className="h-8"
                            onClick={() => handleReturnClick(po)}
                        >
                            <RotateCcw className="mr-2 h-3.5 w-3.5" />
                            Retur / Batal
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Konfirmasi Retur Pembelian
            </DialogTitle>
            <DialogDescription className="pt-2">
              Anda akan membatalkan penerimaan untuk PO <strong>{selectedPO?.po_number}</strong>.
              <ul className="list-disc pl-5 mt-2 space-y-1 text-slate-700">
                  <li>Status PO akan dikembalikan menjadi <strong>ISSUED</strong>.</li>
                  <li><strong>Stok barang</strong> yang diterima dari PO ini akan <strong>DIKURANGI/DITARIK KEMBALI</strong> dari gudang.</li>
                  <li>Pastikan fisik barang juga dikembalikan atau disesuaikan.</li>
              </ul>
              <p className="mt-4 font-bold">Apakah Anda yakin ingin melanjutkan?</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmOpen(false)} disabled={isProcessing}>Batal</Button>
            <Button variant="destructive" onClick={processReturn} disabled={isProcessing}>
                {isProcessing ? 'Memproses...' : 'Ya, Retur PO Ini'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}