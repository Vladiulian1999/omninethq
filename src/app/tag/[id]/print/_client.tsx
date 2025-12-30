'use client';

import { useMemo } from 'react';
import QRCode from 'react-qr-code';
import { BackButton } from '@/components/BackButton';

export default function PrintClient({ tagId }: { tagId: string }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://omninethq.co.uk';
  const url = useMemo(() => `${origin}/tag/${encodeURIComponent(tagId)}`, [origin, tagId]);

  return (
    <div className="p-8 text-center">
      <BackButton />
      <h1 className="text-2xl font-bold mb-4">Print QR</h1>
      <div className="inline-block bg-white p-4 rounded-2xl border">
        <QRCode value={url} size={220} level="H" />
      </div>
      <div className="mt-3 text-xs text-gray-500 break-all">{url}</div>
    </div>
  );
}
