import Link from "next/link";
import { brand } from "@/config/brand";

export function Wordmark({ className = "" }: { className?: string }) {
  const [first, second] = brand.wordmark;
  return (
    <Link href="/" className={`display text-[1.65rem] font-bold text-ink no-underline ${className}`} aria-label={`${brand.name} home`}>
      {first}
      <span className="font-medium text-ink-soft">{second}</span>
    </Link>
  );
}
