import QR from '@/components/QR'; // reuse your existing QR component
import { Suspense } from 'react';

export default function PrintPage({ params }: { params: { id: string } }) {
  const url = `${process.env.NEXT_PUBLIC_SITE_URL}/tag/${params.id}`;

  return (
    <Suspense fallback={null}>
      <div className="p-10 print:p-0 flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold print:text-xl">Scan to view this OmniTag</h1>
        <div className="p-6 border rounded-2xl">
          <QR value={url} size={512} />
        </div>
        <p className="text-lg opacity-80">{url}</p>
        <style>{`
          @media print {
            @page { size: A4; margin: 12mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .print\\:text-xl { font-size: 1.25rem; }
            .print\\:p-0 { padding: 0 !important; }
          }
        `}</style>
      </div>
    </Suspense>
  );
}
