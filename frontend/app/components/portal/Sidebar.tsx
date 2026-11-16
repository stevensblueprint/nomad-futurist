"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PORTAL_NAV, isNavItemActive } from "./nav";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3" aria-label="Nomad Futurist Incubator home">
      <Image
        src="/assets/nomad-logo.png"
        alt=""
        width={compact ? 32 : 44}
        height={compact ? 32 : 44}
        priority
      />
      <span className="flex flex-col leading-tight">
        <span className="font-heading text-[13px] font-semibold uppercase tracking-[0.12em]">
          Nomad Futurist
        </span>
        {!compact && (
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/70">
            Incubator
          </span>
        )}
      </span>
    </Link>
  );
}

export function PortalNavLinks({
  orientation,
  onNavigate,
}: {
  orientation: "vertical" | "horizontal";
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? "/";
  const vertical = orientation === "vertical";

  return (
    <ul className={vertical ? "flex flex-col gap-2" : "flex gap-2 overflow-x-auto"}>
      {PORTAL_NAV.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <li key={item.href} className={vertical ? undefined : "shrink-0"}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={[
                "block rounded-md text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nf-copper",
                vertical ? "px-4 py-2.5" : "px-3 py-1.5 whitespace-nowrap",
                active
                  ? "bg-nf-copper text-white"
                  : vertical
                    ? "text-white/85 hover:bg-white/10 hover:text-white"
                    : "text-nf-navy hover:bg-nf-soft",
              ].join(" ")}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function Sidebar() {
  return (
    <aside
      className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col bg-nf-navy px-6 py-7 text-white lg:flex"
      aria-label="Portal navigation"
    >
      <BrandMark />

      <nav className="mt-10" aria-label="Primary">
        <PortalNavLinks orientation="vertical" />
      </nav>

      <div className="mt-auto pt-10">
        <p className="font-heading text-lg font-semibold leading-snug">
          Ideas need
          <br />
          connection.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-white/75">
          Discover perspectives in digital infrastructure.
        </p>
        <div className="my-6 h-px w-full bg-white/20" aria-hidden="true" />
        <p className="text-[11px] text-white/80">Nomad Futurist Foundation</p>
      </div>
    </aside>
  );
}
