import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SalesInvoiceDisabled() {
  return (
    <div className="p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Pembayaran Piutang</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-slate-600">
            Fitur Piutang Usaha sedang dinonaktifkan.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

