"use client";

import { Upload, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { AdvertenciasArchivo } from "@/components/molecules/advertencias-archivo";
import { MiniaturaArchivo } from "@/components/molecules/miniatura-archivo";
import { Button } from "@/components/atoms/button";
import type { SubidaEnCurso } from "@/lib/archivos";
import type { Advertencia } from "@/lib/pedidos/archivo-linea";
import { textoDatosArchivo } from "@/lib/pedidos/formato";
import { ACCEPT_ARCHIVOS, EXTENSIONES_PERMITIDAS } from "@/lib/validation/pedidos";
import type { PublicArchivo } from "@/lib/pedidos-api";
import { cn } from "@/lib/utils";

interface SubidaArchivoProps {
  /** Nombre accesible del campo, p. ej. "Archivo del frente". */
  etiqueta?: string;
  archivo: PublicArchivo | null;
  /** Advertencias del archivo contra las reglas de la variante elegida (en vivo). */
  advertencias?: Advertencia[];
  /** Subida en curso, o null si no hay ninguna. */
  subiendo: SubidaEnCurso | null;
  onElegir: (file: File) => void;
  onCancelar: () => void;
  /** Error de la subida. */
  errorSubida?: string;
  /** Error de validación del formulario. */
  error?: string;
}

/** "JPG, JPEG, TIFF, PDF, AI, EPS o SVG". */
const FORMATOS = (() => {
  const nombres = EXTENSIONES_PERMITIDAS.map((ext) => ext.toUpperCase());
  return `${nombres.slice(0, -1).join(", ")} o ${nombres.at(-1)}`;
})();

/** Una cara del archivo en el editor: arrastrar o elegir, con barra de progreso, sus datos y advertencias. */
export function SubidaArchivo({
  etiqueta = "Archivo",
  archivo,
  advertencias = [],
  subiendo,
  onElegir,
  onCancelar,
  errorSubida,
  error,
}: SubidaArchivoProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);

  function elegir(files: FileList | null) {
    const file = files?.[0];
    if (file) onElegir(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  const mensaje = errorSubida ?? error;

  return (
    <div className="space-y-3">
      {archivo && !subiendo && (
        <div className="flex items-center gap-3 rounded-lg border-2 border-dashed bg-card p-3">
          <MiniaturaArchivo archivo={archivo} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium" title={archivo.nombreOriginal}>
              {archivo.nombreOriginal}
            </p>
            <p className="text-sm text-muted-foreground">{textoDatosArchivo(archivo)}</p>
          </div>
        </div>
      )}
      {archivo && !subiendo && <AdvertenciasArchivo advertencias={advertencias} />}

      {subiendo ? (
        <div className="space-y-2 rounded-lg border-2 border-dashed bg-card p-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">Subiendo {subiendo.nombre}…</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Cancelar subida"
              onClick={onCancelar}
            >
              <X aria-hidden />
            </Button>
          </div>
          <div
            role="progressbar"
            aria-label="Avance de la subida"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(subiendo.progreso * 100)}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary transition-[width]" style={{ width: `${subiendo.progreso * 100}%` }} />
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            elegir(e.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:bg-accent/40",
            "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
            arrastrando && "border-primary bg-accent/40",
            mensaje && "border-destructive",
          )}
        >
          <Upload className="size-6 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">
            {archivo ? "Cambiar archivo" : "Arrastra tu archivo aquí o haz clic para elegirlo"}
          </span>
          <span className="text-xs text-muted-foreground">{FORMATOS} · hasta 40 MB</span>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT_ARCHIVOS}
            className="sr-only"
            aria-label={etiqueta}
            aria-invalid={mensaje ? true : undefined}
            onChange={(e) => elegir(e.target.files)}
          />
        </label>
      )}

      {mensaje && (
        <p className="text-sm text-destructive" role="alert">
          {mensaje}
        </p>
      )}
    </div>
  );
}
