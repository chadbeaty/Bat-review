import Link from "next/link";
import { brand } from "@/config/brand";
import { LogoMark, LogoWordmark } from "./Logo";

/** The site logo as a home link: the stamp mark plus the wordmark. */
export function Wordmark({ className = "", size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2.5 text-ink no-underline ${className}`} aria-label={`${brand.name} home`}>
      <LogoMark size={size === "lg" ? 44 : 34} />
      <LogoWordmark className={size === "lg" ? "text-[1.7rem]" : "text-[1.2rem]"} />
    </Link>
  );
}
