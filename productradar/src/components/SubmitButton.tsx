"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className, pendingText = "Working…", confirm }: { children: React.ReactNode; className: string; pendingText?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingText : children}
    </button>
  );
}
