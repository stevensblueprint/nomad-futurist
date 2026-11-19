import type { Metadata } from "next";
import AdminUsersForm from "./AdminUsersForm";

export const metadata: Metadata = { title: "Admin Users | Nomad Incubator" };

export default function AdminUsersPage() {
  return <AdminUsersForm />;
}
