'use client';

import { useEffect, useMemo, useRef } from 'react';
import QRCode from 'react-qr-code';
import { BackButton } from '@/components/BackButton';

type PrintClientProps = {
  tagId: string;
};

export default function PrintClient({ tagId }: PrintClientProps) {
  const hasTriggeredPrint = useRef(false);

  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://omninethq.co.uk';

  const url = useMemo(() => {
    return `${origin}/tag/${encodeURIComponent(tagId)}`;
  }, [origin, tagId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasTriggeredPrint.current) return;

    hasTriggeredPrint.current = true;

    const timer = window.setTimeout(() => {
      window.print();
    }, 400);

    return () => window.clearTimeout(timer);
  }, []);

  const handlePrint = () => {
    if (typeof window === 'undefined') return;
    window.print();
  };

  return (
    <>
      <style jsx global>{`
        @media print {
          header,
          nav,
          aside,
          footer,
          .no-print {
            display: none !important;
          }

          html,
          body {
            background: white !important;
          }

          body {
            margin: 0;
            padding: 0;
          }

          .print-shell {
            padding: 0 !important;
            margin: 0 !important;
            min-height: auto !important;
          }

          .print-card {
            box-shadow: none !important;
            border: 1px solid #e5e7eb !important;
            margin: 0 auto !important;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div className="print-shell min-h-screen bg-white p-8 text-center">
        <div className="no-print mx-auto mb-6 flex max-w-xl items-center justify-between">
          <BackButton />
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Print now
          </button>
        </div>

        <div className="print-card mx-auto max-w-xl rounded-2xl border bg-white p-8">
          <h1 className="mb-2 text-3xl font-bold">Scan to open</h1>
          <p className="mb-6 text-sm text-gray-500">
            Point your camera at the QR code to open this OmniNet tag.
          </p>

          <div className="mx-auto inline-block rounded-2xl border bg-white p-4">
            <QRCode value={url} size={220} level="H" />
          </div>

          <div className="mt-5 break-all text-xs text-gray-500">{url}</div>
        </div>
      </div>
    </>
  );
}