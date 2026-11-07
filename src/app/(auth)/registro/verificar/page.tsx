import type { Metadata } from "next";
import { siguienteSeguro } from "@/lib/auth-routes";
import { VerificarWhatsappForm } from "@/components/organisms/verificar-whatsapp-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card";

export const metadata: Metadata = { title: "Verifica tu WhatsApp" };

export default async function VerificarPage({ searchParams }: { searchParams: Promise<{ siguiente?: string }> }) {
  // A dónde volver al terminar (p. ej. el pedido del QR): solo rutas internas del panel.
  const siguiente = siguienteSeguro((await searchParams).siguiente);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Verifica tu WhatsApp</CardTitle>
        <CardDescription>Último paso para activar tu cuenta.</CardDescription>
      </CardHeader>
      <CardContent>
        <VerificarWhatsappForm siguiente={siguiente} />
      </CardContent>
    </Card>
  );
}
