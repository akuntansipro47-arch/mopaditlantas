import { useParams } from 'react-router-dom';
import PurchaseOrderPrintDotMatrix from '@/components/print/PurchaseOrderPrintDotMatrix';

export default function PrintPODotMatrix() {
  const { id } = useParams();

  if (!id) {
    return <div className="p-8 text-center text-red-500">ID PO tidak ditemukan</div>;
  }

  return <PurchaseOrderPrintDotMatrix id={id} />;
}

