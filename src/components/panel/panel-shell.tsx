"use client";

import { Loader2, LogOut, Menu, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { PanelNav } from "@/components/panel/panel-nav";
import { PanelUserProvider } from "@/components/panel/panel-user";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { authApi, type PublicUser } from "@/lib/auth-api";

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

export function PanelShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    authApi
      .me()
      .then(({ user }) => setUser(user))
      .catch(irALogin);
  }, []);

  async function cerrarSesion() {
    setSaliendo(true);
    try {
      await authApi.logout();
    } finally {
      irALogin();
    }
  }

  const nombreCompleto = user ? [user.nombre, user.apellidoPaterno].filter(Boolean).join(" ") : "";

  return (
    <PanelUserProvider value={user}>
      <div className="flex min-h-dvh bg-muted/40">
        {/* Menú lateral fijo desde 768 px */}
        <aside className="hidden w-72 shrink-0 flex-col gap-6 border-r bg-background p-4 md:flex">
          <Marca />
          <PanelNav />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center gap-2 border-b bg-background px-4">
            {/* Debajo de 768 px el menú vive en un drawer */}
            <Sheet open={menuAbierto} onOpenChange={setMenuAbierto}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menú">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 gap-6 p-4">
                <SheetHeader className="p-0">
                  <SheetTitle asChild>
                    <div>
                      <Marca />
                    </div>
                  </SheetTitle>
                  <SheetDescription className="sr-only">Navegación del panel</SheetDescription>
                </SheetHeader>
                <PanelNav onNavigate={() => setMenuAbierto(false)} />
              </SheetContent>
            </Sheet>

            <div className="md:hidden">
              <Marca />
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-3">
              {nombreCompleto && (
                <span className="hidden truncate text-sm text-muted-foreground sm:inline">{nombreCompleto}</span>
              )}
              <Button variant="outline" size="sm" onClick={cerrarSesion} disabled={saliendo}>
                {saliendo ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
                <span className="sr-only sm:not-sr-only">Cerrar sesión</span>
              </Button>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>
    </PanelUserProvider>
  );
}
