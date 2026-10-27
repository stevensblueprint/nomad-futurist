import type { Metadata } from "next";
import AuthForm from "../auth/AuthForm";

export const metadata: Metadata = {
  title: "Sign In | Nomad Incubator",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{notice?: string}>;
}) {
  const { notice } = await searchParams;
  return (
    <AuthForm 
    mode="sign-in" 
    initialNotice={
      notice === "confirmed-please-sign-in"
      ? "Your account is confirmed. Please sign in."
      : undefined
  } />);
}
