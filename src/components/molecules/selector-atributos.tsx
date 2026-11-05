import type { SelectorAtributo } from "@/lib/catalogo/atributos";
import { cn } from "@/lib/utils";

interface SelectorAtributosProps {
  selectores: SelectorAtributo[];
  onElegir: (llave: string, valor: string) => void;
  error?: string;
}

/**
 * Un grupo de opciones por atributo de la variante. Las combinaciones que no
 * existen se ven deshabilitadas con su motivo ("No disponible para Tríptico").
 */
export function SelectorAtributos({ selectores, onElegir, error }: SelectorAtributosProps) {
  return (
    <div className="space-y-4">
      {selectores.map((selector) => (
        <div key={selector.llave} className="space-y-2">
          <p className="text-sm font-medium" id={`atributo-${selector.llave}`}>
            {selector.etiqueta}
          </p>
          <div role="radiogroup" aria-labelledby={`atributo-${selector.llave}`} className="flex flex-wrap gap-2">
            {selector.opciones.map((opcion) => {
              const elegida = selector.elegido === opcion.valor;
              return (
                <button
                  key={opcion.valor}
                  type="button"
                  role="radio"
                  aria-checked={elegida}
                  disabled={!opcion.disponible}
                  title={opcion.motivo ?? undefined}
                  onClick={() => onElegir(selector.llave, opcion.valor)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left text-sm transition-colors outline-none",
                    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    elegida
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-input hover:bg-accent hover:text-accent-foreground",
                    "disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-70",
                  )}
                >
                  <span className="block">{opcion.valor}</span>
                  {opcion.motivo && <span className="block text-xs">{opcion.motivo}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
