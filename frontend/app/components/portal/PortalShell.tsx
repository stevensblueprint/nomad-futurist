import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

/**
 * Shared chrome for every protected page: navy sidebar on desktop,
 * compact header with a horizontal nav on smaller screens.
 */
export default function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-nf-canvas text-nf-ink">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
