"use client";

import { ArrowLeft, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { FormError } from "@/components/auth/form-error";
import { AvisoPreciosEjemplo } from "@/components/pedidos/aviso-precios-ejemplo";
import { SubidaArchivo } from "@/components/pedidos/subida-archivo";
import { VistaPreviaHoja } from "@/components/pedidos/vista-previa-hoja";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { calcularAcomodo } from "@/lib/pedidos/acomodo";
import { formatearCm, formatearMxn, formatearNumero } from "@/lib/pedidos/formato";
import { evaluarItem, medidasDelTamano } from "@/lib/pedidos/item";
import { cantidadSchema, DESCRIPCION_MAXIMA, itemSchema, tamanoSchema, type ItemInput } from "@/lib/validation/pedidos";
import { pedidosApi, type Catalogo, type PublicArchivo } from "@/lib/pedidos-api";
import { cn } from "@/lib/utils";

const PERSONALIZADO = "__personalizado";

interface Campos {
  productoId: string;
  tamanoId: string; // id de un predefinido o PERSONALIZADO
  anchoCm: string;
  altoCm: string;
  papelId: string;
  hojaId: string;
  cantidad: string;
  descripcion: string;
}

type Errores = Partial<Record<keyof Campos | "archivoId", string>>;

const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30";

/** "1,000" o "1 000" → 1000; "9,5" → 9.5. Vacío o inválido → NaN. */
const aNumero = (valor: string, decimal = false) => {
  const limpio = decimal ? valor.trim().replace(",", ".") : valor.replace(/[\s,]/g, "");
  return limpio === "" ? Number.NaN : Number(limpio);
};

function camposIniciales(catalogo: Catalogo): Campos {
  const producto = catalogo.productos[0];
  return {
    productoId: producto.id,
    tamanoId: producto.tamanos[0]?.id ?? PERSONALIZADO,
    anchoCm: "",
    altoCm: "",
    papelId: producto.papelesIds[0],
    hojaId: catalogo.hojas[0].id,
    cantidad: "",
    descripcion: "",
  };
}

/** Lleva los campos del formulario a la forma de la API. */
function aItemInput(campos: Campos, archivoId: string): ItemInput {
  return {
    archivoId,
    descripcion: campos.descripcion,
    productoId: campos.productoId,
    tamano:
      campos.tamanoId === PERSONALIZADO
        ? { tipo: "personalizado", anchoCm: aNumero(campos.anchoCm, true), altoCm: aNumero(campos.altoCm, true) }
        : { tipo: "predefinido", tamanoId: campos.tamanoId },
    papelId: campos.papelId,
    hojaId: campos.hojaId,
    cantidad: aNumero(campos.cantidad),
  };
}

/** "tamano.anchoCm" → "anchoCm"; "tamano" → "tamanoId". */
function campoDeRuta(ruta: string): keyof Errores | null {
  if (ruta === "tamano.anchoCm") return "anchoCm";
  if (ruta === "tamano.altoCm") return "altoCm";
  if (ruta.startsWith("tamano")) return "tamanoId";
  const campos = ["archivoId", "productoId", "papelId", "hojaId", "cantidad", "descripcion"];
  return campos.includes(ruta) ? (ruta as keyof Errores) : null;
}

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
    <div className={cn("space-y-1.5", className)}>
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
  const router = useRouter();
  const ids = useId();
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [archivo, setArchivo] = useState<PublicArchivo | null>(null);
  const [campos, setCampos] = useState<Campos | null>(null);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string>();
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => {
    Promise.all([pedidosApi.catalogo(), itemId ? pedidosApi.borrador() : null])
      .then(([{ catalogo }, borrador]) => {
        setCatalogo(catalogo);
        if (!itemId) return setCampos(camposIniciales(catalogo));

        const item = borrador?.pedido.items.find((i) => i.id === itemId);
        if (!item) return setErrorGeneral("Este ítem ya no está en tu pedido");
        setArchivo(borrador!.archivos[item.archivoId] ?? null);
        setCampos({
          productoId: item.productoId,
          tamanoId: item.tamano.tipo === "predefinido" ? item.tamano.tamanoId : PERSONALIZADO,
          anchoCm: item.tamano.tipo === "personalizado" ? String(item.tamano.anchoCm) : "",
          altoCm: item.tamano.tipo === "personalizado" ? String(item.tamano.altoCm) : "",
          papelId: item.papelId,
          hojaId: item.hojaId,
          cantidad: String(item.cantidad),
          descripcion: item.descripcion,
        });
      })
      .catch((e) => setErrorGeneral(e instanceof ApiError ? e.message : "No se pudo cargar el editor"));
  }, [itemId]);

  const producto = catalogo?.productos.find((p) => p.id === campos?.productoId);

  // Presupuesto en vivo: la misma función que usa el servidor.
  const vivo = useMemo(() => {
    if (!catalogo || !campos || !producto) return null;
    const input = aItemInput(campos, archivo?.id ?? "");
    const tamano = tamanoSchema.safeParse(input.tamano);
    if (!tamano.success) return null;
    const pieza = medidasDelTamano(producto, tamano.data);
    const cantidad = cantidadSchema.safeParse(input.cantidad);
    // Sin cantidad válida se evalúa con 1 para saber si cabe y cuántas piezas por hoja.
    const evaluacion = evaluarItem(catalogo, {
      ...input,
      tamano: tamano.data,
      cantidad: cantidad.success ? cantidad.data : 1,
    });
    return { pieza, evaluacion, cantidadValida: cantidad.success };
  }, [catalogo, campos, producto, archivo]);

  function cambiar<K extends keyof Campos>(campo: K, valor: Campos[K]) {
    setCampos((actual) => (actual ? { ...actual, [campo]: valor } : actual));
    setErrores((actual) => ({ ...actual, [campo]: undefined }));
  }

  function cambiarProducto(productoId: string) {
    const nuevo = catalogo?.productos.find((p) => p.id === productoId);
    if (!nuevo || !campos) return;
    setCampos({
      ...campos,
      productoId,
      tamanoId: nuevo.tamanos[0]?.id ?? PERSONALIZADO,
      papelId: nuevo.papelesIds.includes(campos.papelId) ? campos.papelId : nuevo.papelesIds[0],
    });
    setErrores({});
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!catalogo || !campos || subiendo) return;
    setErrorGeneral(undefined);

    const input = aItemInput(campos, archivo?.id ?? "");
    const nuevos: Errores = {};
    if (!archivo) nuevos.archivoId = "Sube el archivo que quieres imprimir";
    const validacion = itemSchema.safeParse(input);
    if (!validacion.success) {
      for (const issue of validacion.error.issues) {
        const campo = campoDeRuta(issue.path.join("."));
        if (campo && campo !== "archivoId") nuevos[campo] ??= issue.message;
      }
    } else {
      const evaluacion = evaluarItem(catalogo, validacion.data);
      if (!evaluacion.ok) nuevos[evaluacion.campo === "tamano" ? "tamanoId" : evaluacion.campo] = evaluacion.mensaje;
    }
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setGuardando(true);
    try {
      if (itemId) await pedidosApi.editarItem(itemId, input);
      else await pedidosApi.agregarItem(input);
      router.push("/panel/pedidos/nuevo");
    } catch (e) {
      setGuardando(false);
      if (!(e instanceof ApiError)) return setErrorGeneral("Ocurrió un error inesperado");
      const delServidor: Errores = {};
      for (const [ruta, mensaje] of Object.entries(e.fields)) {
        const campo = campoDeRuta(ruta);
        if (campo) delServidor[campo] = mensaje;
      }
      setErrores(delServidor);
      if (Object.keys(delServidor).length === 0) setErrorGeneral(e.message);
    }
  }

  const titulo = itemId ? "Editar ítem" : "Agregar ítem";
  const id = (campo: string) => `${ids}-${campo}`;
  const invalido = (campo: keyof Errores) =>
    errores[campo] ? { "aria-invalid": true, "aria-describedby": `${id(campo)}-error` } : {};

  const hojaElegida = catalogo?.hojas.find((h) => h.id === campos?.hojaId);

  // "No cabe" se muestra junto a la hoja en cuanto se detecta, sin esperar a guardar.
  const noCabe = vivo && !vivo.evaluacion.ok && vivo.evaluacion.noCabe ? vivo.evaluacion.mensaje : undefined;

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
                onSubiendoChange={setSubiendo}
                error={errores.archivoId}
                onSubido={(nuevo) => {
                  setArchivo(nuevo);
                  setErrores((actual) => ({ ...actual, archivoId: undefined }));
                }}
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

              <fieldset className="space-y-1.5" aria-describedby={noCabe || errores.hojaId ? `${id("hojaId")}-error` : undefined}>
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

type Vivo = {
  pieza: ReturnType<typeof medidasDelTamano>;
  evaluacion: ReturnType<typeof evaluarItem>;
  cantidadValida: boolean;
} | null;

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
