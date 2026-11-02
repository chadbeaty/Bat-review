// Staff roles and which admin areas each one can use. Pure, so the navigation and the server checks agree.

export type StaffRole = "admin" | "moderator" | "support";
export const STAFF_ROLES: StaffRole[] = ["admin", "moderator", "support"];

/** Who may use an area: "any" staff member, or one of the listed roles. Admins can always use everything. */
export type Access = "any" | StaffRole[];

export function hasAccess(roles: readonly string[], access: Access): boolean {
  if (roles.includes("admin")) return true;
  if (access === "any") return roles.some((r) => (STAFF_ROLES as string[]).includes(r));
  return access.some((r) => roles.includes(r));
}

export type AdminArea = { href: string; label: string; access: Access; group: string };

export const ADMIN_AREAS: AdminArea[] = [
  { href: "/admin", label: "Overview", access: "any", group: "Marketplace" },
  { href: "/admin/users", label: "Members", access: "any", group: "Marketplace" },
  { href: "/admin/listings", label: "Listings", access: ["moderator"], group: "Marketplace" },
  { href: "/admin/reports", label: "Reports", access: ["moderator"], group: "Marketplace" },
  { href: "/admin/support", label: "Support messages", access: ["support"], group: "Marketplace" },
  { href: "/admin/catalog", label: "Products", access: ["moderator"], group: "Catalog" },
  { href: "/admin/catalog/submissions", label: "Submissions", access: ["moderator"], group: "Catalog" },
  { href: "/admin/catalog/manufacturers", label: "Manufacturers", access: ["moderator"], group: "Catalog" },
  { href: "/admin/catalog/categories", label: "Categories", access: ["admin"], group: "Catalog" },
  { href: "/admin/refunds", label: "Refunds", access: ["support"], group: "Orders" },
  { href: "/admin/disputes", label: "Disputes", access: ["support"], group: "Orders" },
  { href: "/admin/payouts", label: "Payouts", access: ["admin"], group: "Orders" },
  { href: "/admin/shipping", label: "Shipping exceptions", access: ["support"], group: "Orders" },
  { href: "/admin/fees", label: "Fees", access: ["admin"], group: "Business" },
  { href: "/admin/settings", label: "Settings", access: ["admin"], group: "Business" },
  { href: "/admin/ads", label: "Advertising", access: ["admin"], group: "Business" },
  { href: "/admin/exports", label: "CSV exports", access: ["admin"], group: "Business" },
  { href: "/admin/audit", label: "Audit log", access: ["admin"], group: "System" },
  { href: "/admin/integrations", label: "Integrations", access: ["admin"], group: "System" },
];
