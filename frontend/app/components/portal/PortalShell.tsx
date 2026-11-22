"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useCurrentUser, type CurrentUser } from "../../hooks/useCurrentUser";
import Sidebar, { PortalNavLinks } from "./Sidebar";
import TopBar from "./TopBar";
import styles from "./PortalShell.module.css";

const PortalUserContext = createContext<CurrentUser | null>(null);

export function usePortalUser() {
  return useContext(PortalUserContext);
}

export default function PortalShell({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const canRegister = user?.groups.includes("Founders") ?? false;

  return (
    <PortalUserContext.Provider value={user}>
      <div className={styles.shell}>
        <Sidebar canRegister={canRegister} />
        <div className={styles.content}>
          <TopBar user={user} />
          {children}
        </div>
        <nav className={styles.mobileNav} aria-label="Primary">
          <PortalNavLinks canRegister={canRegister} />
        </nav>
      </div>
    </PortalUserContext.Provider>
  );
}
