// Staff roles. Pure so navigation, server checks and tests agree. The database enforces the same rules.
//   researcher — research, create and edit drafts, triage submissions, queue AI jobs. Cannot approve or publish.
//   editor     — everything a researcher can, plus approve, publish, correct, resolve predictions, send newsletters.
//   admin      — everything, plus settings, roles, audit log and subscriber data.

export type StaffRole = "researcher" | "editor" | "admin";
export const STAFF_ROLES: StaffRole[] = ["researcher", "editor", "admin"];
const RANK: Record<StaffRole, number> = { researcher: 1, editor: 2, admin: 3 };

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return role === "researcher" || role === "editor" || role === "admin";
}

export function atLeast(role: string | null | undefined, min: StaffRole): boolean {
  return isStaffRole(role) && RANK[role] >= RANK[min];
}

export type AdminArea = { href: string; label: string; min: StaffRole; group: string };

export const ADMIN_AREAS: AdminArea[] = [
  { href: "/admin", label: "Overview", min: "researcher", group: "Newsroom" },
  { href: "/admin/approvals", label: "Editorial approvals", min: "researcher", group: "Newsroom" },
  { href: "/admin/cases", label: "Cases", min: "researcher", group: "Newsroom" },
  { href: "/admin/drafts", label: "AI-generated drafts", min: "researcher", group: "Newsroom" },
  { href: "/admin/research", label: "Research queue", min: "researcher", group: "Newsroom" },
  { href: "/admin/submissions", label: "Submissions", min: "researcher", group: "Newsroom" },
  { href: "/admin/people", label: "People", min: "researcher", group: "Record" },
  { href: "/admin/statements", label: "Statements", min: "researcher", group: "Record" },
  { href: "/admin/predictions", label: "Predictions", min: "researcher", group: "Record" },
  { href: "/admin/evidence", label: "Evidence", min: "researcher", group: "Record" },
  { href: "/admin/corrections", label: "Corrections", min: "researcher", group: "Record" },
  { href: "/admin/sources", label: "Sources", min: "researcher", group: "Pipeline" },
  { href: "/admin/ingestion", label: "Ingestion jobs", min: "researcher", group: "Pipeline" },
  { href: "/admin/ai", label: "AI usage and cost", min: "researcher", group: "Pipeline" },
  { href: "/admin/newsletter", label: "Newsletter", min: "editor", group: "Audience" },
  { href: "/admin/audit", label: "Audit log", min: "admin", group: "System" },
  { href: "/admin/settings", label: "Settings", min: "admin", group: "System" },
];

export function areasFor(role: StaffRole): AdminArea[] {
  return ADMIN_AREAS.filter((a) => atLeast(role, a.min));
}
