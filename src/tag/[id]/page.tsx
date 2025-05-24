interface TagPageProps {
  params: { id: string };
}

export const dynamic = 'force-dynamic'; // 👈 forces server-side rendering

export default function TagPage({ params }: TagPageProps) {
  return (
    <div className="p-6 text-center">
      <h1 className="text-2xl font-bold">Tag ID: {params.id}</h1>
      <p className="mt-4 text-gray-600">
        This tag is now live and dynamically rendered based on its ID.
      </p>
    </div>
  );
}
