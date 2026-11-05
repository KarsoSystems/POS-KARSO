"use client";

import { ArrowLeft, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { FormError } from "@/components/atoms/form-error";
import { AvisoPreciosEjemplo } from "@/components/molecules/aviso-precios-ejemplo";
import { CotizacionLinea } from "@/components/molecules/cotizacion-linea";
import { EspecificacionesLinea } from "@/components/molecules/especificaciones-linea";
import { MedidaVariable } from "@/components/molecules/medida-variable";
import { ResumenPieza } from "@/components/molecules/resumen-pieza";
import { SelectorAtributos } from "@/components/molecules/selector-atributos";
import { SubidaArchivo } from "@/components/molecules/subida-archivo";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Skeleton } from "@/components/atoms/skeleton";
import { useEditorItem, type CampoEditor, type Errores } from "@/hooks/use-editor-item";
import type { Producto } from "@/lib/catalogo/schema";
import { resolverMedida } from "@/lib/pedidos/cotizacion";
import { textoCantidad, textoPrecioVariante, unidadCantidad } from "@/lib/pedidos/formato";
import { DESCRIPCION_MAXIMA } from "@/lib/validation/pedidos";
import { cn } from "@/lib/utils";

const textareaClass =
  "min-h-20 w-full min-w-0 rounded-md border border-border bg-input px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm";

function Campo({
  label,
  error,
  children,
  htmlFor,
  ayuda,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  htmlFor: string;
  ayuda?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-destructive" id={`${htmlFor}-error`}>
          {error}
        </p>
      ) : (
        ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>
      )}
    </div>
  );
}

