import { Suspense } from "react";
import PublicPage from "./public-page";

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-4xl px-4 py-16 text-center text-slate-500">
          Loading page...
        </main>
      }
    >
      {params.then(({ slug }) => <PublicPage slug={slug} />)}
    </Suspense>
  );
}
