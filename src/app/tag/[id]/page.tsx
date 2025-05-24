export const dynamic = 'force-dynamic';

export default function Page({ params }: { params: { id: string } }) {
  return (
    <div className="p-6 text-center">
      <h1 className="text-2xl font-bold">Tag ID: {params.id}</h1>
      <p>This is a dynamic route test.</p>
    </div>
  );
}
