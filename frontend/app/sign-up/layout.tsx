import PublicOnly from "../components/PublicOnly";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PublicOnly>{children}</PublicOnly>;
}