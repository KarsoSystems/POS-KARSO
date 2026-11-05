"use client";

import { Loader2, LogOut, Menu, Printer } from "lucide-react";
import { useState } from "react";
import { PanelNav } from "@/components/molecules/panel-nav";
import { PanelUserProvider } from "@/components/molecules/panel-user";
import { SelectorTema } from "@/components/molecules/selector-tema";
import { Button } from "@/components/atoms/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/atoms/sheet";
import { useLogout, useSesion } from "@/hooks/use-auth";

function Marca() {
  return (
    <div className="flex items-center gap-2 font-semibold">
      <Printer className="size-5" aria-hidden />
      Portal de clientes
    </div>
  );
}

// Navegación completa (no del router): limpia el estado del cliente y la
// caché del router, así "atrás" no puede mostrar el panel tras cerrar sesión.
const irALogin = () => window.location.replace("/login");

export function PanelTemplate({ children }: { children: React.ReactNode }) {
  const { data } = useSesion({ alFallar: irALogin });
  const user = data ?? null;
  const logout = useLogout();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  async function cerrarSesion() {
    setSaliendo(true);
    try {
      await logout.mutateAsync();
    } finally {
      irALogin();
    }
  }

  const nombreCompleto = user ? [user.nombre, user.apellidoPaterno].filter(Boolean).join(" ") : "";

  return (
    <PanelUserProvider value={user}>
      <div className="flex min-h-dvh bg-background">
        {/* Menú lateral fijo desde 768 px */}
        <aside className="hidden w-72 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground md:flex">
          <Marca />
          <PanelNav />
          <SelectorTema className="mt-auto" />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col bg-fondo-degradado">
          <header className="flex h-14 items-center gap-2 border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground">
            {/* Debajo de 768 px el menú vive en un drawer */}
            <Sheet open={menuAbierto} onOpenChange={setMenuAbierto}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menú">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 gap-6 border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
                <SheetHeader className="p-0">
                  <SheetTitle asChild>
                    <div>
                      <Marca />
                    </div>
                  </SheetTitle>
                  <SheetDescription className="sr-only">Navegación del panel</SheetDescription>
                </SheetHeader>
                <PanelNav onNavigate={() => setMenuAbierto(false)} />
                <SelectorTema className="mt-auto" />
              </SheetContent>
            </Sheet>

            <div className="md:hidden">
              <Marca />
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-3">
              {nombreCompleto && (
                <span className="hidden truncate text-sm font-medium text-acento-texto sm:inline">{nombreCompleto}</span>
              )}
              <Button variant="outline" size="sm" onClick={cerrarSesion} disabled={saliendo}>
                {saliendo ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
                <span className="sr-only sm:not-sr-only">Cerrar sesión</span>
              </Button>
            </div>
          </header>

          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </PanelUserProvider>
  );
}
