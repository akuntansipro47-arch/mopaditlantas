import { useParams } from 'react-router-dom';
import VehicleEntryPrint from '@/components/print/VehicleEntryPrint';

export default function PrintVehicleEntry() {
  const { id } = useParams();
  
  if (!id) {
    return <div className="p-8 text-center text-red-500">ID Entry tidak ditemukan</div>;
  }

  return <VehicleEntryPrint id={id} />;
}
