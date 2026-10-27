"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthSession } from "../hooks/useAuthSession";
import SignOutButton from "../components/SignOutButton";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const status = useAuthSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/sign-up");
  }, [status, router]);

  // Never show protected content until we know the user is signed in
  if (status !== "authenticated") {
    return <div role="status" aria-live="polite">Loading…</div>;
  }

  return <>
  <header>
    <SignOutButton />
  </header>
  {children}</>;
}