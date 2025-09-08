'use client';

type Props = {
  url: string;
  title?: string;
  className?: string;
  children?: React.ReactNode;
  onShared?: (method: 'share' | 'copy') => void;
};

export default function ShareButton({ url, title = 'Check this out on OmniNet', className, children, onShared }: Props) {
  const handle = async () => {
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator && (navigator as any).share) {
        await (navigator as any).share({ title, url });
        onShared?.('share');
        return;
      }
      await navigator.clipboard.writeText(url);
      onShared?.('copy');
      alert('🔗 Link copied to clipboard!');
    } catch {
      alert('Could not share right now.');
    }
  };

  return (
    <button onClick={handle} className={className || 'px-3 py-2 rounded-xl border hover:bg-gray-50 text-sm'}>
      {children ?? 'Share'}
    </button>
  );
}
