"use client";

import { useEffect, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

export interface CurrentUser {
  /** Display name derived from the Cognito ID token (falls back to the email local part). */
  name: string;
  email: string;
  /** One or two uppercase letters for the avatar. */
  initials: string;
  groups: string[];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function userFromPayload(payload: Record<string, unknown> | undefined): CurrentUser | null {
  if (!payload) return null;
  const email = asString(payload.email) ?? "";
  const given = asString(payload.given_name);
  const family = asString(payload.family_name);
  const name = asString(payload.name) ?? [given, family].filter(Boolean).join(" ");
  const displayName = name || (email ? email.split("@")[0] : "Founder");
  const rawGroups = payload["cognito:groups"];
  const groups = Array.isArray(rawGroups) ? rawGroups.filter((g): g is string => typeof g === "string") : [];
  return { name: displayName, email, initials: initialsFor(displayName), groups };
}

/**
 * Reads the signed-in user's profile from the Cognito ID token.
 * Returns `null` until the session has been read or when no ID token is present.
 */
export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let active = true;
    void fetchAuthSession()
      .then((session) => {
        if (!active) return;
        const payload = session.tokens?.idToken?.payload as Record<string, unknown> | undefined;
        setUser(userFromPayload(payload));
      })
      .catch(() => {
        if (active) setUser(null);
      });
    return () => {
      active = false;
    };
  }, []);

  return user;
}
