import { useParams } from 'react-router-dom';
import PurchaseRequestPrintDotMatrix from '@/components/print/PurchaseRequestPrintDotMatrix';

export default function PrintPurchaseRequestDotMatrix() {
  const { id } = useParams();

  if (!id) {
    return <div className="p-8 text-center text-red-500">ID Purchase Request tidak ditemukan</div>;
  }

  return <PurchaseRequestPrintDotMatrix id={id} />;
}
