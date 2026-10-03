import type { Metadata } from "next";
import AuthForm from "../auth/AuthForm";

export const metadata: Metadata = {
  title: "Sign In | Nomad Incubator",
};

export default function SignInPage() {
  return <AuthForm mode="sign-in" />;
}
