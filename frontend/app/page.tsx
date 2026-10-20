"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchAuthSession, signOut } from "aws-amplify/auth";
import "./auth/amplify-config";
import styles from "./Home.module.css";

type HomeAccess = "checking" | "founder" | "other";

export default function Home() {
  const router = useRouter();
  const [access, setAccess] = useState<HomeAccess>("checking");

  useEffect(() => {
    let active = true;
    void fetchAuthSession()
      .then((session) => {
        if (!active) return;
        const groups = session.tokens?.idToken?.payload["cognito:groups"];
        setAccess(
          session.tokens?.idToken && Array.isArray(groups) && groups.includes("Founders")
            ? "founder"
            : "other",
        );
      })
      .catch(() => {
        if (active) setAccess("other");
      });

    return () => {
      active = false;
    };
  }, []);


  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1>Home</h1>
        {access === "founder" && (
          <button
            className={styles.registerButton}
            type="button"
            onClick={() => router.push("/register-project")}
          >
            Register your project
          </button>
        )}
        <button onClick={() => signOut()}> Sign Out </button>
      </div>
    </main>
  );
}
