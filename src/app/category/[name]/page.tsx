
import React from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

type Tag = {
  id: string;
  title: string;
  description: string;
  category: string;
};

const getCategoryBadge = (category: string) => {
  const base = 'inline-block text-xs px-2 py-1 rounded-full font-medium';
  switch (category) {
    case 'rent':
      return `${base} bg-blue-100 text-blue-800`;
    case 'sell':
      return `${base} bg-green-100 text-green-800`;
    case 'teach':
      return `${base} bg-yellow-100 text-yellow-800`;
    case 'help':
      return `${base} bg-purple-100 text-purple-800`;
    default:
      return `${base} bg-gray-100 text-gray-800`;
  }
};

const getCategoryEmoji = (category: string) => {
  switch (category) {
    case 'rent':
      return '🪜';
    case 'sell':
      return '🛒';
    case 'teach':
      return '🎓';
    case 'help':
      return '🤝';
    default:
      return '';
  }
};

export default async function CategoryPage({ params }: { params: { name: string } }) {
  const category = decodeURIComponent(params.name);

  const { data: tags, error } = await supabase
    .from('messages')
    .select('id, title, description, category')
    .eq('category', category);

  if (error || !tags) {
    return (
      <div className="p-10 text-center text-red-600">
        <h1 className="text-2xl font-bold">Error loading category</h1>
        <p>{error?.message || 'No data found.'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <Link href="/explore" className="text-blue-600 hover:underline text-sm">
          ← Back to Explore
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6 text-center capitalize">
        {category} tags
      </h1>

      {tags.length === 0 ? (
        <div className="text-center text-gray-600">
          <p>No tags found in this category.</p>
          <p className="mt-2">
            Want to create one?{' '}
            <Link href="/new" className="text-blue-600 hover:underline">
              Click here
            </Link>
          </p>
        </div>
      ) : (
        <ul className="space-y-6">
          {tags.map((tag: Tag) => (

            <li
              key={tag.id}
              className="p-4 bg-white shadow rounded border border-gray-100 hover:shadow-md transition"
            >
              <div className="flex justify-between items-center mb-1">
                <Link href={`/tag/${tag.id}`}>
                  <h2 className="text-lg font-semibold hover:underline">
                    {getCategoryEmoji(tag.category)} {tag.title}
                  </h2>
                </Link>
                <span className={getCategoryBadge(tag.category)}>{tag.category}</span>
              </div>
              <p className="text-gray-600 text-sm">{tag.description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
