import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function Page({ params }: { params: { id: string } }) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !data) {
    return (
      <div className="p-6 text-center text-red-600">
        <h1 className="text-2xl font-bold">Not Found</h1>
        <p>We couldn't find a service with ID: {params.id}</p>
      </div>
    );
  }

  return (
    <div className="p-6 text-center">
      <h1 className="text-3xl font-bold">{data.title || 'Untitled Tag'}</h1>
      <p className="mt-4 text-gray-600">{data.description || 'No details provided.'}</p>
    </div>
  );
}
