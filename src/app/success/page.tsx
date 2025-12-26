import SuccessClient from './_client';

export const runtime = 'nodejs';

export default function Page({
  searchParams,
}: {
  searchParams: { session_id?: string; tag?: string; ch?: string; cv?: string };
}) {
  const sessionId = searchParams?.session_id || '';
  const tagFromQS = searchParams?.tag || '';
  const chFromQS = searchParams?.ch || '';
  const cvFromQS = searchParams?.cv || '';

  return (
    <SuccessClient
      sessionId={sessionId}
      tagFromQS={tagFromQS}
      chFromQS={chFromQS}
      cvFromQS={cvFromQS}
    />
  );
}
