"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/atoms/button";
import { cn } from "@/lib/utils";

/** Alterna entre tema oscuro y claro; next-themes lo guarda en localStorage (`tema`). */
export function SelectorTema({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // El tema guardado solo se conoce en el navegador: antes de montar se pinta neutro.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const oscuro = !montado || resolvedTheme !== "light";
  const destino = oscuro ? "claro" : "oscuro";

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("justify-start gap-3", className)}
      onClick={() => setTheme(oscuro ? "light" : "dark")}
      aria-label={`Cambiar a tema ${destino}`}
      disabled={!montado}
    >
      {oscuro ? <Sun aria-hidden /> : <Moon aria-hidden />}
      <span>Tema {destino}</span>
    </Button>
  );
}
