"use client";

import { Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { MiniaturaArchivo } from "@/components/pedidos/miniatura-archivo";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { ACCEPT_ARCHIVOS } from "@/lib/validation/pedidos";
import { subirArchivo, type PublicArchivo } from "@/lib/pedidos-api";
import { cn } from "@/lib/utils";

interface SubidaArchivoProps {
  archivo: PublicArchivo | null;
  onSubido: (archivo: PublicArchivo) => void;
  /** Avisa cuando empieza y termina una subida (p. ej. para no guardar a medias). */
  onSubiendoChange?: (subiendo: boolean) => void;
  error?: string;
}

const formatoBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Paso 1 del editor: arrastrar o elegir un archivo, con barra de progreso. */
export function SubidaArchivo({ archivo, onSubido, onSubiendoChange, error }: SubidaArchivoProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const subidaRef = useRef<AbortController | null>(null);
  const [subiendo, setSubiendo] = useState<{ nombre: string; avance: number } | null>(null);
  const [errorSubida, setErrorSubida] = useState<string>();
  const [arrastrando, setArrastrando] = useState(false);

  // Si se sale del editor a media subida, se cancela.
  useEffect(() => () => subidaRef.current?.abort(), []);

  const haySubida = subiendo !== null;
  useEffect(() => onSubiendoChange?.(haySubida), [haySubida, onSubiendoChange]);

  async function subir(file: File) {
    subidaRef.current?.abort();
    const controller = new AbortController();
    subidaRef.current = controller;
    setErrorSubida(undefined);
    setSubiendo({ nombre: file.name, avance: 0 });
    try {
      const { archivo } = await subirArchivo(file, {
        signal: controller.signal,
        onProgress: (avance) => setSubiendo({ nombre: file.name, avance }),
      });
      onSubido(archivo);
    } catch (e) {
      if (e instanceof ApiError && e.code === "CANCELADO") return;
      setErrorSubida(e instanceof ApiError ? e.message : "No se pudo subir el archivo");
    } finally {
      if (subidaRef.current === controller) {
        subidaRef.current = null;
        setSubiendo(null);
      }
    }
  }

  function elegir(files: FileList | null) {
    const file = files?.[0];
    if (file) void subir(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  const mensaje = errorSubida ?? error;

  return (
    <div className="space-y-3">
      {archivo && !subiendo && (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
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
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">Subiendo {subiendo.nombre}…</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Cancelar subida"
              onClick={() => subidaRef.current?.abort()}
            >
              <X aria-hidden />
            </Button>
          </div>
          <div
            role="progressbar"
            aria-label="Avance de la subida"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(subiendo.avance * 100)}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary transition-[width]" style={{ width: `${subiendo.avance * 100}%` }} />
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