function Paso({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
            {numero}
          </span>
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

/** Tarjetas de producto agrupadas por categoría, en el orden del catálogo. */
function SelectorProducto({
  productos,
  elegido,
  onElegir,
  error,
}: {
  productos: Producto[];
  elegido: string | null;
  onElegir: (productoId: string) => void;
  error?: string;
}) {
  const categorias = [...new Set(productos.map((p) => p.categoria))];
  return (
    <div className="space-y-4">
      {categorias.map((categoria) => (
        <div key={categoria} className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase" id={`categoria-${categoria}`}>
            {categoria}
          </p>
          <div role="radiogroup" aria-labelledby={`categoria-${categoria}`} className="grid gap-2 sm:grid-cols-2">
            {productos
              .filter((p) => p.categoria === categoria)
              .map((p) => (
                <button
                  key={p._id}
                  type="button"
                  role="radio"
                  aria-checked={elegido === p._id}
                  onClick={() => onElegir(p._id)}
                  className={cn(
                    "flex min-w-0 items-center gap-3 rounded-md border p-2 text-left text-sm transition-colors outline-none",
                    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    elegido === p._id ? "border-primary bg-accent/40" : "border-border bg-input hover:bg-accent/40",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagen del catálogo del panel (local en el mock, CDN en producción) */}
                  <img src={p.imagen} alt="" className="size-12 shrink-0 rounded bg-muted object-cover" />
                  <span className="min-w-0">
                    <span className="block font-medium">{p.nombre}</span>
                    <span className="block truncate text-xs text-muted-foreground">{p.descripcion}</span>
                  </span>
                </button>
              ))}
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function EditorItem({ itemId, productoInicial }: { itemId?: string; productoInicial?: string }) {
  const ids = useId();
  const {
    tienda,
    productos,
    campos,
    producto,
    selectores,
    variante,
    especificaciones,
    archivo,
    errores,
    errorGeneral,
    guardando,
    subida,
    subiendo,
    vivo,
    actualizar,
    elegirProducto,
    elegir,
    guardar,
  } = useEditorItem({ itemId, productoInicial });

  const titulo = itemId ? "Editar ítem" : "Agregar ítem";
  const id = (campo: string) => `${ids}-${campo}`;
  const invalido = (campo: keyof Errores) =>
    errores[campo] ? { "aria-invalid": true, "aria-describedby": `${id(campo)}-error` } : {};
  const cambiar = (cambio: Parameters<typeof actualizar>[0], ...limpiar: CampoEditor[]) => actualizar(cambio, limpiar);

  const variable = variante?.medida.tipo === "variable";
  const linea = vivo?.evaluacion.ok ? vivo.evaluacion.linea : null;
  // La medida de una variante fija se conoce sin capturar nada; la variable, al cotizar.
  const medidaPieza = linea?.medida ?? (variante && !variable ? resolverMedida(variante, null) : null);
  const cantidadNumero = Number(campos?.cantidad.replace(/[\s,]/g, ""));
  const pasoCantidad = variante ? 5 : producto ? 4 : 3;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <Link
          href="/panel/pedidos/nuevo"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Volver al pedido
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      </div>

      <AvisoPreciosEjemplo ejemplo={tienda?.ejemplo} />
      <FormError message={errorGeneral} />

      {!campos && !errorGeneral && (
        <div className="space-y-3" aria-busy="true" aria-label="Cargando">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {tienda && campos && (
        <form onSubmit={guardar} noValidate className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
          <div className="min-w-0 space-y-6">
            <Paso numero={1} titulo="Archivo">
              <SubidaArchivo
                archivo={archivo}
                subiendo={subida.subiendo}
                onElegir={subida.subir}
                onCancelar={subida.cancelar}
                errorSubida={subida.error}
                error={errores.archivoId}
              />
            </Paso>

            <Paso numero={2} titulo="Producto">
              <SelectorProducto
                productos={productos}
                elegido={campos.productoId}
                onElegir={elegirProducto}
                error={errores.productoId}
              />
            </Paso>

            {producto && (
              <Paso numero={3} titulo="Opciones y medida">
                <SelectorAtributos selectores={selectores} onElegir={elegir} error={errores.varianteId} />
                {variante && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">
                      {variante.nombre} · SKU {variante.sku} ·{" "}
                    </span>
                    <span className="font-medium" data-testid="precio-variante">
                      {textoPrecioVariante(variante)}
                    </span>
                  </p>
                )}
                {variante && variable && (
                  <MedidaVariable
                    medida={variante.medida}
                    metroLineal={variante.precioPor === "metro_lineal"}
                    valor={campos.medida}
                    onCambiar={(medida) => cambiar({ medida }, "medida.ancho", "medida.alto")}
                    errores={{ ancho: errores["medida.ancho"], alto: errores["medida.alto"] }}
                  />
                )}
              </Paso>
            )}

            {variante && (
              <Paso numero={4} titulo="Acabados">
                <EspecificacionesLinea
                  especificaciones={especificaciones}
                  elegidas={campos.especificaciones}
                  onCambiar={(elegidas) => cambiar({ especificaciones: elegidas }, "especificaciones")}
                  error={errores.especificaciones}
                />
              </Paso>
            )}

            <Paso numero={pasoCantidad} titulo="Cantidad y descripción">
              <Campo
                label={variante ? `Cantidad (${unidadCantidad(variante.volumen, variante.piezasPorPaquete)})` : "Cantidad"}
                htmlFor={id("cantidad")}
                error={errores.cantidad}
                ayuda={
                  variante && Number.isInteger(cantidadNumero) && cantidadNumero > 0
                    ? textoCantidad(variante.volumen, cantidadNumero, variante.piezasPorPaquete)
                    : undefined
                }
                className="sm:max-w-64"
              >
                <Input
                  id={id("cantidad")}
                  inputMode="numeric"
                  placeholder="Ej. 2"
                  value={campos.cantidad}
                  onChange={(e) => cambiar({ cantidad: e.target.value }, "cantidad")}
                  {...invalido("cantidad")}
                />
              </Campo>
              <Campo label="Descripción (opcional)" htmlFor={id("descripcion")} error={errores.descripcion}>
                <textarea
                  id={id("descripcion")}
                  rows={3}
                  maxLength={DESCRIPCION_MAXIMA}
                  placeholder="Indicaciones para la imprenta"
                  className={textareaClass}
                  value={campos.descripcion}
                  onChange={(e) => cambiar({ descripcion: e.target.value }, "descripcion")}
                  {...invalido("descripcion")}
                />
                <p className="text-right text-xs text-muted-foreground">
                  {campos.descripcion.length}/{DESCRIPCION_MAXIMA}
                </p>
              </Campo>
            </Paso>
          </div>

          <div className="space-y-4 lg:sticky lg:top-4">
            <Card aria-live="polite">
              <CardHeader>
                <CardTitle className="text-base">Cotización</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {variante && medidaPieza && (
                  <ResumenPieza archivo={archivo ?? undefined} medida={medidaPieza} rebase={variante.medida.rebase} />
                )}
                <CotizacionEnVivo vivo={vivo} hayVariante={Boolean(variante)} variable={variable} />
              </CardContent>
            </Card>

            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={guardando || subiendo}>
                {guardando || subiendo ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                {subiendo ? "Subiendo archivo…" : "Guardar ítem"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/panel/pedidos/nuevo">Cancelar</Link>
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

function CotizacionEnVivo({
  vivo,
  hayVariante,
  variable,
}: {
  vivo: ReturnType<typeof useEditorItem>["vivo"];
  hayVariante: boolean;
  variable: boolean;
}) {
  if (!hayVariante) {
    return <p className="text-sm text-muted-foreground">Elige el producto y sus opciones para ver la cotización.</p>;
  }
  if (!vivo) {
    return <p className="text-sm text-muted-foreground">{variable ? "Captura la medida para cotizar." : "Calculando…"}</p>;
  }
  if (!vivo.evaluacion.ok) {
    return <p className="text-sm text-destructive">{vivo.evaluacion.mensaje}</p>;
  }
  const { linea } = vivo.evaluacion;
  return (
    <div className="space-y-2">
      <CotizacionLinea
        cotizacion={linea}
        cantidad={linea.cantidad}
        volumen={linea.volumen}
        piezasPorPaquete={linea.piezasPorPaquete}
      />
      <p className="text-xs text-muted-foreground">
        {vivo.cantidadValida
          ? "Precios sin IVA. Si requieres factura, se suma al pagar."
          : "Escribe la cantidad; mientras, se cotiza la mínima."}
      </p>
    </div>
  );
}
