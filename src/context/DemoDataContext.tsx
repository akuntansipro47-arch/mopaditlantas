import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

// --- TYPES ---
export interface DemoSupplier { id: string; name: string; contact: string; }
export interface DemoGood { id: string; code: string; name: string; type: string; unit: string; cost: number; price: number; stock: number; }
export interface DemoPO { id: string; number: string; supplier_id: string; date: string; status: string; total: number; items: DemoPOItem[]; }
export interface DemoPOItem { goods_id: string; qty: number; price: number; total: number; }
export interface DemoJournal { id: string; date: string; desc: string; total: number; items: DemoJournalItem[]; }
export interface DemoJournalItem { account_id: string; account_name: string; account_code: string; debit: number; credit: number; category?: string; }
export interface DemoWO { 
    id: string; 
    wo_number: string; 
    work_date: string; 
    status: string; 
    total_services: number; 
    total_parts: number; 
    grand_total: number; 
    mechanic_id: string; 
    vehicle_entry_id: string;
    // Relations for UI
    mechanics?: { name: string };
    vehicle_entries?: { 
        nota_dinas_number: string; 
        vehicles?: { license_plate: string; brand_type: string };
    };
}
export interface DemoMechanic { id: string; name: string; specialization: string; }
export interface DemoEntry { 
    id: string; 
    entry_number: string; 
    status: string;
    nota_dinas_number: string;
    driver_name: string;
    notes: string;
    vehicles?: { license_plate: string; brand_type: string };
    vehicle_entry_jobs?: any[];
}

interface DemoContextType {
  isDemo: boolean;
  suppliers: DemoSupplier[];
  goods: DemoGood[];
  purchaseOrders: DemoPO[];
  journals: DemoJournal[];
  workOrders: DemoWO[];
  mechanics: DemoMechanic[];
  entries: DemoEntry[];
  // Actions
  addSupplier: (s: Omit<DemoSupplier, 'id'>) => void;
  addGood: (g: Omit<DemoGood, 'id'>) => void;
  addPO: (po: Omit<DemoPO, 'id'>) => void;
  addJournal: (j: Omit<DemoJournal, 'id'>) => void;
  addWO: (wo: Omit<DemoWO, 'id'>) => void;
  updateWOStatus: (id: string, status: string) => void;
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isDemo = user?.username === 'demo';

