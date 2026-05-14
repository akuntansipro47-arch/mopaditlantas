import { useParams } from 'react-router-dom';
import SPKPrintDotMatrix from '@/components/print/SPKPrintDotMatrix';

export default function PrintSPKDotMatrix() {
  const { id } = useParams();

  if (!id) {
    return <div className="p-8 text-center text-red-500">ID SPK tidak ditemukan</div>;
  }

  return <SPKPrintDotMatrix id={id} />;
}

