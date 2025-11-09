export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import ExperimentsClient from './_client';

export default function Page() {
  return <ExperimentsClient />;
}