  const [suppliers, setSuppliers] = useState<DemoSupplier[]>([]);
  const [goods, setGoods] = useState<DemoGood[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<DemoPO[]>([]);
  const [journals, setJournals] = useState<DemoJournal[]>([]);
  const [workOrders, setWorkOrders] = useState<DemoWO[]>([]);
  const [mechanics, setMechanics] = useState<DemoMechanic[]>([]);
  const [entries, setEntries] = useState<DemoEntry[]>([]);

  // Init Data when Demo User logs in
  useEffect(() => {
    if (isDemo && suppliers.length === 0) {
      console.log('Initializing Demo Data...');
      
      // Suppliers
      const newSuppliers = Array.from({ length: 10 }).map((_, i) => ({
        id: `sup-${i}`,
        name: `Supplier Demo ${i + 1}`,
        contact: `Contact ${i + 1}`
      }));
      setSuppliers(newSuppliers);

      // Goods
      const newGoods = Array.from({ length: 10 }).map((_, i) => ({
        id: `good-${i}`,
        code: `BRG-${i + 1}`,
        name: `Barang Demo ${i + 1}`,
        type: i % 2 === 0 ? 'SPAREPART' : 'OLIE',
        unit: 'PCS',
        cost: 50000 * (i + 1),
        price: 75000 * (i + 1),
        stock: 100
      }));
      setGoods(newGoods);

      // POs
      const newPOs = Array.from({ length: 10 }).map((_, i) => ({
        id: `po-${i}`,
        number: `PO-DEMO-${1000 + i}`,
        supplier_id: newSuppliers[i % 10].id,
        date: new Date().toISOString(),
        status: 'RECEIVED_FULL',
        total: 1000000,
        items: [
            { goods_id: newGoods[i % 10].id, qty: 10, price: newGoods[i % 10].cost, total: newGoods[i % 10].cost * 10 }
        ]
      }));
      setPurchaseOrders(newPOs);

      // Mechanics
      const newMechanics = Array.from({ length: 5 }).map((_, i) => ({
          id: `mech-${i}`,
          name: `Mekanik Demo ${i+1}`,
          specialization: 'UMUM'
      }));
      setMechanics(newMechanics);

      // Entries
      const newEntries = Array.from({ length: 5 }).map((_, i) => ({
          id: `ent-${i}`,
          entry_number: `ENT-${1000+i}`,
          status: 'OPEN',
          nota_dinas_number: `ND-${1000+i}`,
          driver_name: `Driver ${i+1}`,
          notes: 'Keluhan Demo',
          vehicles: { license_plate: `B ${1000+i} DEM`, brand_type: 'AVANZA' },
          vehicle_entry_jobs: [{ job_types: { job_name: 'Ganti Oli' }, notes: 'Cek Filter' }]
      }));
      setEntries(newEntries);

      // WOs (Some existing)
      const newWOs = Array.from({ length: 5 }).map((_, i) => ({
          id: `wo-${i}`,
          wo_number: `WO-DEMO-${2000+i}`,
          work_date: new Date().toISOString(),
          status: 'IN_PROGRESS',
          total_services: 150000,
          total_parts: 300000,
          grand_total: 450000,
          mechanic_id: newMechanics[i % 5].id,
          vehicle_entry_id: newEntries[i % 5].id,
          mechanics: { name: newMechanics[i % 5].name },
          vehicle_entries: { 
              nota_dinas_number: newEntries[i % 5].nota_dinas_number,
              vehicles: newEntries[i % 5].vehicles
          }
      }));
      setWorkOrders(newWOs);

      // Init Journals (Saldo Awal / Dummy Transaction)
      setJournals([
          {
              id: 'j-0',
              date: new Date().toISOString(),
              desc: 'Modal Awal Demo',
              total: 1000000000,
              items: [
                  { account_id: 'acc-kas', account_name: 'Kas Besar', account_code: '1-1001', debit: 1000000000, credit: 0, category: 'AKTIVA' },
                  { account_id: 'acc-modal', account_name: 'Modal Pemilik', account_code: '3-1000', debit: 0, credit: 1000000000, category: 'MODAL' }
              ]
          }
      ]);
    }
  }, [isDemo]);

  const addSupplier = (s: Omit<DemoSupplier, 'id'>) => {
    setSuppliers(prev => [{ ...s, id: `sup-${Date.now()}` }, ...prev]);
  };

  const addGood = (g: Omit<DemoGood, 'id'>) => {
    setGoods(prev => [{ ...g, id: `good-${Date.now()}` }, ...prev]);
  };

  const addPO = (po: Omit<DemoPO, 'id'>) => {
    setPurchaseOrders(prev => [{ ...po, id: `po-${Date.now()}` }, ...prev]);
  };

  const addJournal = (j: Omit<DemoJournal, 'id'>) => {
    setJournals(prev => [...prev, { ...j, id: `j-${Date.now()}` }]);
  };

  const addWO = (wo: Omit<DemoWO, 'id'>) => {
      setWorkOrders(prev => [{ ...wo, id: `wo-${Date.now()}` }, ...prev]);
  };

  const updateWOStatus = (id: string, status: string) => {
      setWorkOrders(prev => prev.map(w => w.id === id ? { ...w, status } : w));
  };

  return (
    <DemoContext.Provider value={{ 
        isDemo, 
        suppliers, 
        goods, 
        purchaseOrders,
        journals,
        workOrders,
        mechanics,
        entries,
        addSupplier, 
        addGood, 
        addPO,
        addJournal,
        addWO,
        updateWOStatus
    }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (context === undefined) {
    throw new Error('useDemo must be used within a DemoProvider');
  }
  return context;
}
