'use client';

import QRCode from 'react-qr-code';

type Props = {
  value: string;
  size?: number; // pixels
};

export default function QR({ value, size = 256 }: Props) {
  // react-qr-code is SVG and scales crisply for print
  return (
    <div style={{ height: size, width: size }}>
      <QRCode value={value} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}
