import { useParams } from 'react-router-dom';
import GoodsReceiptPrint from '@/components/print/GoodsReceiptPrint';

export default function PrintGoodsReceipt() {
  const { id } = useParams();
  
  if (!id) {
    return <div className="p-8 text-center text-red-500">ID Receipt tidak ditemukan</div>;
  }

  return <GoodsReceiptPrint id={id} />;
}

