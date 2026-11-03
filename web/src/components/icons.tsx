// Gamer Bat's own icon set: 24px grid, 1.75 stroke, square caps and mitered corners (like marks drawn with a ruler).
// Icons are decorative by default (aria-hidden). Pass `title` when an icon stands alone without text.

import type { ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number | string; title?: string };

function Icon({ size = 20, title, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="square"
      strokeLinejoin="miter"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function BatIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <g transform="rotate(-45 12 12)">
        <path d="M1.5 11H4.5L12.5 11 13.4 9.3H21.5Q22.5 9.3 22.5 12Q22.5 14.7 21.5 14.7H13.4L12.5 13H4.5H1.5Z" />
      </g>
    </Icon>
  );
}

export function GloveIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 21V15L3 11L5 10L7 13V5H9.5V11V4H12V11V5H14.5V12V7H17V15L15 18V21Z" />
    </Icon>
  );
}

export function BallIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M6.2 5.2C9.2 8 9.2 16 6.2 18.8M17.8 5.2C14.8 8 14.8 16 17.8 18.8" />
    </Icon>
  );
}

export function BagIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 9H20V20H4Z" />
      <path d="M9 9V5H15V9M4 14H20M12 12V16" />
    </Icon>
  );
}

export function StampIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M10 3H14V9L17 11V14H7V11L10 9Z" />
      <path d="M4 20H20M6 17H18" />
    </Icon>
  );
}

export function RulerIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 8H21V16H3Z" />
      <path d="M7 8V12M11 8V13M15 8V12M19 8V13" />
    </Icon>
  );
}

export function TagIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 4H11L21 14L13 22L3 12Z" />
      <circle cx="7.5" cy="8.5" r="1.25" />
    </Icon>
  );
}

export function FenceIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 4V20M21 4V20M3 5H21M3 19H21M3 5L12 19L21 5M3 19L12 5L21 19" />
    </Icon>
  );
}

export function ShieldIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3L20 6V12C20 17 16.5 20 12 21C7.5 20 4 17 4 12V6Z" />
      <path d="M8.5 12L11 14.5L15.5 9.5" />
    </Icon>
  );
}

export function TruckIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2 6H13V16H2Z" />
      <path d="M13 9.5H17L21 13V16H13" />
      <circle cx="6.5" cy="18" r="1.75" />
      <circle cx="17" cy="18" r="1.75" />
    </Icon>
  );
}

export function MessageIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 4H21V16H12L7 20V16H3Z" />
      <path d="M7 9H17M7 12H13" />
    </Icon>
  );
}

export function HeartIcon({ filled, ...p }: IconProps & { filled?: boolean }) {
  return (
    <Icon {...p} fill={filled ? "currentColor" : "none"}>
      <path d="M12 20.5L4.6 13C2.5 10.8 3 7 5.8 6C8 5.2 10.5 6 12 8C13.5 6 16 5.2 18.2 6C21 7 21.5 10.8 19.4 13Z" />
    </Icon>
  );
}

export function MenuIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 6H21M3 12H21M3 18H21" />
    </Icon>
  );
}

export function UserIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21V19Q4 15 12 15Q20 15 20 19V21Z" />
    </Icon>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
    </Icon>
  );
}

export function FilterIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 5H21L14 13V20L10 18V13Z" />
    </Icon>
  );
}

export function GridIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 4H10.5V10.5H4ZM13.5 4H20V10.5H13.5ZM4 13.5H10.5V20H4ZM13.5 13.5H20V20H13.5Z" />
    </Icon>
  );
}

export function ArrowIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 12H20M14 6L20 12L14 18" />
    </Icon>
  );
}

export function CloseIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 5L19 19M19 5L5 19" />
    </Icon>
  );
}

/** Icon for a category slug, for listings that aren't bats (no bat drawing to show). */
export function CategoryIcon({ slug, ...p }: IconProps & { slug?: string | null }) {
  switch (slug) {
    case "bats":
      return <BatIcon {...p} />;
    case "gloves":
    case "batting-gloves":
      return <GloveIcon {...p} />;
    case "bags":
      return <BagIcon {...p} />;
    case "balls":
      return <BallIcon {...p} />;
    default:
      return <TagIcon {...p} />;
  }
}
