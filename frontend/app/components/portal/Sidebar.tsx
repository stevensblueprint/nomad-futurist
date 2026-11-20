"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, PORTAL_NAV } from "./nav";
import styles from "./PortalShell.module.css";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={compact ? styles.compactBrand : styles.brand}>
      <Image
        src="/assets/portal/logo-light.png"
        alt=""
        width={compact ? 36 : 62}
        height={compact ? 29 : 49}
        unoptimized
      />
      <span>Nomad Futurist <small>Incubator</small></span>
    </Link>
  );
}

export function PortalNavLinks({ canRegister }: { canRegister: boolean }) {
  const pathname = usePathname() ?? "/";
  const items = PORTAL_NAV.filter(({ href }) => href !== "/registration" || canRegister);

  return (
    <ul className={styles.links}>
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} aria-current={isNavItemActive(item, pathname) ? "page" : undefined}>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Sidebar({ canRegister }: { canRegister: boolean }) {
  return (
    <aside className={styles.sidebar}>
      <BrandMark />
      <nav aria-label="Primary"><PortalNavLinks canRegister={canRegister} /></nav>
      <div className={styles.support}>
        <p>Ideas need connection.</p>
        <p>Discover perspectives in digital infrastructure.</p>
        <p>Nomad Futurist Foundation</p>
      </div>
    </aside>
  );
}
