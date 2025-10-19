// src/app/admin/experiments/page.tsx
import { Suspense } from "react";
import Client from "./_client";

export default function Page() {
  return (
    <Suspense>
      <Client />
    </Suspense>
  );
}


