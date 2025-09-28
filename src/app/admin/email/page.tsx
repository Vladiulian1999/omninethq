import { Suspense } from "react";
import ClientEmailEvents from "./_client";

export const metadata = {
  title: "Email Events • OmniNet",
};

export default function Page() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold mb-4">Email Events</h1>
      <p className="text-sm text-gray-600 mb-4">
        Live log of Resend events. You’ll see your own tag-related emails.
        Admins see everything.
      </p>
      <Suspense fallback={<div className="animate-pulse">Loading…</div>}>
        <ClientEmailEvents />
      </Suspense>
    </div>
  );
}
