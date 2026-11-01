"use client";

import { ChevronRight, Package, UserRound } from "lucide-react";
import Link from "next/link";
import { usePanelUser } from "@/components/panel/panel-user";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const PROXIMAMENTE = [
  {
    icon: UserRound,
    titulo: "Mi perfil",
    texto: "Edita tus datos y agrega direcciones de envío e información de pago.",
  },
];

export function PanelInicio() {
  const user = usePanelUser();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section className="space-y-2">
        {user ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Hola, {user.nombre}</h1>
            <p className="text-muted-foreground">
              Tu número de cliente:{" "}
              <span className="font-mono font-medium text-foreground">{user.idCliente}</span>
            </p>
          </>
        ) : (
          <div className="space-y-3" aria-busy="true" aria-label="Cargando">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-5 w-64" />
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/panel/pedidos"
          className="group rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Card className="h-full transition-colors group-hover:border-foreground/20 group-hover:bg-accent/40">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="size-4" aria-hidden />
                  Mis pedidos
                </CardTitle>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </div>
              <CardDescription>Sube tus archivos, elige tamaño y cantidad, y recibe tu presupuesto.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        {PROXIMAMENTE.map(({ icon: Icon, titulo, texto }) => (
          <Card key={titulo} className="opacity-80">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="size-4" aria-hidden />
                  {titulo}
                </CardTitle>
                <Badge variant="secondary">Próximamente</Badge>
              </div>
              <CardDescription>{texto}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
    </div>
  );
}
