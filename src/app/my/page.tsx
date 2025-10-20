export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// IMPORTANT: no hooks, no supabase imports here
import MyClient from './_client';

export default function Page() {
  return <MyClient />;
}

