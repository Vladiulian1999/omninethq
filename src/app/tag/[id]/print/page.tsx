import PrintQR from "./_client";

export const runtime = "nodejs";

export default function Page({ params }: { params: { id: string } }) {
  // Pass raw route id to client; it will sanitize and build proper origin
  return <PrintQR id={params.id} />;
}
