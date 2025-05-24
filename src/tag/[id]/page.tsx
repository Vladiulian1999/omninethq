

interface TagPageProps {
  params: { id: string };
}

export async function generateStaticParams() {
  return [{ id: 'example' }]; // 👈 required to enable static generation of dynamic routes
}

export default function TagPage({ params }: TagPageProps) {
  return (
    <div className="p-6 text-center">
      <h1 className="text-2xl font-bold">Tag ID: {params.id}</h1>
      <p className="mt-4 text-gray-600">This tag is now live and detectable via QR code!</p>
    </div>
  );
}
