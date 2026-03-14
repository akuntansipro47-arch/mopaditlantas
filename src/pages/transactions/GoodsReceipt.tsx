import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, PackageCheck, CheckCircle2, Printer, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatDate } from '@/lib/utils';
import { Badge } from "@/components/ui/badge";

type PO = Database['public']['Tables']['purchase_orders']['Row'];
type POItem = Database['public']['Tables']['purchase_order_items']['Row'];
type Goods = Database['public']['Tables']['goods']['Row'];
type GoodsReceiptRow = Database['public']['Tables']['goods_receipts']['Row'];

type POItemWithDetails = POItem & {
  goods: Goods | null;
};

type POWithDetails = PO & {
  suppliers: { name: string } | null;
  items: POItemWithDetails[];
};

type GoodsReceiptWithDetails = GoodsReceiptRow & {
    purchase_orders: (PO & { suppliers: { name: string } | null }) | null;
    items: (Database['public']['Tables']['goods_receipt_items']['Row'] & { goods: Goods | null })[];
};

export default function GoodsReceipt() {
  const [pos, setPos] = useState<POWithDetails[]>([]);
  const [receipts, setReceipts] = useState<GoodsReceiptWithDetails[]>([]); // History State
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [selectedPO, setSelectedPO] = useState<POWithDetails | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Receipt State
  const [receiptData, setReceiptData] = useState({
    receipt_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Partial Receive State
  const [receivedHistory, setReceivedHistory] = useState<Record<string, number>>({});
  const [receivingItems, setReceivingItems] = useState<Record<string, number>>({});

  // Filter State
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], // First day of current month
    endDate: new Date().toISOString().split('T')[0] // Today
  });

  useEffect(() => {
    fetchOpenPOs();
  }, []);

  useEffect(() => {
    fetchReceiptHistory();
  }, [dateFilter]);

  async function fetchOpenPOs() {
    setLoading(true);
    try {
      // Fetch POs that are ISSUED or RECEIVED_PART
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers (name),
          items:purchase_order_items (
            *,
            goods (name, unit, item_code)
          )
        `)
        .in('status', ['ISSUED', 'RECEIVED_PART'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPos(data as any || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data PO: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchReceiptHistory() {
      // Fetch Goods Receipts based on Date Filter
      // Goods Receipts don't usually have "Open" status, so we just filter by date.
      try {
          const { data, error } = await supabase
            .from('goods_receipts')
            .select(`
                *,
                purchase_orders (
                    po_number,
                    suppliers (name)
                ),
                items:goods_receipt_items (
                    *,
                    goods (name, unit)
                )
            `)
            .gte('receipt_date', dateFilter.startDate)
            .lte('receipt_date', dateFilter.endDate)
            .order('receipt_date', { ascending: false });

          if(error) throw error;
          setReceipts(data as any || []);

      } catch (error: any) {
          console.error('Error fetching receipts:', error);
      }
  }

  const handleSelectPO = async (po: POWithDetails) => {
    setSelectedPO(po);
    setReceiptData({
      receipt_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    
    // Fetch previously received quantities for this PO
    const { data: existingReceipts } = await supabase
      .from('goods_receipts')
      .select('id, items:goods_receipt_items(goods_id, quantity_received)')
      .eq('po_id', po.id);

    const history: Record<string, number> = {};
    if (existingReceipts) {
      existingReceipts.forEach((r: any) => {
        r.items.forEach((i: any) => {
          if (i.goods_id) {
            history[i.goods_id] = (history[i.goods_id] || 0) + i.quantity_received;
          }
        });
      });
    }
    setReceivedHistory(history);

    // Initialize receiving items with remaining quantity
    const initialReceiving: Record<string, number> = {};
    po.items.forEach(item => {
      if (item.goods_id) {
        // Calculate total ordered for this goods_id (handle duplicate items in PO if any)
        const totalOrdered = po.items
          .filter(i => i.goods_id === item.goods_id)
          .reduce((sum, i) => sum + i.quantity, 0);
        
        const alreadyReceived = history[item.goods_id] || 0;
        const remaining = Math.max(0, totalOrdered - alreadyReceived);
        
        // Distribute remaining among items (simple approach: first item gets all remaining, others 0)
        // Better approach: Since we iterate, check if we already processed this goods_id
        if (initialReceiving[item.goods_id] === undefined) {
             initialReceiving[item.goods_id] = remaining;
        }
      }
    });
    setReceivingItems(initialReceiving);
    
    setIsDialogOpen(true);
  };

  const handleReceive = async () => {
    if (!selectedPO) return;
    setLoading(true);

    try {
      // 1. Validate & Prepare Items
      const itemsToReceive: { goods_id: string; quantity: number }[] = [];
      let totalReceiptAmount = 0;

      // Group PO items by goods_id to handle pricing (FIFO strategy)
      const poItemsByGoods: Record<string, typeof selectedPO.items> = {};
      selectedPO.items.forEach(item => {
        if (item.goods_id) {
            if (!poItemsByGoods[item.goods_id]) poItemsByGoods[item.goods_id] = [];
            poItemsByGoods[item.goods_id].push(item);
        }
      });

      // Check what needs to be received
      for (const [goodsId, qty] of Object.entries(receivingItems)) {
        if (qty > 0) {
            itemsToReceive.push({ goods_id: goodsId, quantity: qty });

            // Calculate Price for Invoice (FIFO from PO lines)
            let remainingToPrice = qty;
            let currentHistory = receivedHistory[goodsId] || 0;
            
            // Sort PO items (e.g. by created_at or just array order)
            const lines = poItemsByGoods[goodsId] || [];
            
            for (const line of lines) {
                if (remainingToPrice <= 0) break;
                
                const lineQty = line.quantity;
                const linePrice = line.unit_price || 0;
                
                // How much of this line is already used by history?
                const usedByHistory = Math.min(lineQty, currentHistory);
                currentHistory -= usedByHistory; // Consume history
                
                const availableInLine = lineQty - usedByHistory;
                
                if (availableInLine > 0) {
                    const take = Math.min(remainingToPrice, availableInLine);
                    totalReceiptAmount += take * linePrice;
                    remainingToPrice -= take;
                }
            }
        }
      }

      if (itemsToReceive.length === 0) {
        toast.error("Tidak ada barang yang diterima (Qty 0).");
        setLoading(false);
        return;
      }

      // 2. Create Goods Receipt Header
      const { data: newReceipt, error: receiptError } = await supabase
        .from('goods_receipts')
        .insert([{
          receipt_number: `GR-${Date.now()}`,
          po_id: selectedPO.id,
          receipt_date: receiptData.receipt_date,
          notes: receiptData.notes,
          received_by: 'Admin'
        }])
        .select()
        .single();
      
      if (receiptError) throw receiptError;

      // 3. Insert Goods Receipt Items & Update Stock
      const receiptItemsPayload = itemsToReceive.map(item => ({
        receipt_id: newReceipt.id,
        goods_id: item.goods_id,
        quantity_received: item.quantity,
        notes: ''
      }));

      const { error: itemsError } = await supabase
        .from('goods_receipt_items')
        .insert(receiptItemsPayload);

      if (itemsError) throw itemsError;

      // Update Stock
      for (const item of itemsToReceive) {
           const { data: currentGood } = await supabase
             .from('goods')
             .select('current_stock')
             .eq('id', item.goods_id)
             .single();
            
           if (currentGood) {
             await supabase
               .from('goods')
               .update({ current_stock: (currentGood.current_stock || 0) + item.quantity })
               .eq('id', item.goods_id);
           }
      }

      // 4. Update PO Status
      // Check if ALL items are fully received
      let isFull = true;
      const allGoodsIds = new Set(selectedPO.items.map(i => i.goods_id).filter(id => id !== null) as string[]);
      
      for (const goodsId of allGoodsIds) {
          const totalOrdered = selectedPO.items
            .filter(i => i.goods_id === goodsId)
            .reduce((sum, i) => sum + i.quantity, 0);
          
          const history = receivedHistory[goodsId] || 0;
          const current = receivingItems[goodsId] || 0;
          
          if ((history + current) < totalOrdered) {
              isFull = false;
              break;
          }
      }

      const newStatus = isFull ? 'RECEIVED_FULL' : 'RECEIVED_PART';

      await supabase
        .from('purchase_orders')
        .update({ status: newStatus })
        .eq('id', selectedPO.id);

      // 5. Auto-Create Purchase Invoice (Hutang Dagang)
      // Only for the amount received in THIS receipt
      if (totalReceiptAmount > 0) {
          const { error: invoiceError } = await supabase
            .from('purchase_invoices')
            .insert([{
              invoice_number: `INV-${Date.now()}`,
              po_id: selectedPO.id,
              supplier_id: selectedPO.supplier_id,
              invoice_date: receiptData.receipt_date,
              due_date: new Date(new Date(receiptData.receipt_date).setDate(new Date(receiptData.receipt_date).getDate() + 30)).toISOString().split('T')[0],
              total_amount: totalReceiptAmount,
              status: 'UNPAID'
            }]);

          if (invoiceError) {
            console.error("Failed to create invoice:", invoiceError);
            toast.error("Penerimaan sukses TAPI Gagal membuat Tagihan otomatis: " + invoiceError.message);
          } else {
            toast.success(`Penerimaan Partial berhasil! Status PO: ${newStatus}`);
          }
      } else {
          toast.success(`Penerimaan Partial berhasil! Status PO: ${newStatus}`);
      }

      setIsDialogOpen(false);
      fetchOpenPOs();
      fetchReceiptHistory();
    } catch (error: any) {
      toast.error('Gagal memproses penerimaan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredPOs = pos.filter(p => 
    p.po_number.toLowerCase().includes(search.toLowerCase()) ||
    p.suppliers?.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredReceipts = receipts.filter(r => 
    r.receipt_number.toLowerCase().includes(historySearch.toLowerCase()) ||
    r.purchase_orders?.po_number.toLowerCase().includes(historySearch.toLowerCase()) ||
    r.purchase_orders?.suppliers?.name.toLowerCase().includes(historySearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Penerimaan Barang</h2>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between">
            <CardTitle>Daftar PO (Menunggu Penerimaan)</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari No. PO / Supplier..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. PO</TableHead>
                  <TableHead>Tanggal PO</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Tipe Pengadaan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total Item</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPOs.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center h-24">Tidak ada PO yang perlu diterima.</TableCell></TableRow>
                ) : (
                  filteredPOs.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.po_number}</TableCell>
                      <TableCell>{formatDate(item.created_at)}</TableCell>
                      <TableCell>{item.suppliers?.name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={item.work_order_id ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-700 border-slate-200'}>
                          {item.work_order_id ? 'Project' : 'Stock'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'ISSUED' ? 'default' : 'secondary'}>
                          {item.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.items?.length || 0} Item</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => handleSelectPO(item)}>
                          <PackageCheck className="h-4 w-4 mr-1" /> Proses Terima
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

      {/* History Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center mb-4">
             <CardTitle>Riwayat Penerimaan (History)</CardTitle>
             <div className="flex gap-2 items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Periode:</span>
                  <Input 
                    type="date" 
                    className="w-36 h-8 text-xs"
                    value={dateFilter.startDate} 
                    onChange={(e) => setDateFilter({...dateFilter, startDate: e.target.value})} 
                  />
                  <span className="text-sm text-gray-500">s/d</span>
                  <Input 
                    type="date" 
                    className="w-36 h-8 text-xs"
                    value={dateFilter.endDate} 
                    onChange={(e) => setDateFilter({...dateFilter, endDate: e.target.value})} 
                  />
                </div>
                <div className="relative w-64 ml-4">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Cari No. Receipt / PO..." className="pl-8 h-9" value={historySearch} onChange={e => setHistorySearch(e.target.value)} />
                </div>
             </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Receipt</TableHead>
                  <TableHead>Tanggal Terima</TableHead>
                  <TableHead>No. PO</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Item Diterima</TableHead>
                  <TableHead>Catatan</TableHead>
                  {/* <TableHead className="text-right">Aksi</TableHead> */}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReceipts.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24">Tidak ada riwayat penerimaan pada periode ini.</TableCell></TableRow>
                ) : (
                  filteredReceipts.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.receipt_number}</TableCell>
                      <TableCell>{formatDate(item.receipt_date)}</TableCell>
                      <TableCell>{item.purchase_orders?.po_number}</TableCell>
                      <TableCell>{item.purchase_orders?.suppliers?.name}</TableCell>
                      <TableCell>{item.items.length} Item</TableCell>
                      <TableCell>{item.notes || '-'}</TableCell>
                      {/* <TableCell className="text-right">
                        <Button variant="ghost" size="icon"><Printer className="h-4 w-4" /></Button>
                      </TableCell> */}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Penerimaan */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Proses Penerimaan Barang</DialogTitle>
            <DialogDescription>
              Konfirmasi penerimaan barang untuk PO: <b>{selectedPO?.po_number}</b>
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tanggal Terima</Label>
                  <Input type="date" value={receiptData.receipt_date} onChange={(e) => setReceiptData({...receiptData, receipt_date: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Catatan</Label>
                  <Input value={receiptData.notes} onChange={(e) => setReceiptData({...receiptData, notes: e.target.value})} placeholder="No. Surat Jalan dll..." />
                </div>
             </div>

             <div className="border rounded-md p-4 bg-slate-50 max-h-[300px] overflow-y-auto">
                <Label className="mb-2 block font-semibold">Rincian Barang (Partial Receiving)</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Barang</TableHead>
                      <TableHead>Total PO</TableHead>
                      <TableHead>Sudah Diterima</TableHead>
                      <TableHead>Sisa</TableHead>
                      <TableHead className="w-32">Terima Sekarang</TableHead>
                      <TableHead>Satuan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPO && Array.from(new Set(selectedPO.items.map(i => String((i as any).goods_id)))).map((goodsId: string) => {
                       if (!goodsId) return null;
                       const item = selectedPO.items.find(i => i.goods_id === goodsId);
                       if (!item) return null;

                       const totalOrdered = selectedPO.items
                         .filter(i => i.goods_id === goodsId)
                         .reduce((sum, i) => sum + i.quantity, 0);
                       
                       const alreadyReceived = receivedHistory[goodsId] || 0;
                       const remaining = Math.max(0, totalOrdered - alreadyReceived);
                       const receivingNow = receivingItems[goodsId] ?? 0;

                       return (
                         <TableRow key={goodsId}>
                           <TableCell>
                             <div className="font-medium">{item.goods?.name}</div>
                             <div className="text-xs text-muted-foreground">{item.goods?.item_code}</div>
                           </TableCell>
                           <TableCell>{totalOrdered}</TableCell>
                           <TableCell>{alreadyReceived}</TableCell>
                           <TableCell>{remaining}</TableCell>
                           <TableCell>
                             <Input 
                               type="text"
                               className="h-8 w-24 text-center"
                               value={receivingNow === 0 ? '' : receivingNow} 
                               placeholder="0"
                               onChange={(e) => {
                                 const valStr = e.target.value;
                                 if (valStr === '' || /^\d+$/.test(valStr)) {
                                     const val = valStr === '' ? 0 : parseInt(valStr);
                                     // Prevent user from entering more than remaining
                                     if (val <= remaining) {
                                         setReceivingItems(prev => ({...prev, [goodsId]: val}));
                                     }
                                 }
                               }}
                             />
                           </TableCell>
                           <TableCell>{item.goods?.unit}</TableCell>
                         </TableRow>
                       );
                    })}
                  </TableBody>
                </Table>
             </div>
             
             <div className="flex items-center space-x-2 text-sm text-blue-700 bg-blue-50 p-3 rounded-md">
                <CheckCircle2 className="h-4 w-4" />
                <span>Pastikan jumlah yang diterima sesuai dengan fisik barang. Status PO akan otomatis menjadi "RECEIVED PART" atau "RECEIVED FULL".</span>
             </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
            <Button onClick={handleReceive} disabled={loading}>
              {loading ? 'Memproses...' : 'Konfirmasi Terima Barang'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
