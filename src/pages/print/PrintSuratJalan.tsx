import { useParams } from 'react-router-dom';
import SuratJalanPrint from '@/components/print/SuratJalanPrint';

export default function PrintSuratJalan() {
  const { id } = useParams();
  
  if (!id) {
    return <div className="p-8 text-center text-red-500">ID WO tidak ditemukan</div>;
  }

  return <SuratJalanPrint id={id} />;
}
