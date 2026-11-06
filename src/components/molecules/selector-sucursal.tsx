import { MapPin } from "lucide-react";
import type { Sucursal } from "@/lib/sucursales/schema";
import { cn } from "@/lib/utils";

interface SelectorSucursalProps {
  sucursales: Sucursal[];
  elegida: string | null;
  onElegir: (sucursalId: string) => void;
  deshabilitado?: boolean;
  error?: string;
}

/** Dónde recoge el cliente (no hay entrega a domicilio): una tarjeta por sucursal activa. */
export function SelectorSucursal({ sucursales, elegida, onElegir, deshabilitado, error }: SelectorSucursalProps) {
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Sucursal de entrega" aria-invalid={error ? true : undefined} className="grid gap-2">
        {sucursales.map((sucursal) => {
          const activa = sucursal._id === elegida;
          const { calle, colonia, ciudad } = sucursal.direccion;
          return (
            <button
              key={sucursal._id}
              type="button"
              role="radio"
              aria-checked={activa}
              disabled={deshabilitado}
              onClick={() => onElegir(sucursal._id)}
              className={cn(
                "flex min-w-0 gap-2 rounded-md border p-3 text-left text-sm transition-colors outline-none",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60",
                activa ? "border-primary bg-accent/40" : "border-border bg-input hover:bg-accent/40",
              )}
            >
              <MapPin className={cn("mt-0.5 size-4 shrink-0", activa ? "text-primary" : "text-muted-foreground")} aria-hidden />
              <span className="min-w-0 space-y-0.5">
                <span className="block font-medium">{sucursal.nombre}</span>
                <span className="block text-muted-foreground">
                  {calle}, {colonia}, {ciudad}
                </span>
                <span className="block text-xs text-muted-foreground">{sucursal.horario}</span>
                <span className="block text-xs text-muted-foreground">Tel. {sucursal.telefono}</span>
              </span>
            </button>
          );
        })}
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
