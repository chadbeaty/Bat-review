import { requireOwner } from "@/lib/auth/member";

export const maxDuration = 300;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return <>{children}</>;
}
