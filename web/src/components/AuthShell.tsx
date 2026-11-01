export function AuthShell({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="wrap grid place-items-center py-12 md:py-20">
      <div className="card grid w-full max-w-md gap-6 p-6 md:p-8">
        <div className="grid gap-2">
          <h1 className="display text-4xl font-bold">{title}</h1>
          {intro && <div className="text-ink-soft">{intro}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
