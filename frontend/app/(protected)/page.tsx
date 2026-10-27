"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchAuthSession } from "aws-amplify/auth";
import "../auth/amplify-config";
import styles from "../Home.module.css";

export default function Home() {
  const router = useRouter();
  const [isFounder, setIsFounder] = useState(false);

  useEffect(() => {
    let active = true;

    void fetchAuthSession()
      .then((session) => {
        const groups =
          session.tokens?.idToken?.payload["cognito:groups"];

        if (active) {
          setIsFounder(
            Array.isArray(groups) &&
            groups.includes("Founders")
          );
        }
      })
      .catch(() => {
        if (active) setIsFounder(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1>Home</h1>

        {isFounder && (
          <button
            className={styles.registerButton}
            type="button"
            onClick={() => router.push("/registration")}
          >
            Register your project
          </button>
        )}
      </div>
    </main>
  );
}
