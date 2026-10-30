import type { Metadata } from "next";
import { VerificarWhatsappForm } from "@/components/auth/verificar-whatsapp-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Verifica tu WhatsApp" };

export default function VerificarPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Verifica tu WhatsApp</CardTitle>
        <CardDescription>Último paso para activar tu cuenta.</CardDescription>
      </CardHeader>
      <CardContent>
        <VerificarWhatsappForm />
      </CardContent>
    </Card>
  );
}
