import { useParams } from 'react-router-dom';
import SPKPrint from '@/components/print/SPKPrint';

export default function PrintSPK() {
  const { id } = useParams();
  
  if (!id) {
    return <div className="p-8 text-center text-red-500 font-bold">Error: ID Work Order tidak ditemukan</div>;
  }

  return <SPKPrint id={id} />;
}
