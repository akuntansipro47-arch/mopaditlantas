import { useParams } from 'react-router-dom';
import PurchaseOrderPrint from '@/components/print/PurchaseOrderPrint';

export default function PrintPO() {
  const { id } = useParams();
  
  if (!id) {
    return <div className="p-8 text-center text-red-500">ID PO tidak ditemukan</div>;
  }

  return <PurchaseOrderPrint id={id} />;
}
