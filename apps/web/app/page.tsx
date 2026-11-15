export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-emerald-700">
        Qawaed / قواعد
      </p>
      <h1 className="text-4xl font-semibold tracking-tight">
        Every decision. Accounted for.
      </h1>
      <p className="mt-6 text-lg text-slate-600">
        Foundation milestone: Next.js, NestJS and PostgreSQL. Filing and review
        features arrive in the next milestones.
      </p>
      <a
        className="mt-8 inline-block rounded-lg bg-emerald-800 px-5 py-3 text-white"
        href="/api/health"
      >
        Check API readiness
      </a>
    </main>
  );
}
