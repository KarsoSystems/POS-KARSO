import type { Metadata } from "next";
import { RegistroForm } from "@/components/organisms/registro-form";
import { AuthDivider, GoogleMockDialog } from "@/components/organisms/google-mock-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegistroPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Crear cuenta</CardTitle>
        <CardDescription>Regístrate para mandar tus archivos a imprimir sin ir al local.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GoogleMockDialog />
        <AuthDivider />
        <RegistroForm />
      </CardContent>
    </Card>
  );
}
