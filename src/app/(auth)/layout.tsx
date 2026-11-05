import { AuthTemplate } from "@/components/templates/auth-template";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthTemplate>{children}</AuthTemplate>;
}
