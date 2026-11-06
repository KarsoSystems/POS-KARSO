"use client";

import { useId, type ReactNode } from "react";
import type { ReversoElegido } from "@/lib/archivos";
import { TEXTO_REVERSO_MAXIMO } from "@/lib/validation/pedidos";
import { cn } from "@/lib/utils";

interface SelectorReversoProps {
  /** `caras.reverso` de la variante; con `no_aplica` el selector no se muestra. */
  cara: "opcional" | "obligatorio";
  valor: ReversoElegido | null;
  onCambiar: (valor: ReversoElegido) => void;
  /** Año actual y siguiente (zona America/Monterrey). */
  anios: [number, number];
  /** La zona de subida del archivo del reverso; se muestra con "Mi archivo". */
  subida: ReactNode;
  error?: string;
}

const OPCIONES = [
  { tipo: "ninguno", etiqueta: "Sin reverso" },
  { tipo: "archivo", etiqueta: "Mi archivo" },
  { tipo: "calendario", etiqueta: "Calendario" },
  { tipo: "texto", etiqueta: "Texto" },
] as const;

const opcionClass = (elegida: boolean) =>
  cn(
    "rounded-md border px-3 py-2 text-left text-sm transition-colors outline-none",
    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
    elegida
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-input hover:bg-accent hover:text-accent-foreground",
  );

const textareaClass =
  "min-h-20 w-full min-w-0 rounded-md border border-border bg-input px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm";

/**
 * Reverso de la línea según `caras.reverso`: el archivo del cliente, o un
 * calendario o un texto que la imprenta diseña en la misma pasada de la máquina,
 * sin costo extra. Con `opcional` se puede dejar sin reverso.
 */
export function SelectorReverso({ cara, valor, onCambiar, anios, subida, error }: SelectorReversoProps) {
  const id = useId();
  const opciones = cara === "opcional" ? OPCIONES : OPCIONES.filter((o) => o.tipo !== "ninguno");

  function elegir(tipo: ReversoElegido["tipo"]) {
    if (valor?.tipo === tipo) return;
    if (tipo === "calendario") onCambiar({ tipo, anio: anios[0] });
    else if (tipo === "texto") onCambiar({ tipo, texto: "" });
    else onCambiar({ tipo });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-sm font-medium" id={`${id}-reverso`}>
          Reverso{cara === "obligatorio" && <span className="text-muted-foreground"> (obligatorio)</span>}
        </p>
        <div
          role="radiogroup"
          aria-labelledby={`${id}-reverso`}
          aria-invalid={error ? true : undefined}
          className="flex flex-wrap gap-2"
        >
          {opciones.map((opcion) => (
            <button
              key={opcion.tipo}
              type="button"
              role="radio"
              aria-checked={valor?.tipo === opcion.tipo}
              onClick={() => elegir(opcion.tipo)}
              className={opcionClass(valor?.tipo === opcion.tipo)}
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {valor?.tipo === "archivo" && subida}

      {valor?.tipo === "calendario" && (
        <div className="space-y-2">
          <p className="text-sm font-medium" id={`${id}-anio`}>
            Año del calendario
          </p>
          <div role="radiogroup" aria-labelledby={`${id}-anio`} className="flex flex-wrap gap-2">
            {anios.map((anio) => (
              <button
                key={anio}
                type="button"
                role="radio"
                aria-checked={valor.anio === anio}
                onClick={() => onCambiar({ tipo: "calendario", anio })}
                className={opcionClass(valor.anio === anio)}
              >
                {anio}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">La imprenta diseña el calendario; no tiene costo extra.</p>
        </div>
      )}

      {valor?.tipo === "texto" && (
        <div className="space-y-2">
          <label htmlFor={`${id}-texto`} className="text-sm font-medium">
            Texto del reverso
          </label>
          <textarea
            id={`${id}-texto`}
            rows={4}
            maxLength={TEXTO_REVERSO_MAXIMO}
            placeholder="Ej. una oración, tus datos de contacto o un mensaje"
            className={textareaClass}
            value={valor.texto}
            onChange={(e) => onCambiar({ tipo: "texto", texto: e.target.value })}
            aria-invalid={error ? true : undefined}
          />
          <div className="flex justify-between gap-2 text-xs text-muted-foreground">
            <span>La imprenta acomoda el texto en el diseño; no tiene costo extra.</span>
            <span className="shrink-0">
              {valor.texto.length}/{TEXTO_REVERSO_MAXIMO}
            </span>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
