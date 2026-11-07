import { AlertTriangle, CalendarDays, Type } from "lucide-react";
import { EstadoBadge } from "@/components/atoms/estado-badge";
import { AdvertenciasArchivo } from "@/components/molecules/advertencias-archivo";
import { CotizacionLinea } from "@/components/molecules/cotizacion-linea";
import { InsigniaRechazo } from "@/components/molecules/insignia-rechazo";
import { MiniaturaArchivo } from "@/components/molecules/miniatura-archivo";
import { etiquetaAtributo } from "@/lib/catalogo/atributos";
import { formatearDia, textoMedida, textoReverso } from "@/lib/pedidos/formato";
import type { LineaPedido, PublicArchivo } from "@/lib/pedidos-api";
import { cn } from "@/lib/utils";

interface ItemResumenProps {
  linea: LineaPedido;
  /** Datos públicos de los archivos del pedido, por id (de la respuesta del pedido). */
  archivos: Record<string, PublicArchivo>;
  /** Botones (editar, quitar) en la esquina. */
  acciones?: React.ReactNode;
  /** Contenido extra debajo. */
  children?: React.ReactNode;
  className?: string;
}

/** Una cara de la línea: miniatura y nombre del archivo, o el calendario o texto del reverso. */
function Cara({
  etiqueta,
  cara,
  archivos,
  conMiniatura = true,
}: {
  etiqueta: string;
  cara: LineaPedido["archivos"]["reverso"];
  archivos: Record<string, PublicArchivo>;
  /** El frente ya tiene su miniatura junto al nombre del producto. */
  conMiniatura?: boolean;
}) {
  if (!cara) return null;
  if (cara.tipo === "calendario" || cara.tipo === "texto") {
    const Icono = cara.tipo === "calendario" ? CalendarDays : Type;
    return (
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted">
          <Icono className="size-4 text-muted-foreground" aria-hidden />
        </span>
        <p className="min-w-0 break-words">
          <span className="text-muted-foreground">{etiqueta}: </span>
          {textoReverso(cara)}
        </p>
      </div>
    );
  }
  const archivo = archivos[cara.archivoId];
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      {conMiniatura && <MiniaturaArchivo archivo={archivo} className="size-10" />}
      <p className="min-w-0 truncate" title={cara.nombreOriginal}>
        <span className="text-muted-foreground">{etiqueta}: </span>
        {cara.nombreOriginal}
      </p>
    </div>
  );
}

/**
 * Una línea del pedido: frente y reverso, producto y variante con atributos y SKU,
 * medida, las advertencias de sus archivos ("Podría ser rechazado") y el desglose
 * de KARSO 5.4 (base + acabados = importe unitario × cantidad = subtotal).
 */
export function ItemResumen({ linea, archivos, acciones, children, className }: ItemResumenProps) {
  const { frente, reverso } = linea.archivos;
  const conArchivo = reverso?.tipo === "archivo" ? reverso : null;
  const advertencias = [
    ...(frente?.advertencias ?? []).map((a) => ({ mensaje: conArchivo ? `Frente: ${a.mensaje}` : a.mensaje })),
    ...(conArchivo?.advertencias ?? []).map((a) => ({ mensaje: `Reverso: ${a.mensaje}` })),
  ];
  const archivoFrente = frente ? archivos[frente.archivoId] : undefined;

  return (
    <li
      className={cn("space-y-3 rounded-lg border bg-card p-4", className)}
      aria-label={`${linea.nombre}: ${frente?.nombreOriginal ?? ""}`}
    >
      <div className="flex gap-3">
        <MiniaturaArchivo archivo={archivoFrente} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="font-medium">
                {linea.nombre} · {linea.variante}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {/* Estatus de producción de la línea (KARSO 5.8), desde que se valida el pedido. */}
                {linea.estatus && <EstadoBadge estatus={linea.estatus} />}
                <InsigniaRechazo visible={advertencias.length > 0} />
              </div>
              {linea.fechaEntregaEstimada && (
                <p className="text-sm text-muted-foreground" data-testid="disponible-linea">
                  Lista a partir del {formatearDia(linea.fechaEntregaEstimada)}
                </p>
              )}
            </div>
            {acciones && <div className="flex shrink-0 gap-1">{acciones}</div>}
          </div>
          <p className="text-sm text-muted-foreground">
            {Object.entries(linea.atributos)
              .map(([llave, valor]) => `${etiquetaAtributo(llave)}: ${valor}`)
              .join(" · ")}
          </p>
          <p className="text-sm">
            {textoMedida(linea.medida)} · <span className="text-muted-foreground">SKU {linea.sku}</span>
          </p>
          {linea.descripcion && <p className="text-sm break-words text-muted-foreground">{linea.descripcion}</p>}
        </div>
      </div>

      <div className="grid gap-2 border-t pt-3 sm:grid-cols-2">
        {frente ? (
          <Cara etiqueta="Frente" cara={{ tipo: "archivo", ...frente }} archivos={archivos} conMiniatura={false} />
        ) : (
          <p className="text-sm text-muted-foreground">Frente: archivo no disponible</p>
        )}
        <Cara etiqueta="Reverso" cara={reverso} archivos={archivos} />
      </div>

      <AdvertenciasArchivo advertencias={advertencias} />

      <CotizacionLinea
        cotizacion={linea}
        cantidad={linea.cantidad}
        volumen={linea.volumen}
        piezasPorPaquete={linea.piezasPorPaquete}
        className="border-t pt-3"
      />

      {linea.problema && (
        <p className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {linea.problema}. Edita el ítem para corregirlo.
        </p>
      )}

      {children}
    </li>
  );
}
