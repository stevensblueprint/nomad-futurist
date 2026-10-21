import type { Metadata } from "next";
import Registration from "./Registration";

export const metadata: Metadata = {
  title: "Register Your Project | Nomad Incubator",
};

export default function RegistrationPage() {
  return <Registration />;
}
