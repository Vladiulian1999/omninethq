import { FC } from 'react';

interface TagPageProps {
  params: { id: string };
}

const TagPage: FC<TagPageProps> = ({ params }) => {
  return (
    <div className="p-6 text-center">
      <h1 className="text-2xl font-bold">Tag ID: {params.id}</h1>
      <p className="mt-4 text-gray-600">This tag is now live and detectable via QR code!</p>
    </div>
  );
};

export default TagPage;
