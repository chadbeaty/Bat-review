import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "New password" };
export default function Page() {
  return <AuthForm mode="reset" />;
}
