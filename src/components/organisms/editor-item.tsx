"use client";

import { ArrowLeft, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { FormError } from "@/components/atoms/form-error";
import { AvisoPreciosEjemplo } from "@/components/molecules/aviso-precios-ejemplo";
import { SubidaArchivo } from "@/components/molecules/subida-archivo";
import { VistaPreviaHoja } from "@/components/molecules/vista-previa-hoja";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Skeleton } from "@/components/atoms/skeleton";
import { PERSONALIZADO, useEditorItem, type Errores, type Vivo } from "@/hooks/use-editor-item";
import { calcularAcomodo } from "@/lib/pedidos/acomodo";
import { formatearCm, formatearMxn, formatearNumero } from "@/lib/pedidos/formato";
import { DESCRIPCION_MAXIMA } from "@/lib/validation/pedidos";
import type { Catalogo } from "@/lib/pedidos-api";
import { cn } from "@/lib/utils";

const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-border bg-input px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm";

function Campo({
  label,
  error,
  children,
  htmlFor,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  htmlFor: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && (
        <p className="text-sm text-destructive" id={`${htmlFor}-error`}>
          {error}
        </p>
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

export function EditorItem({ itemId }: { itemId?: string }) {
  const ids = useId();
  const {
    catalogo,
    campos,
    producto,
    archivo,
    errores,
    errorGeneral,
    guardando,
    subida,
    subiendo,
    vivo,
    noCabe,
    hojaElegida,
    cambiar,
    cambiarProducto,
    guardar,
  } = useEditorItem(itemId);

  const titulo = itemId ? "Editar ítem" : "Agregar ítem";
  const id = (campo: string) => `${ids}-${campo}`;
  const invalido = (campo: keyof Errores) =>
    errores[campo] ? { "aria-invalid": true, "aria-describedby": `${id(campo)}-error` } : {};

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

      <AvisoPreciosEjemplo ejemplo={catalogo?.ejemplo} />
      <FormError message={errorGeneral} />

      {!campos && !errorGeneral && (
        <div className="space-y-3" aria-busy="true" aria-label="Cargando">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {catalogo && campos && (
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

            <Paso numero={2} titulo="Producto, tamaño, papel y hoja">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo label="Producto" htmlFor={id("productoId")} error={errores.productoId}>
                  <select
                    id={id("productoId")}
                    className={selectClass}
                    value={campos.productoId}
                    onChange={(e) => cambiarProducto(e.target.value)}
                    {...invalido("productoId")}
                  >
                    {catalogo.productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </Campo>

                <Campo label="Tamaño" htmlFor={id("tamanoId")} error={errores.tamanoId}>
                  <select
                    id={id("tamanoId")}
                    className={selectClass}
                    value={campos.tamanoId}
                    onChange={(e) => cambiar("tamanoId", e.target.value)}
                    {...invalido("tamanoId")}
                  >
                    {producto?.tamanos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre} ({formatearCm(t.anchoCm)} × {formatearCm(t.altoCm)} cm)
                      </option>
                    ))}
                    <option value={PERSONALIZADO}>Personalizado…</option>
                  </select>
                </Campo>
              </div>

              {campos.tamanoId === PERSONALIZADO && (
                <div className="grid grid-cols-2 gap-4">
                  <Campo label="Ancho (cm)" htmlFor={id("anchoCm")} error={errores.anchoCm}>
                    <Input
                      id={id("anchoCm")}
                      inputMode="decimal"
                      value={campos.anchoCm}
                      onChange={(e) => cambiar("anchoCm", e.target.value)}
                      {...invalido("anchoCm")}
                    />
                  </Campo>
                  <Campo label="Alto (cm)" htmlFor={id("altoCm")} error={errores.altoCm}>
                    <Input
                      id={id("altoCm")}
                      inputMode="decimal"
                      value={campos.altoCm}
                      onChange={(e) => cambiar("altoCm", e.target.value)}
                      {...invalido("altoCm")}
                    />
                  </Campo>
                </div>
              )}

              <Campo label="Papel" htmlFor={id("papelId")} error={errores.papelId}>
                <select
                  id={id("papelId")}
                  className={selectClass}
                  value={campos.papelId}
                  onChange={(e) => cambiar("papelId", e.target.value)}
                  {...invalido("papelId")}
                >
                  {catalogo.papeles
                    .filter((p) => producto?.papelesIds.includes(p.id) || p.id === campos.papelId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                </select>
              </Campo>

              <fieldset className="space-y-2" aria-describedby={noCabe || errores.hojaId ? `${id("hojaId")}-error` : undefined}>
                <legend className="text-sm font-medium">Hoja de impresión</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {catalogo.hojas.map((hoja) => {
                    const piezas =
                      vivo?.pieza &&
                      calcularAcomodo(vivo.pieza, hoja, catalogo.margenCm, catalogo.separacionCm).piezasPorHoja;
                    return (
                      <label
                        key={hoja.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/40 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                        )}
                      >
                        <input
                          type="radio"
                          name={id("hojaId")}
                          value={hoja.id}
                          checked={campos.hojaId === hoja.id}
                          onChange={() => cambiar("hojaId", hoja.id)}
                          className="accent-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{hoja.nombre}</span>
                          <span className="block text-muted-foreground">
                            {formatearCm(hoja.anchoCm)} × {formatearCm(hoja.altoCm)} cm
                          </span>
                        </span>
                        {typeof piezas === "number" && (
                          <span className={cn("text-xs", piezas === 0 ? "text-destructive" : "text-muted-foreground")}>
                            {piezas === 0 ? "No cabe" : `${piezas} por hoja`}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                {(noCabe ?? errores.hojaId) && (
                  <p className="text-sm text-destructive" id={`${id("hojaId")}-error`} role="alert">
                    {noCabe ?? errores.hojaId}
                  </p>
                )}
              </fieldset>
            </Paso>

            <Paso numero={3} titulo="Cantidad y descripción">
              <Campo label="Cantidad de piezas" htmlFor={id("cantidad")} error={errores.cantidad} className="sm:max-w-48">
                <Input
                  id={id("cantidad")}
                  inputMode="numeric"
                  placeholder="Ej. 1000"
                  value={campos.cantidad}
                  onChange={(e) => cambiar("cantidad", e.target.value)}
                  {...invalido("cantidad")}
                />
              </Campo>
              <Campo label="Descripción (opcional)" htmlFor={id("descripcion")} error={errores.descripcion}>
                <textarea
                  id={id("descripcion")}
                  rows={3}
                  maxLength={DESCRIPCION_MAXIMA}
                  placeholder="Indicaciones para la imprenta"
                  className={cn(selectClass, "h-auto min-h-20 py-2")}
                  value={campos.descripcion}
                  onChange={(e) => cambiar("descripcion", e.target.value)}
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
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                    4
                  </span>
                  Presupuesto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PresupuestoEnVivo vivo={vivo} catalogo={catalogo} hojaId={campos.hojaId} />
              </CardContent>
            </Card>

            {vivo?.pieza && vivo.evaluacion.ok && hojaElegida && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Vista previa</CardTitle>
                </CardHeader>
                <CardContent>
                  <VistaPreviaHoja
                    hoja={hojaElegida}
                    pieza={vivo.pieza}
                    acomodo={vivo.evaluacion.presupuesto.acomodo}
                    margenCm={catalogo.margenCm}
                    separacionCm={catalogo.separacionCm}
                    hojas={vivo.cantidadValida ? vivo.evaluacion.presupuesto.hojas : undefined}
                    archivo={archivo}
                  />
                </CardContent>
              </Card>
            )}

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

function PresupuestoEnVivo({ vivo, catalogo, hojaId }: { vivo: Vivo; catalogo: Catalogo; hojaId: string }) {
  if (!vivo) {
    return <p className="text-sm text-muted-foreground">Completa el tamaño para ver el presupuesto.</p>;
  }
  if (!vivo.evaluacion.ok) {
    return <p className="text-sm text-destructive">{vivo.evaluacion.mensaje}</p>;
  }

  const { presupuesto } = vivo.evaluacion;
  const hoja = catalogo.hojas.find((h) => h.id === hojaId);
  const fila = "flex items-center justify-between gap-4";
  return (
    <dl className="space-y-2 text-sm">
      <div className={fila}>
        <dt className="text-muted-foreground">Piezas por hoja</dt>
        <dd className="tabular-nums">
          {presupuesto.acomodo.piezasPorHoja}
          {presupuesto.acomodo.rotada && <span className="text-muted-foreground"> (girada)</span>}
        </dd>
      </div>
      <div className={fila}>
        <dt className="text-muted-foreground">Precio por hoja {hoja ? `(${hoja.nombre})` : ""}</dt>
        <dd className="tabular-nums">{formatearMxn(presupuesto.precioHojaCentavos)}</dd>
      </div>
      {vivo.cantidadValida ? (
        <>
          <div className={fila}>
            <dt className="text-muted-foreground">Hojas</dt>
            <dd className="tabular-nums">{formatearNumero(presupuesto.hojas)}</dd>
          </div>
          <div className={`${fila} border-t pt-2 text-base font-semibold`}>
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatearMxn(presupuesto.subtotalCentavos)}</dd>
          </div>
          <p className="text-xs text-muted-foreground">Sin IVA. El IVA se suma en el total del pedido.</p>
        </>
      ) : (
        <p className="border-t pt-2 text-muted-foreground">Escribe la cantidad para ver hojas y subtotal.</p>
      )}
    </dl>
  );
}
