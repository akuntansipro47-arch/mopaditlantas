import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase.ts';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from 'sonner';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useReactToPrint } from 'react-to-print';

// Helper function to format date
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
};

// Helper function to format currency
const formatCurrency = (amount) => {
    if (typeof amount !== 'number') return 'N/A';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(amount);
};


// SPK Print Dialog Component
const SPKPrintDialog = ({ wo, onClose }) => {
    const printRef = useRef();

    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: `SPK-${wo?.wo_number || 'N/A'}`,
        // Simple callback to close dialog after print window is closed
        onAfterPrint: () => onClose(),
    });

    // CSS for printing
    const printStyles = `
    @media print {
        body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 10pt;
            color: #000;
        }
        .no-print {
            display: none !important;
        }
        .print-container {
            padding: 0;
            margin: 0;
        }
        .print-header, .print-section {
            margin-bottom: 15px;
        }
        .print-header h1 {
            font-size: 14pt;
            text-align: center;
            margin: 0;
        }
        .print-header p {
            font-size: 9pt;
            text-align: center;
            margin: 0;
        }
        .info-grid {
            display: grid;
            grid-template-columns: 120px 1fr;
            gap: 2px 10px;
            font-size: 10pt;
        }
        .info-grid dt {
            font-weight: bold;
        }
        .item-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        .item-table th, .item-table td {
            border: 1px solid #000;
            padding: 4px;
            text-align: left;
        }
        .item-table th {
            font-weight: bold;
        }
        .signatures {
            margin-top: 30px;
            display: flex;
            justify-content: space-around;
            font-size: 10pt;
        }
        .signatures div {
            text-align: center;
        }
        .signatures div p {
            margin-top: 50px;
            border-top: 1px solid #000;
            padding-top: 5px;
        }
    }
    `;

    if (!wo) return null;

    const vehicle = wo.vehicle_entries?.vehicles;
    const entry = wo.vehicle_entries;

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl">
                <style>{printStyles}</style>
                <DialogHeader>
                    <DialogTitle>Cetak Surat Perintah Kerja (SPK)</DialogTitle>
                </DialogHeader>
                <div ref={printRef} className="print-container p-4">
                    <div className="print-header">
                        <h1>SURAT PERINTAH KERJA</h1>
                        <p>Bengkel XYZ - Jl. Industri No. 123, Kota ABC</p>
                    </div>

                    <hr className="my-4 border-black"/>

                    <div className="print-section info-grid">
                        <dt>No. WO</dt>
                        <dd>: {wo.wo_number}</dd>
                        <dt>Tanggal Masuk</dt>
                        <dd>: {formatDate(entry.entry_date)}</dd>
                        <dt>No. Polisi</dt>
                        <dd>: {vehicle?.license_plate}</dd>
                        <dt>Customer</dt>
                        <dd>: {vehicle?.owner_name}</dd>
                        <dt>Tipe Kendaraan</dt>
                        <dd>: {vehicle?.model}</dd>
                        <dt>Mekanik</dt>
                        <dd>: {wo.mechanics?.name || 'N/A'}</dd>
                    </div>

                    <div className="print-section">
                        <strong>Keluhan:</strong>
                        <p>{entry.complaint}</p>
                    </div>

                    <div className="print-section">
                        <strong>Pekerjaan:</strong>
                        <table className="item-table">
                            <thead>
                                <tr>
                                    <th>No</th>
                                    <th>Jenis Pekerjaan</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entry.vehicle_entry_jobs?.map((item, index) => (
                                    <tr key={item.id}>
                                        <td>{index + 1}</td>
                                        <td>{item.job_types?.name || 'N/A'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="print-section">
                        <strong>Suku Cadang:</strong>
                        <table className="item-table">
                            <thead>
                                <tr>
                                    <th>No</th>
                                    <th>Nama Barang</th>
                                    <th>Qty</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entry.vehicle_entry_spareparts?.map((item, index) => (
                                    <tr key={item.id}>
                                        <td>{index + 1}</td>
                                        <td>{item.item_name || item.spareparts?.name || 'N/A'}</td>
                                        <td>{item.quantity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="signatures">
                        <div>
                            <p>Hormat Kami,</p>
                            <p>(Service Advisor)</p>
                        </div>
                        <div>
                            <p>Menyetujui,</p>
                            <p>(Customer)</p>
                        </div>
                    </div>
                </div>
                <DialogFooter className="no-print">
                    <Button variant="outline" onClick={onClose}>Tutup</Button>
                    <Button onClick={handlePrint}>Cetak</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


export default function WorkOrderV2() {
    const [wos, setWos] = useState([]);
    const [filteredWos, setFilteredWos] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState('add'); // 'add' or 'edit'
    const [currentWo, setCurrentWo] = useState(null);
    const [formData, setFormData] = useState({
        vehicle_entry_id: '',
        mechanic_id: '',
        status: 'PENDING',
    });

    const [entries, setEntries] = useState([]);
    const [mechanics, setMechanics] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    const [isEntrySearchOpen, setIsEntrySearchOpen] = useState(false);
    const [entrySearchQuery, setEntrySearchQuery] = useState('');
    
    const [woToPrint, setWoToPrint] = useState(null);

    // *** FIX: Corrected the fetchWOs query to avoid ambiguous column errors ***
    const fetchWOs = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase
                .from('work_orders')
                .select(`
                    id,
                    wo_number,
                    status,
                    created_at,
                                        vehicle_entry:vehicle_entry_id!inner(
                        id,
                        entry_date,
                        complaint,
                        vehicle:vehicles!inner(
                            license_plate,
                            owner_name,
                            model
                        )
                    ),
                    mechanic:mechanic_id!inner(

                        id,
                        name
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setWos(data);
            setFilteredWos(data);
        } catch (err) {
            setError(`Gagal mengambil data WO: ${err.message}`);
            toast.error(`Gagal mengambil data WO: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchDependencies = useCallback(async () => {
        try {
            const [entriesRes, mechanicsRes] = await Promise.all([
                supabase.from('vehicle_entries').select('*, vehicles(*)').eq('status', 'OPEN'),
                supabase.from('mechanics').select('*')
            ]);
            if (entriesRes.error) throw entriesRes.error;
            if (mechanicsRes.error) throw mechanicsRes.error;
            setEntries(entriesRes.data);
            setMechanics(mechanicsRes.data);
        } catch (err) {
            toast.error(`Gagal memuat data antrian/mekanik: ${err.message}`);
        }
    }, []);

    useEffect(() => {
        fetchWOs();
        fetchDependencies();
    }, [fetchWOs, fetchDependencies]);

    useEffect(() => {
        const filtered = wos.filter(wo => {
            const searchTermLower = searchTerm.toLowerCase();
            const woNumber = wo.wo_number?.toLowerCase() || '';
            const licensePlate = wo.vehicle_entry?.vehicle?.license_plate?.toLowerCase() || '';
            const status = wo.status?.toLowerCase() || '';
            return woNumber.includes(searchTermLower) || licensePlate.includes(searchTermLower) || status.includes(searchTermLower);
        });
        setFilteredWos(filtered);
    }, [searchTerm, wos]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSelectChange = (name, value) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const resetFormData = () => {
        setFormData({
            vehicle_entry_id: '',
            mechanic_id: '',
            status: 'PENDING',
        });
        setCurrentWo(null);
    };

    const handleOpenDialog = (mode = 'add', wo = null) => {
        setDialogMode(mode);
        if (mode === 'edit' && wo) {
            setCurrentWo(wo);
            setFormData({
                vehicle_entry_id: wo.vehicle_entry?.id || '',
                mechanic_id: wo.mechanic?.id || '',
                status: wo.status,
            });
        } else {
            resetFormData();
        }
        setIsDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        resetFormData();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.vehicle_entry_id || !formData.mechanic_id) {
            toast.error("Harap pilih antrian dan mekanik.");
            return;
        }

        setIsLoading(true);
        try {
            let result;
            const payload = {
                vehicle_entry_id: formData.vehicle_entry_id,
                mechanic_id: formData.mechanic_id,
                status: formData.status,
            };

            if (dialogMode === 'add') {
                result = await supabase.from('work_orders').insert(payload).select().single();
            } else {
                result = await supabase.from('work_orders').update(payload).eq('id', currentWo.id).select().single();
            }

            if (result.error) throw result.error;
            
            // Update vehicle_entry status to 'IN_PROGRESS'
            await supabase
                .from('vehicle_entries')
                .update({ status: 'IN_PROGRESS' })
                .eq('id', formData.vehicle_entry_id);

            toast.success(`Work Order berhasil ${dialogMode === 'add' ? 'dibuat' : 'diperbarui'}.`);
            handleCloseDialog();
            fetchWOs();
            fetchDependencies(); // Refresh dependencies
        } catch (err) {
            toast.error(`Terjadi kesalahan: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFinishWO = async (wo) => {
        if (!wo) return;
        
        const isConfirmed = window.confirm(`Apakah Anda yakin ingin menyelesaikan Work Order ${wo.wo_number}? Status akan diubah menjadi 'FINISHED'.`);
        if (!isConfirmed) return;

        setIsLoading(true);
        try {
            // Update WO status
            const { error: updateWoError } = await supabase
                .from('work_orders')
                .update({ status: 'FINISHED' })
                .eq('id', wo.id);
            if (updateWoError) throw updateWoError;

            // Update Vehicle Entry status
            const { error: updateEntryError } = await supabase
                .from('vehicle_entries')
                .update({ status: 'DONE' })
                .eq('id', wo.vehicle_entry.id);
            if (updateEntryError) throw updateEntryError;

            toast.success(`Work Order ${wo.wo_number} telah selesai.`);
            fetchWOs();
        } catch (err) {
            toast.error(`Gagal menyelesaikan WO: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handlePrintSPK = async (wo) => {
        if (!wo) return;
        setIsLoading(true);
        try {
            const { data: heavyWOData, error: heavyWOError } = await supabase
                .from('work_orders')
                .select(`
                  *,
                  mechanics (*),
                  vehicle_entries (
                    *,
                    vehicles (*),
                    vehicle_entry_jobs (*, job_types(*)),
                    vehicle_entry_spareparts (
                      *, 
                      item_name,
                      spareparts!sparepart_id (name, selling_price)
                    )
                  )
                `)
                .eq('id', wo.id)
                .single();

            if (heavyWOError) throw heavyWOError;
            
            setWoToPrint(heavyWOData);

        } catch (err) {
            toast.error(`Gagal mengambil detail SPK: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const selectedEntry = entries.find(e => e.id === formData.vehicle_entry_id);

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">Manajemen Work Order</h1>

            <div className="flex justify-between items-center mb-4">
                <Input
                    placeholder="Cari No. WO, No. Polisi, atau Status..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                />
                <Button onClick={() => handleOpenDialog('add')}>Tambah Work Order</Button>
            </div>

            {isLoading && <p>Memuat data...</p>}
            {error && <p className="text-red-500">{error}</p>}

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>No. WO</TableHead>
                            <TableHead>Tgl Dibuat</TableHead>
                            <TableHead>No. Polisi</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Mekanik</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Aksi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredWos.map(wo => (
                            <TableRow key={wo.id}>
                                <TableCell>{wo.wo_number}</TableCell>
                                <TableCell>{formatDate(wo.created_at)}</TableCell>
                                <TableCell>{wo.vehicle_entry?.vehicle?.license_plate || 'N/A'}</TableCell>
                                <TableCell>{wo.vehicle_entry?.vehicle?.owner_name || 'N/A'}</TableCell>
                                <TableCell>{wo.mechanic?.name || 'N/A'}</TableCell>
                                <TableCell>{wo.status}</TableCell>
                                <TableCell className="space-x-2">
                                    <Button variant="outline" size="sm" onClick={() => handleOpenDialog('edit', wo)} disabled={wo.status === 'FINISHED'}>Edit</Button>
                                    <Button variant="secondary" size="sm" onClick={() => handlePrintSPK(wo)}>Cetak SPK</Button>
                                    <Button 
                                        variant="default" 
                                        size="sm" 
                                        onClick={() => handleFinishWO(wo)}
                                        disabled={wo.status === 'FINISHED' || isLoading}
                                    >
                                        Selesai
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{dialogMode === 'add' ? 'Tambah' : 'Edit'} Work Order</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit}>
                        <div className="grid gap-4 py-4">
                            <div>
                                <label htmlFor="vehicle_entry_id">Antrian Kendaraan</label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start text-left font-normal mt-1"
                                    onClick={() => setIsEntrySearchOpen(true)}
                                >
                                    {selectedEntry ? `${selectedEntry.vehicles?.license_plate} - ${selectedEntry.complaint}` : "Pilih dari antrian..."}
                                </Button>
                            </div>
                            <div>
                                <label htmlFor="mechanic_id">Mekanik</label>
                                <Select name="mechanic_id" value={formData.mechanic_id} onValueChange={(value) => handleSelectChange('mechanic_id', value)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Pilih Mekanik" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {mechanics.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label htmlFor="status">Status</label>
                                <Select name="status" value={formData.status} onValueChange={(value) => handleSelectChange('status', value)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Pilih Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PENDING">Pending</SelectItem>
                                        <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                                        <SelectItem value="FINISHED">Finished</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={handleCloseDialog}>Batal</Button>
                            <Button type="submit" disabled={isLoading}>{isLoading ? 'Menyimpan...' : 'Simpan'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Vehicle Entry Search Dialog */}
            <Dialog open={isEntrySearchOpen} onOpenChange={setIsEntrySearchOpen}>
                <DialogContent className="p-0">
                    <Command>
                        <CommandInput 
                            placeholder="Cari Nopol atau Keluhan..." 
                            value={entrySearchQuery}
                            onValueChange={setEntrySearchQuery}
                        />
                        <CommandList>
                            <CommandEmpty>Tidak ada antrian ditemukan.</CommandEmpty>
                            <CommandGroup heading="Antrian Kendaraan (Status OPEN)">
                                {entries
                                    .filter(entry => {
                                        if (entry.status !== 'OPEN') return false;
                                        const searchTerm = entrySearchQuery.toLowerCase();
                                        const licensePlate = entry.vehicles?.license_plate?.toLowerCase() || '';
                                        const complaint = entry.complaint?.toLowerCase() || '';
                                        return licensePlate.includes(searchTerm) || complaint.includes(searchTerm);
                                    })
                                    .map(entry => (
                                    <CommandItem
                                        key={entry.id}
                                        onSelect={() => {
                                            handleSelectChange('vehicle_entry_id', entry.id);
                                            setIsEntrySearchOpen(false);
                                            setEntrySearchQuery('');
                                        }}
                                    >
                                        <div className="flex justify-between w-full">
                                            <span>{entry.vehicles?.license_plate}</span>
                                            <span className="text-muted-foreground text-xs">{entry.complaint}</span>
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </DialogContent>
            </Dialog>
            
            {/* SPK Print Dialog */}
            {woToPrint && <SPKPrintDialog wo={woToPrint} onClose={() => setWoToPrint(null)} />}

        </div>
    );
}