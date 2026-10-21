"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchAuthSession, signOut } from "aws-amplify/auth";
import "./auth/amplify-config";
import styles from "./Home.module.css";
import AuthErrorNotice from "./auth/AuthErrorNotice";

type HomeAccess = "checking" | "founder" | "other" | "signed-out";

export default function Home() {
  const router = useRouter();
  const [access, setAccess] = useState<HomeAccess>("checking");
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const logoutInProgress = useRef(false);

  useEffect(() => {
    let active = true;
    void fetchAuthSession()
      .then((session) => {
        if (!active) return;
        const groups = session.tokens?.idToken?.payload["cognito:groups"];
        setAccess(
          session.tokens?.idToken && Array.isArray(groups) && groups.includes("Founders")
            ? "founder"
            : session.tokens?.accessToken ? "other" : "signed-out",
        );
      })
      .catch(() => {
        if (active) setAccess("signed-out");
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSignOut() {
    if (logoutInProgress.current) return;
    logoutInProgress.current = true;
    setSigningOut(true);
    setLogoutError("");
    try {
      await signOut();
      setAccess("signed-out");
      router.replace("/sign-in");
    } catch {
      setLogoutError("We couldn't sign you out. Please try again.");
    } finally {
      logoutInProgress.current = false;
      setSigningOut(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1>Home</h1>
        {access === "founder" && (
          <button
            className={styles.registerButton}
            type="button"
            disabled={signingOut}
            onClick={() => router.push("/registration")}
          >
            Register your project
          </button>
        )}
        {(access === "founder" || access === "other") && (
          <button className={styles.registerButton} type="button" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? "Signing out..." : "Sign Out"}
          </button>
        )}
        <AuthErrorNotice message={logoutError} />
      </div>
    </main>
  );
}
