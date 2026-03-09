import { useParams } from 'react-router-dom';
import GoodsIssuePrint from '@/components/print/GoodsIssuePrint';

export default function PrintGoodsIssue() {
  const { id } = useParams();
  
  if (!id) {
    return <div className="p-8 text-center text-red-500">ID Issue tidak ditemukan</div>;
  }

  return <GoodsIssuePrint id={id} />;
}
