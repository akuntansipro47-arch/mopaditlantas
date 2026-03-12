import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

// --- TYPES ---
export interface DemoSupplier { id: string; name: string; contact: string; }
export interface DemoGood { id: string; code: string; name: string; type: string; unit: string; cost: number; price: number; stock: number; }
export interface DemoPO { id: string; number: string; supplier_id: string; date: string; status: string; total: number; items: DemoPOItem[]; }
export interface DemoPOItem { goods_id: string; qty: number; price: number; total: number; }
export interface DemoJournal { id: string; date: string; desc: string; total: number; items: DemoJournalItem[]; }
export interface DemoJournalItem { account_id: string; account_name: string; account_code: string; debit: number; credit: number; category?: string; }

interface DemoContextType {
  isDemo: boolean;
  suppliers: DemoSupplier[];
  goods: DemoGood[];
  purchaseOrders: DemoPO[];
  journals: DemoJournal[];
  // Actions
  addSupplier: (s: Omit<DemoSupplier, 'id'>) => void;
  addGood: (g: Omit<DemoGood, 'id'>) => void;
  addPO: (po: Omit<DemoPO, 'id'>) => void;
  addJournal: (j: Omit<DemoJournal, 'id'>) => void;
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isDemo = user?.username === 'demo';

  const [suppliers, setSuppliers] = useState<DemoSupplier[]>([]);
  const [goods, setGoods] = useState<DemoGood[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<DemoPO[]>([]);
  const [journals, setJournals] = useState<DemoJournal[]>([]);

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

      // Init Journals (Saldo Awal / Dummy Transaction)
      // Example: Modal Awal
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

  return (
    <DemoContext.Provider value={{ 
        isDemo, 
        suppliers, 
        goods, 
        purchaseOrders,
        journals,
        addSupplier, 
        addGood, 
        addPO,
        addJournal
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
