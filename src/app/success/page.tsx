import SuccessClient from './_client';

export const runtime = 'nodejs';

export default function Page({
  searchParams,
}: {
  searchParams: { session_id?: string; tag?: string; ch?: string; cv?: string; claim?: string };
}) {
  const sessionId = searchParams?.session_id || '';
  const tagFromQS = searchParams?.tag || '';
  const chFromQS = searchParams?.ch || '';
  const cvFromQS = searchParams?.cv || '';
  const claimRef = searchParams?.claim || '';

  return (
    <SuccessClient
      sessionId={sessionId}
      tagFromQS={tagFromQS}
      chFromQS={chFromQS}
      cvFromQS={cvFromQS}
      claimRef={claimRef}
    />
  );
}
