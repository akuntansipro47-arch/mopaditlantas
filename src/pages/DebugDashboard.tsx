import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

export default function DebugDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [rawStatus, setRawStatus] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  if (!user || user.role !== 'SUPER_ADMIN') {
    return (
      <div className="space-y-6 p-8">
        <h1 className="text-2xl font-bold">Debug Dashboard Query</h1>
        <Card>
          <CardHeader>
            <CardTitle>Akses Ditolak</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Halaman ini hanya untuk Super Admin.
          </CardContent>
        </Card>
      </div>
    );
  }

  const fetchRawData = async () => {
    setLoading(true);
    try {
      // 1. Fetch raw vehicle entries status only
      const { data: statusData, error: statusError } = await supabase
        .from('vehicle_entries')
        .select('id, entry_number, status, entry_date');
      
      if (statusError) console.error('Status Error:', statusError);
      setRawStatus(statusData || []);

      // 2. Try the dashboard query exactly as written
      const { data: dashboardData, error: dashboardError } = await supabase
        .from('vehicle_entries')
        .select('id, entry_date, entry_number, license_plate, status, vehicles (brand_type, vehicle_type)')
        .not('status', 'in', '("CLOSED","COMPLETED","CANCELLED")') 
        .order('entry_date', { ascending: false });

      if (dashboardError) console.error('Dashboard Query Error:', dashboardError);
      setData(dashboardData || []);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRawData();
  }, []);

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between">
        <h1 className="text-2xl font-bold">Debug Dashboard Query</h1>
        <Button onClick={fetchRawData}>Refresh Data</Button>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <Card>
          <CardHeader><CardTitle>Raw Statuses in DB ({rawStatus.length})</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs bg-slate-100 p-4 rounded overflow-auto max-h-[500px]">
              {JSON.stringify(rawStatus, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Dashboard Query Result ({data.length})</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs bg-slate-100 p-4 rounded overflow-auto max-h-[500px]">
              {JSON.stringify(data, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
