"use client";

import { useEffect, useRef, useState } from "react";
import SignOutButton from "../SignOutButton";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { BrandMark, PortalNavLinks } from "./Sidebar";

export default function TopBar() {
  const user = useCurrentUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the account menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const initials = user?.initials ?? "…";

  return (
    <header className="sticky top-0 z-20 border-b border-nf-border bg-white">
      <div className="flex h-14 items-center justify-between gap-4 px-5 lg:px-10">
        {/* Mobile brand; the sidebar carries the brand on large screens */}
        <div className="flex items-center gap-4 lg:hidden">
          <div className="rounded-md bg-nf-navy p-1.5 text-white">
            <BrandMark compact />
          </div>
        </div>

        <p className="hidden text-sm font-semibold text-nf-navy lg:block">Your incubator portal</p>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label={user ? `Account menu for ${user.name}` : "Account menu"}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-nf-soft text-xs font-semibold text-nf-navy ring-1 ring-nf-border transition hover:ring-nf-copper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nf-copper"
          >
            {initials}
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-11 z-30 w-60 overflow-hidden rounded-lg border border-nf-border bg-white shadow-lg"
            >
              <div className="border-b border-nf-border px-4 py-3">
                <p className="truncate text-sm font-semibold text-nf-ink">{user?.name ?? "Signed in"}</p>
                {user?.email && <p className="truncate text-xs text-nf-muted">{user.email}</p>}
              </div>
              <div className="px-2 py-2">
                <SignOutButton className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-nf-ink hover:bg-nf-soft" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile navigation strip */}
      <nav className="border-t border-nf-border px-3 py-2 lg:hidden" aria-label="Primary">
        <PortalNavLinks orientation="horizontal" />
      </nav>
    </header>
  );
}
