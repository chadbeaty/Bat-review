import Link from "next/link";
import { AdminTitle } from "./ui";

/** An admin area that depends on checkout or shipping, which aren't live yet. */
export function AdminLater({ title, arrives, what }: { title: string; arrives: string; what: string[] }) {
  return (
    <>
      <AdminTitle title={title} />
      <section className="card grid gap-3 p-5">
        <p className="eyebrow">Arrives with {arrives}</p>
        <p>This screen opens once {arrives} is live, because until then there is nothing to manage here. It will let staff:</p>
        <ul className="list-disc pl-5 text-sm">
          {what.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <p className="text-sm">
          <Link href="/admin" className="underline">
            Back to the overview
          </Link>
        </p>
      </section>
    </>
  );
}
