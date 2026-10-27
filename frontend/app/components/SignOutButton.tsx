"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "aws-amplify/auth";

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false); // blocks double-clicks before state updates

  async function handleSignOut() {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError("");
    try {
      await signOut();
      router.replace("/sign-up");
    } catch {
      setError("Sign out failed. Please try again.");
      inFlight.current = false;
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={handleSignOut} disabled={loading}>
        {loading ? "Signing out…" : "Sign out"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}