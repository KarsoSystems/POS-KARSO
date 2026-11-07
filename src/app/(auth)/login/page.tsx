import type { Metadata } from "next";
import { siguienteSeguro } from "@/lib/auth-routes";
import { LoginForm } from "@/components/organisms/login-form";
import { AuthDivider, GoogleMockDialog } from "@/components/organisms/google-mock-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ siguiente?: string }> }) {
  // A dónde volver al terminar (p. ej. el pedido del QR): solo rutas internas del panel.
  const siguiente = siguienteSeguro((await searchParams).siguiente);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Iniciar sesión</CardTitle>
        <CardDescription>Entra para ver tus pedidos de impresión.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GoogleMockDialog siguiente={siguiente} />
        <AuthDivider />
        <LoginForm siguiente={siguiente} />
      </CardContent>
    </Card>
  );
}
