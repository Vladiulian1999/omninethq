'use client';

import { useRouter } from 'next/navigation';

export function BackButton({
  fallback = '/explore',
  className = 'inline-flex items-center gap-2 text-sm text-gray-600 hover:text-black',
  children,
}: {
  fallback?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();

  const handleBack = () => {
    try {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        router.back();
      } else {
        router.push(fallback);
      }
    } catch {
      router.push(fallback);
    }
  };

  return (
    <button onClick={handleBack} className={className} aria-label="Go back">
      {children ?? <>← Back</>}
    </button>
  );
}

