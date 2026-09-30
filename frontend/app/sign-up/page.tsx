import type { Metadata } from "next";
import AuthForm from "../auth/AuthForm";

export const metadata: Metadata = {
  title: "Sign Up | Nomad Incubator",
};

export default function SignUpPage() {
  return <AuthForm mode="sign-up" />;
}
