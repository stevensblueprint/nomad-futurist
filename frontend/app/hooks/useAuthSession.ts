"use client";

import { useEffect, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

async function checkAuthenticated(): Promise<boolean> {
  try {
    const session = await fetchAuthSession();
    return Boolean(session.tokens?.accessToken);
  } catch {
    return false;
  }
}

export function useAuthSession(): AuthStatus {
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let active = true;

    const run = async () => {
      const ok = await checkAuthenticated();
      if (active) setStatus(ok ? "authenticated" : "unauthenticated");
    };

    run();
    const stopListening = Hub.listen("auth", () => run());

    return () => {
      active = false;
      stopListening();
    };
  }, []);

  return status;
}