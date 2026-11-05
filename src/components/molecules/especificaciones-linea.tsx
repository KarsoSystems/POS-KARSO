import type { Especificacion } from "@/lib/catalogo/schema";

interface EspecificacionesLineaProps {
  /** Solo las que aplican a la variante elegida. */
  especificaciones: Especificacion[];
  elegidas: number[];
  onCambiar: (elegidas: number[]) => void;
  error?: string;
}

/** Acabados de la línea como casillas, con su precio en texto ("+$40.00 por millar"). */
export function EspecificacionesLinea({ especificaciones, elegidas, onCambiar, error }: EspecificacionesLineaProps) {
  if (especificaciones.length === 0) {
    return <p className="text-sm text-muted-foreground">Este producto no lleva acabados adicionales.</p>;
  }
  const alternar = (id: number, marcada: boolean) =>
    onCambiar(marcada ? [...elegidas, id] : elegidas.filter((e) => e !== id));

  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">Acabados</legend>
      {especificaciones.map((e) => (
        <label
          key={e.id}
          className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-input px-3 py-2 text-sm has-[:checked]:border-primary"
        >
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={elegidas.includes(e.id)}
            onChange={(ev) => alternar(e.id, ev.target.checked)}
          />
          <span className="flex-1 font-medium">{e.nombre}</span>
          <span className="text-muted-foreground tabular-nums">{e.precioTexto}</span>
        </label>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}
