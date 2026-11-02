import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap grid max-w-2xl gap-4 py-20">
      <p className="eyebrow">404</p>
      <h1 className="display text-5xl font-bold">That page isn&apos;t here</h1>
      <p className="text-ink-soft">It may have moved, or the listing may have sold and been removed.</p>
      <p className="flex gap-3">
        <Link href="/" className="btn btn-primary">
          Homepage
        </Link>
        <Link href="/shop" className="btn btn-outline">
          Shop equipment
        </Link>
      </p>
    </div>
  );
}
