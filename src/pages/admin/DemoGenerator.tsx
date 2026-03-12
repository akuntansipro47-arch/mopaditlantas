import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Database, Lock, Unlock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function DemoGenerator() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog(prev => [...prev, msg]);

  async function generateDemoData() {
    setLoading(true);
    setLog(['Starting Demo Data Generation...']);

    try {
        // 1. MASTER DATA
        addLog('1. Creating Master Data...');
        
        // Suppliers
        const suppliers = [];
        for (let i = 1; i <= 10; i++) {
            suppliers.push({
                name: `Supplier Demo ${i}`,
                contact_person: `Contact ${i}`,
                phone: `08123456789${i}`,
                email: `supplier${i}@demo.com`,
                address: `Jalan Demo No. ${i}`
            });
        }
        const { data: newSuppliers, error: supErr } = await supabase.from('suppliers').insert(suppliers).select();
        if (supErr) throw supErr;
        addLog(`- Created ${newSuppliers.length} Suppliers`);

        // Mechanics
        const mechanics = [];
        for (let i = 1; i <= 10; i++) {
            mechanics.push({
                name: `Mekanik Demo ${i}`,
                status: 'ACTIVE',
                category: i % 2 === 0 ? 'SENIOR' : 'JUNIOR'
            });
        }
        const { data: newMechanics, error: mechErr } = await supabase.from('mechanics').insert(mechanics).select();
        if (mechErr) throw mechErr;
        addLog(`- Created ${newMechanics.length} Mechanics`);

        // Goods
        const goods = [];
        for (let i = 1; i <= 10; i++) {
            goods.push({
                item_code: `BRG-DEMO-${i.toString().padStart(3, '0')}`,
                name: `Barang Demo ${i}`,
                item_type: i % 2 === 0 ? 'SPAREPART' : 'OLIE',
                unit: 'PCS',
                cost_price: 50000 * i,
                selling_price: 75000 * i,
                current_stock: 100, // Initial Stock
                min_stock: 10
            });
        }
        const { data: newGoods, error: goodsErr } = await supabase.from('goods').insert(goods).select();
        if (goodsErr) throw goodsErr;
        addLog(`- Created ${newGoods.length} Goods`);

        // Job Types
        const jobs = [];
        for (let i = 1; i <= 10; i++) {
            jobs.push({
                job_name: `Jasa Service Demo ${i}`,
                selling_price: 100000 * i,
                job_group: 'PERBAIKAN'
            });
        }
        const { data: newJobs, error: jobsErr } = await supabase.from('job_types').insert(jobs).select();
        if (jobsErr) throw jobsErr;
        addLog(`- Created ${newJobs.length} Job Types`);

        // Vehicles
        const vehicles = [];
        for (let i = 1; i <= 10; i++) {
            vehicles.push({
                license_plate: `B ${1000 + i} DEMO`,
                brand_type: i % 2 === 0 ? 'TOYOTA AVANZA' : 'HONDA JAZZ',
                color: 'Black',
                year: 2020 + (i % 5)
            });
        }
        const { data: newVehicles, error: vehErr } = await supabase.from('vehicles').insert(vehicles).select();
        if (vehErr) throw vehErr;
        addLog(`- Created ${newVehicles.length} Vehicles`);

        // 2. TRANSACTIONS
        addLog('2. Creating Transactions...');

        // Purchase Orders (PO) -> Goods Receipt -> Invoice -> Payment
        for (let i = 0; i < 10; i++) {
            const supplier = newSuppliers[i % newSuppliers.length];
            const good1 = newGoods[i % newGoods.length];
            const good2 = newGoods[(i + 1) % newGoods.length];

            // Create PO
            const { data: po, error: poErr } = await supabase.from('purchase_orders').insert([{
                po_number: `PO-DEMO-${Date.now()}-${i}`,
                supplier_id: supplier.id,
                status: 'RECEIVED_FULL', // Auto completed
                total_amount: (good1.cost_price * 5) + (good2.cost_price * 5),
                po_type: 'GENERAL'
            }]).select().single();
            if (poErr) throw poErr;

            // Create PO Items
            await supabase.from('purchase_order_items').insert([
                { po_id: po.id, goods_id: good1.id, quantity: 5, unit_price: good1.cost_price, total_price: good1.cost_price * 5 },
                { po_id: po.id, goods_id: good2.id, quantity: 5, unit_price: good2.cost_price, total_price: good2.cost_price * 5 }
            ]);

            // Create Receipt (Barang Masuk)
            await supabase.from('goods_receipts').insert([{
                receipt_number: `GR-DEMO-${Date.now()}-${i}`,
                po_id: po.id,
                receipt_date: new Date().toISOString(),
                notes: 'Demo Receipt'
            }]);

            // Create Invoice (Tagihan)
            const { data: inv, error: invErr } = await supabase.from('purchase_invoices').insert([{
                invoice_number: `INV-DEMO-${Date.now()}-${i}`,
                po_id: po.id,
                supplier_id: supplier.id,
                invoice_date: new Date().toISOString(),
                due_date: new Date().toISOString(),
                total_amount: po.total_amount,
                status: 'PAID',
                paid_amount: po.total_amount
            }]).select().single();
            if (invErr) throw invErr;

            // Create Payment (Pembayaran)
            await supabase.from('purchase_payments').insert([{
                invoice_id: inv.id,
                amount: po.total_amount,
                payment_date: new Date().toISOString(),
                payment_method: 'TRANSFER',
                notes: 'Lunas Demo'
            }]);
        }
        addLog(`- Created 10 Purchase Cycles (PO -> Receipt -> Invoice -> Payment)`);

        // Vehicle Entry -> Work Order -> Goods Issue
        for (let i = 0; i < 10; i++) {
            const vehicle = newVehicles[i % newVehicles.length];
            const mechanic = newMechanics[i % newMechanics.length];
            const job = newJobs[i % newJobs.length];
            const good = newGoods[i % newGoods.length];

            // Create Vehicle Entry
            const { data: entry, error: entErr } = await supabase.from('vehicle_entries').insert([{
                entry_number: `ENT-DEMO-${Date.now()}-${i}`,
                vehicle_id: vehicle.id,
                entry_date: new Date().toISOString(),
                status: 'COMPLETED',
                driver_name: 'Driver Demo',
                complaint: 'Service Rutin Demo'
            }]).select().single();
            if (entErr) throw entErr;

            // Create Work Order
            const { data: wo, error: woErr } = await supabase.from('work_orders').insert([{
                wo_number: `WO-DEMO-${Date.now()}-${i}`,
                entry_id: entry.id,
                mechanic_id: mechanic.id,
                start_date: new Date().toISOString(),
                end_date: new Date().toISOString(),
                status: 'COMPLETED',
                total_parts: good.selling_price * 2,
                total_services: job.selling_price,
                grand_total: (good.selling_price * 2) + job.selling_price
            }]).select().single();
            if (woErr) throw woErr;

            // WO Items (Billing)
            await supabase.from('wo_billing_items').insert([
                { wo_id: wo.id, item_type: 'PART', item_name: good.name, qty: 2, unit_price: good.selling_price, total_price: good.selling_price * 2, goods_id: good.id },
                { wo_id: wo.id, item_type: 'JASA', item_name: job.job_name, qty: 1, unit_price: job.selling_price, total_price: job.selling_price, job_id: job.id }
            ]);

            // Goods Issue (Barang Keluar)
            const { data: issue, error: issErr } = await supabase.from('goods_issues').insert([{
                issue_number: `GI-DEMO-${Date.now()}-${i}`,
                work_order_id: wo.id,
                issue_date: new Date().toISOString()
            }]).select().single();
            if (issErr) throw issErr;

            await supabase.from('goods_issue_items').insert([{
                issue_id: issue.id,
                goods_id: good.id,
                quantity: 2,
                notes: 'Pemakaian Service Demo'
            }]);
        }
        addLog(`- Created 10 Service Cycles (Entry -> WO -> Issue)`);

        addLog('SUCCESS: All Demo Data Generated!');
        toast.success('Demo Data Generated Successfully');

    } catch (error: any) {
        console.error(error);
        addLog(`ERROR: ${error.message}`);
        toast.error(`Error: ${error.message}`);
    } finally {
        setLoading(false);
    }
  }

  async function lockReports() {
      if (!user) return;
      if (!confirm("Kunci laporan keuangan untuk user ini?")) return;

      try {
          // Get current permissions
          const { data: currentUser } = await supabase
            .from('app_users')
            .select('allowed_menus')
            .eq('id', user.id)
            .single();
          
          if (!currentUser) throw new Error("User not found");

          const currentMenus = currentUser.allowed_menus || [];
          // Remove report permissions
          const newMenus = currentMenus.filter((m: string) => 
            !['report_profit', 'report_profit_loss', 'report_balance_sheet', 'report_supplier_payable'].includes(m)
          );

          const { error } = await supabase
            .from('app_users')
            .update({ allowed_menus: newMenus })
            .eq('id', user.id);

          if (error) throw error;
          
          toast.success("Laporan Keuangan berhasil dikunci (Permissions removed)");
          window.location.reload(); // Reload to apply changes

      } catch (error: any) {
          toast.error("Gagal mengunci: " + error.message);
      }
  }

  async function unlockReports() {
    if (!user) return;
    if (!confirm("Buka kunci laporan keuangan?")) return;

    try {
        const { data: currentUser } = await supabase.from('app_users').select('allowed_menus').eq('id', user.id).single();
        const currentMenus = currentUser?.allowed_menus || [];
        
        // Add permissions back
        const newMenus = [...new Set([...currentMenus, 'report_profit', 'report_profit_loss', 'report_balance_sheet', 'report_supplier_payable'])];

        const { error } = await supabase.from('app_users').update({ allowed_menus: newMenus }).eq('id', user.id);
        if (error) throw error;
        
        toast.success("Laporan Keuangan dibuka kembali");
        window.location.reload();
    } catch (error: any) {
        toast.error("Gagal membuka: " + error.message);
    }
  }

  async function generateDefaultCOA() {
    setLoading(true);
    addLog('Generating Default Chart of Accounts...');
    
    try {
        const accounts = [
            // ASSETS
            { account_code: '1-1100', account_name: 'Piutang Usaha', category: 'AKTIVA', sub_category: 'LANCAR', balance_type: 'DEBIT', account_type: 'DETAIL' },
            { account_code: '1-1200', account_name: 'Persediaan Barang', category: 'AKTIVA', sub_category: 'LANCAR', balance_type: 'DEBIT', account_type: 'DETAIL' },
            { account_code: '1-1000', account_name: 'Kas & Bank', category: 'AKTIVA', sub_category: 'LANCAR', balance_type: 'DEBIT', account_type: 'HEADER' },
            { account_code: '1-1001', account_name: 'Kas Besar', category: 'AKTIVA', sub_category: 'LANCAR', balance_type: 'DEBIT', account_type: 'DETAIL' },

            // REVENUE
            { account_code: '4-1000', account_name: 'Pendapatan Jasa', category: 'PENDAPATAN', sub_category: 'USAHA', balance_type: 'CREDIT', account_type: 'DETAIL' },
            { account_code: '4-2000', account_name: 'Pendapatan Sparepart', category: 'PENDAPATAN', sub_category: 'USAHA', balance_type: 'CREDIT', account_type: 'DETAIL' },
            
            // EXPENSES
            { account_code: '6-1000', account_name: 'Beban Gaji', category: 'BEBAN', sub_category: 'OPERASIONAL', balance_type: 'DEBIT', account_type: 'DETAIL' },
            { account_code: '6-2000', account_name: 'Beban Listrik & Air', category: 'BEBAN', sub_category: 'OPERASIONAL', balance_type: 'DEBIT', account_type: 'DETAIL' },
        ];

        for (const acc of accounts) {
            // Check if exists
            const { data: exist } = await supabase.from('chart_of_accounts').select('id').eq('account_code', acc.account_code).single();
            if (!exist) {
                const { error } = await supabase.from('chart_of_accounts').insert([acc]);
                if (error) {
                    addLog(`Error creating ${acc.account_name}: ${error.message}`);
                } else {
                    addLog(`Created: ${acc.account_name}`);
                }
            } else {
                addLog(`Skipped: ${acc.account_name} (Exists)`);
            }
        }
        
        toast.success("Default Accounts Generated");
        addLog("Done.");

    } catch (error: any) {
        addLog(`Error: ${error.message}`);
    } finally {
        setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Demo Generator & Settings</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
              <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5" /> Generate Dummy Data
                  </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                  <p className="text-sm text-gray-600">
                      Klik tombol di bawah untuk membuat 10 data dummy lengkap untuk setiap modul (Master Data & Transaksi).
                      Pastikan Anda siap dengan data sampah yang akan masuk ke database.
                  </p>
                  <Button onClick={generateDemoData} disabled={loading} className="w-full">
                      {loading ? 'Generating...' : 'Generate 10 Transactions Now'}
                  </Button>
                  
                  <div className="pt-4 border-t">
                      <p className="text-sm text-gray-600 mb-2">Setup Akun Standar (Piutang, Pendapatan, dll)</p>
                      <Button variant="outline" onClick={generateDefaultCOA} disabled={loading} className="w-full">
                          Setup Default COA
                      </Button>
                  </div>

                  <div className="bg-slate-900 text-green-400 p-4 rounded-md h-64 overflow-y-auto text-xs font-mono">
                      {log.length === 0 ? '> Ready...' : log.map((l, i) => <div key={i}>{l}</div>)}
                  </div>
              </CardContent>
          </Card>

          <Card>
              <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                      <Lock className="h-5 w-5" /> Report Access Control
                  </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                  <p className="text-sm text-gray-600">
                      Gunakan tombol ini untuk mengunci (menghapus akses) laporan keuangan (Laba Rugi, Neraca) dari akun Anda saat ini.
                      Berguna untuk mode demo/presentasi.
                  </p>
                  <div className="flex flex-col gap-2">
                    <Button variant="destructive" onClick={lockReports} className="w-full">
                        <Lock className="mr-2 h-4 w-4" /> Lock Financial Reports
                    </Button>
                    <Button variant="outline" onClick={unlockReports} className="w-full">
                        <Unlock className="mr-2 h-4 w-4" /> Unlock Financial Reports
                    </Button>
                  </div>
              </CardContent>
          </Card>
      </div>
    </div>
  );
}
