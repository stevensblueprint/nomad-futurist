import styles from "./AuthForm.module.css";

export default function AuthErrorNotice({ message }: { message?: string }) {
  return (
    <div aria-live="assertive" aria-atomic="true">
      {message && (
        <div role="alert" className={styles.errorNotice}>
          <p className={styles.errorTitle}>Authentication error</p>
          <p>{message}</p>
        </div>
      )}
    </div>
  );
}
