"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { SubidaArchivo } from "@/components/molecules/subida-archivo";
import { ApiError } from "@/lib/api-client";
import type { LineaPedido, PublicArchivo, Rechazo } from "@/lib/pedidos-api";
import { useCorregirArchivos } from "@/hooks/use-pedidos";
import { useSubirArchivo } from "@/hooks/use-subir-archivo";

interface CorreccionLineaProps {
  pedidoId: string;
  linea: LineaPedido;
  rechazo: Rechazo;
  /** Nombre del motivo (del catálogo del panel); si no llega, la clave. */
  motivo: string;
  archivos: Record<string, PublicArchivo>;
}

/** Una cara que el cliente puede corregir: sube el archivo y lo manda a la línea. */
function CaraCorregible({
  pedidoId,
  lineaId,
  cara,
  etiqueta,
  actual,
}: {
  pedidoId: string;
  lineaId: string;
  cara: "frente" | "reverso";
  etiqueta: string;
  /** El archivo corregido, si ya se subió en esta ronda. */
  actual: PublicArchivo | null;
}) {
  const corregir = useCorregirArchivos(pedidoId);
  const subida = useSubirArchivo({ onSubido: (archivo) => corregir.mutate({ lineaId, [cara]: archivo.id }) });
  const errorCorreccion = corregir.error
    ? corregir.error instanceof ApiError
      ? (corregir.error.fields?.[cara] ?? corregir.error.message)
      : "No se pudo guardar el archivo"
    : undefined;

  return (
    // min-w-0: el nombre largo del archivo se recorta en lugar de ensanchar la columna (375 px).
    <div className="min-w-0 space-y-2">
      <p className="text-sm font-medium">{etiqueta}</p>
      <SubidaArchivo
        etiqueta={`Subir archivo corregido del ${cara}`}
        archivo={actual}
        subiendo={subida.subiendo ?? (corregir.isPending ? { nombre: "el archivo corregido", progreso: 1 } : null)}
        onElegir={subida.subir}
        onCancelar={subida.cancelar}
        errorSubida={subida.error ?? errorCorreccion}
      />
    </div>
  );
}

/**
 * Corrección de una línea rechazada (SPEC 09): el motivo y el comentario de
 * mostrador, y "Subir archivo corregido" para el frente y, si la línea lo tiene,
 * el reverso de archivo. Solo se cambian archivos: lo demás ya está pagado.
 */
export function CorreccionLinea({ pedidoId, linea, rechazo, motivo, archivos }: CorreccionLineaProps) {
  const { frente, reverso } = linea.archivos;
  // Tras corregir, la cara apunta al archivo nuevo: se muestra en la subida como el elegido.
  const corregido = (archivoId: string | undefined) =>
    rechazo.corregidoEn && archivoId ? (archivos[archivoId] ?? null) : null;

  return (
    <section className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3" aria-label="Corrección">
      <div className="flex items-start gap-2 text-sm">
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <p className="min-w-0 break-words">
          <span className="font-medium">Rechazada: {motivo}.</span> {rechazo.comentario}
        </p>
      </div>
      {rechazo.corregidoEn && (
        <p className="flex items-center gap-2 text-sm text-exito" data-testid="linea-corregida">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          Archivo corregido
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {frente && (
          <CaraCorregible
            pedidoId={pedidoId}
            lineaId={linea.lineaId}
            cara="frente"
            etiqueta="Frente corregido"
            actual={corregido(frente.archivoId)}
          />
        )}
        {reverso?.tipo === "archivo" && (
          <CaraCorregible
            pedidoId={pedidoId}
            lineaId={linea.lineaId}
            cara="reverso"
            etiqueta="Reverso corregido"
            actual={corregido(reverso.archivoId)}
          />
        )}
      </div>
    </section>
  );
}
