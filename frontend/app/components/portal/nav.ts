export interface PortalNavItem {
  href: string;
  label: string;
  /** When true, the item is active for any path that starts with `href`. */
  matchPrefix?: boolean;
}

export const PORTAL_NAV: PortalNavItem[] = [
  { href: "/", label: "Portal" },
  { href: "/registration", label: "Register project", matchPrefix: true },
  { href: "/projects", label: "My projects", matchPrefix: true },
];

export function isNavItemActive(item: PortalNavItem, pathname: string): boolean {
  if (item.matchPrefix) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return pathname === item.href;
}
