// ✅ src/app/page.tsx (Welcome Homepage for OmniNet)
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6 py-16 text-center">
      <div className="max-w-2xl">
        <h1 className="text-5xl font-extrabold mb-6">👁 OmniNet</h1>
        <p className="text-xl text-gray-600 mb-8">
          The human API. Scan to hire, rent, or request anything.
        </p>

        <div className="grid gap-4 mb-12">
          <p className="text-gray-700">
            OmniNet connects real-world people, tools, and skills via QR tags you can stick anywhere.
          </p>
          <p className="text-gray-700">
            A bike fixer. A tool lender. A food maker. A guide. You don&apos;t need a website — just your tag.

          </p>
          <p className="text-gray-700">
            One scan. Instant action.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/explore"
            className="bg-black text-white px-6 py-3 rounded-xl text-lg font-semibold hover:bg-gray-900 transition"
          >
            🔎 Explore Tags
          </Link>
          <Link
            href="/new"
            className="border border-black text-black px-6 py-3 rounded-xl text-lg font-semibold hover:bg-black hover:text-white transition"
          >
            ➕ Create a Tag
          </Link>
        </div>
      </div>
    </main>
  );
}
