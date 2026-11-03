import type { ButtonHTMLAttributes } from "react";
import styles from "./PrimaryButton.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
};
export default function PrimaryButton({
  loading,
  loadingLabel = "Please wait…",
  disabled,
  children,
  className,
  ...props
}: Props) {
  return (
    <button
      {...props}
      className={[styles.button, className].filter(Boolean).join(" ")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? loadingLabel : children}
    </button>
  );
}
