export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// IMPORTANT: this file must NOT use hooks and must NOT have "use client"
import ExperimentsClient from './_client'; // or './client' if that's your file name

export default function Page() {
  return <ExperimentsClient />;
}



