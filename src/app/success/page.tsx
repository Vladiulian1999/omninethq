import SuccessClient from "./_client";

export const runtime = "nodejs";

export default function Page({
  searchParams,
}: {
  searchParams: { session_id?: string; tag?: string; ch?: string };
}) {
  const sessionId = searchParams?.session_id || "";
  const tagFromQS = searchParams?.tag || "";
  const chFromQS = searchParams?.ch || "";
  return <SuccessClient sessionId={sessionId} tagFromQS={tagFromQS} chFromQS={chFromQS} />;
}

