import type { Metadata } from "next";
import { CompletarPerfilForm } from "@/components/auth/completar-perfil-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Completa tu perfil" };

export default function CompletarPerfilPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Completa tu perfil</CardTitle>
        <CardDescription>Necesitamos estos datos para tus pedidos y envíos.</CardDescription>
      </CardHeader>
      <CardContent>
        <CompletarPerfilForm />
      </CardContent>
    </Card>
  );
}
