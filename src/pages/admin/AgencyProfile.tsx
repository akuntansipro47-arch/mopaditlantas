import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AgencyProfile() {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Profil Instansi</h2>
      <Card>
        <CardHeader>
          <CardTitle>Pengaturan Profil</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Halaman ini sedang disiapkan.
        </CardContent>
      </Card>
    </div>
  );
}

