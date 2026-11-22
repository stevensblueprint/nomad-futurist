"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthSession } from "../hooks/useAuthSession";
import PortalShell from "../components/portal/PortalShell";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const status = useAuthSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/sign-in");
    }
  }, [status, router]);

  if (status === "loading") {
    return <p role="status">Checking session...</p>;
  }

  if (status === "unauthenticated") {
    return <p role="status">Redirecting...</p>;
  }

  return <PortalShell>{children}</PortalShell>;
}
