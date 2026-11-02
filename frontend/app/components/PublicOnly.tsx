"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthSession } from "../hooks/useAuthSession";

export default function PublicOnly({ children }: { children: React.ReactNode }) {
  const status = useAuthSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  if (status !== "unauthenticated") {
    return <div role="status" aria-live="polite">Loading…</div>;
  }

  return <>{children}</>;
}