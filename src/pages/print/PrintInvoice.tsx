import { useParams } from 'react-router-dom';
import InvoicePrint from '@/components/print/InvoicePrint';

export default function PrintInvoice() {
  const { id } = useParams();
  
  if (!id) {
    return <div className="p-8 text-center text-red-500">ID Invoice tidak ditemukan</div>;
  }

  return <InvoicePrint id={id} />;
}
