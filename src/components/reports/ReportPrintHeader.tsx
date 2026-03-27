import { formatDate } from '@/lib/utils';

type Props = {
  title: string;
  periodStart?: string;
  periodEnd?: string;
  asOfDate?: string;
  subtitle?: string;
};

export default function ReportPrintHeader({ title, periodStart, periodEnd, asOfDate, subtitle }: Props) {
  const printedAt = new Date();
  const periodText =
    asOfDate
      ? `Per Tanggal: ${formatDate(asOfDate)}`
      : periodStart && periodEnd
        ? `Periode: ${formatDate(periodStart)} s/d ${formatDate(periodEnd)}`
        : '';

  return (
    <div className="hidden print:block mb-6 text-center">
      <h1 className="text-xl font-bold uppercase">{title}</h1>
      {subtitle ? <p className="text-sm text-gray-600">{subtitle}</p> : null}
      {periodText ? <p className="text-sm text-gray-600">{periodText}</p> : null}
      <p className="text-xs text-gray-500">Dicetak: {printedAt.toLocaleString()}</p>
    </div>
  );
}

