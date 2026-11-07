import type { Metadata } from "next";
import { siguienteSeguro } from "@/lib/auth-routes";
import { RegistroForm } from "@/components/organisms/registro-form";
import { AuthDivider, GoogleMockDialog } from "@/components/organisms/google-mock-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function RegistroPage({ searchParams }: { searchParams: Promise<{ siguiente?: string }> }) {
  // A dónde volver al terminar (p. ej. el pedido del QR): solo rutas internas del panel.
  const siguiente = siguienteSeguro((await searchParams).siguiente);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Crear cuenta</CardTitle>
        <CardDescription>Regístrate para mandar tus archivos a imprimir sin ir al local.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GoogleMockDialog siguiente={siguiente} />
        <AuthDivider />
        <RegistroForm siguiente={siguiente} />
      </CardContent>
    </Card>
  );
}
