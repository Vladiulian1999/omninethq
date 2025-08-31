'use client';

import { useMemo } from "react";
import QR from "@/components/QR";

function sanitizeId(id: string) {
  // remove angle brackets and spaces accidentally introduced in links
  return id.replace(/[<>\s]/g, "");
}

export default function PrintQR({ id }: { id: string }) {
  const cleanId = useMemo(() => sanitizeId(id), [id]);

  // Always correct on the client
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://omninethq.co.uk";
  const url = `${origin}/tag/${cleanId}`;

  return (
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
  );
}
