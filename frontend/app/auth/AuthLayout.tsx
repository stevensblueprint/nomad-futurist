import Image from "next/image";
import type { ReactNode } from "react";
import styles from "./AuthForm.module.css";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <aside
        className={styles.brandPanel}
        aria-label="Nomad Futurist Foundation"
      >
        <Image src="/assets/nomad-logo.png" width="144" height="144" alt="" />
        <div className={styles.brandCopy}>
          <h2>
            Build what
            <br />
            comes next.
          </h2>
          <p>
            Your ideas. A community of mentors.
            <br />A place to move forward.
          </p>
          <div className={styles.accent} />
          <small>NOMAD FUTURIST FOUNDATION</small>
        </div>
      </aside>
      <section className={styles.region} aria-labelledby="auth-heading">
        <div className={styles.content}>
          <div className={styles.mobileBrand}>
            <Image src="/assets/nomad-logo.png" width="48" height="48" alt="" /> NOMAD
            FUTURIST
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
