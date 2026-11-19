import Link from "next/link";

export default function NotFound() {
  return (
    <div className="pt-16 text-center">
      <p className="num text-6xl text-chalk-3">Foul</p>
      <p className="mt-3 text-[15px] text-chalk-2">That page landed out of play.</p>
      <Link href="/" className="mt-6 inline-block text-optic">Back home</Link>
    </div>
  );
}
