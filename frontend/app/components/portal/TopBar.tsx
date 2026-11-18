"use client";

import { useEffect, useRef, useState } from "react";
import type { CurrentUser } from "../../hooks/useCurrentUser";
import SignOutButton from "../SignOutButton";
import { BrandMark } from "./Sidebar";
import styles from "./PortalShell.module.css";

export default function TopBar({ user }: { user: CurrentUser | null }) {
  const [open, setOpen] = useState(false);
  const account = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: PointerEvent) {
      if (!account.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [open]);

  return (
    <header className={styles.topBar}>
      <p className={styles.portalTitle}>Your incubator portal</p>
      <div className={styles.mobileBrand}><BrandMark compact /></div>
      <div
        className={styles.account}
        ref={account}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !open) return;
          setOpen(false);
          trigger.current?.focus();
        }}
      >
        <button
          type="button"
          className={styles.avatar}
          aria-label="Account menu"
          aria-expanded={open}
          aria-controls={open ? "portal-account" : undefined}
          ref={trigger}
          onClick={() => setOpen(!open)}
        >
          {user?.initials ?? "?"}
        </button>
        {open && (
          <div id="portal-account" className={styles.accountPanel}>
            <p>{user?.name ?? "Signed in"}</p>
            {user?.email && <p className={styles.email}>{user.email}</p>}
            <SignOutButton className={styles.signOut} />
          </div>
        )}
      </div>
    </header>
  );
}
