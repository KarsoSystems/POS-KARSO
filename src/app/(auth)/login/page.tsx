import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { AuthDivider, GoogleMockDialog } from "@/components/auth/google-mock-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Iniciar sesión</CardTitle>
        <CardDescription>Entra para ver tus pedidos de impresión.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GoogleMockDialog />
        <AuthDivider />
        <LoginForm />
      </CardContent>
    </Card>
  );
}
