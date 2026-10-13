import type { Metadata } from "next";
import Registration from "../registration/Registration";

export const metadata: Metadata = {
  title: "Register Your Project | Nomad Incubator",
};

export default function RegisterProjectPage() {
  return <Registration />;
}
