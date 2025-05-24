export const dynamic = 'force-dynamic';

export default async function TagPage({ params }: { params: { id: string } }) {
  return (
    <div className="p-6 text-center">
      <h1 className="text-2xl font-bold">Dynamic Tag Page</h1>
      <p className="mt-2">You are viewing tag: <strong>{params.id}</strong></p>
    </div>
  );
}
