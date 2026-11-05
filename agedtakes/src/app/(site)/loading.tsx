export default function Loading() {
  return (
    <div className="wrap py-16" aria-busy="true" aria-live="polite">
      <p className="kicker">Pulling the records…</p>
      <div className="mt-6 space-y-4">
        <div className="h-10 w-2/3 animate-pulse bg-paper-2" />
        <div className="h-4 w-full animate-pulse bg-paper-2" />
        <div className="h-4 w-5/6 animate-pulse bg-paper-2" />
      </div>
    </div>
  );
}
