import type { Metadata } from "next";
import { siguienteSeguro } from "@/lib/auth-routes";
import { CompletarPerfilForm } from "@/components/organisms/completar-perfil-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card";

export const metadata: Metadata = { title: "Completa tu perfil" };

export default async function CompletarPerfilPage({ searchParams }: { searchParams: Promise<{ siguiente?: string }> }) {
  // A dónde volver al terminar (p. ej. el pedido del QR): solo rutas internas del panel.
  const siguiente = siguienteSeguro((await searchParams).siguiente);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Completa tu perfil</CardTitle>
        <CardDescription>Necesitamos estos datos para tus pedidos y envíos.</CardDescription>
      </CardHeader>
      <CardContent>
        <CompletarPerfilForm siguiente={siguiente} />
      </CardContent>
    </Card>
  );
}
