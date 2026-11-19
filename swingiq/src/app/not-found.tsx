import Link from "next/link";
import { GapMark as LogoMark } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="pt-16 text-center">
      <LogoMark size={52} className="mx-auto" />
      <p className="display mt-6 text-5xl">Foul ball.</p>
      <p className="mt-3 text-[15px] text-chalk-2">That page landed out of play.</p>
      <Link href="/" className="mt-6 inline-block text-optic">Back home</Link>
    </div>
  );
}
