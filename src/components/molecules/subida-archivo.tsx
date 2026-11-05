"use client";

import { Upload, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { MiniaturaArchivo } from "@/components/molecules/miniatura-archivo";
import { Button } from "@/components/atoms/button";
import { ACCEPT_ARCHIVOS } from "@/lib/validation/pedidos";
import type { SubidaEnCurso } from "@/lib/archivos";
import type { PublicArchivo } from "@/lib/pedidos-api";
import { cn } from "@/lib/utils";

interface SubidaArchivoProps {
  archivo: PublicArchivo | null;
  /** Subida en curso, o null si no hay ninguna. */
  subiendo: SubidaEnCurso | null;
  onElegir: (file: File) => void;
  onCancelar: () => void;
  /** Error de la subida. */
  errorSubida?: string;
  /** Error de validación del formulario. */
  error?: string;
}

const formatoBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Paso 1 del editor: arrastrar o elegir un archivo, con barra de progreso. */
export function SubidaArchivo({ archivo, subiendo, onElegir, onCancelar, errorSubida, error }: SubidaArchivoProps) {
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
            <p className="text-sm text-muted-foreground">
              {archivo.extension.toUpperCase()} · {formatoBytes(archivo.bytes)}
            </p>
          </div>
        </div>
      )}

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
          <span className="text-xs text-muted-foreground">JPG, PNG, PDF, AI o PSD · hasta 50 MB</span>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT_ARCHIVOS}
            className="sr-only"
            aria-label="Archivo"
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
