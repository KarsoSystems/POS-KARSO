import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Rutas de datos, archivos y mock del panel temporales antes de importar los módulos.
const env = vi.hoisted(() => {
  const base = `${process.env.TMPDIR ?? "/tmp"}/borrador-routes-${process.pid}`;
  process.env.DATA_DIR = `${base}/data`;
  process.env.UPLOADS_DIR = `${base}/uploads`;
  process.env.PRODUCTOS_PATH = `${base}/productos.json`;
  process.env.AUTH_SECRET = "x".repeat(32);
  return {
    base,
    dataDir: process.env.DATA_DIR,
    uploadsDir: process.env.UPLOADS_DIR,
    productosPath: process.env.PRODUCTOS_PATH,
  };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import { fixture, solicitarSubida, subirArchivoPrueba } from "@/test/archivos";
import type { ProductosArchivo } from "@/lib/catalogo/schema";
import { PRODUCTOS_PATH } from "@/server/mock-panel";
import { jar } from "@/test/next-headers-mock";
import { cambiarSesion, iniciarSesionActiva } from "@/test/sesion";
import { GET as getBorrador } from "./borrador/route";
import { POST as agregar } from "./borrador/items/route";
import { DELETE as quitar, PUT as editar } from "./borrador/items/[itemId]/route";

// Ids del mock del panel (config/mock-panel/productos.json).
const TARJETA = "6720a1f0c1a2b3c4d5e60201";
const TARJETA_COUCHE = "6720a1f0c1a2b3c4d5e60211";
const TARJETA_LAMINADA = "6720a1f0c1a2b3c4d5e60212"; // reverso obligatorio
const VOLANTE = "6720a1f0c1a2b3c4d5e60203";
const VOLANTE_BOND = "6720a1f0c1a2b3c4d5e60233"; // reverso no_aplica
const CREDENCIAL_PVC = "6720a1f0c1a2b3c4d5e60218";
const LONA = "6720a1f0c1a2b3c4d5e60202";
const LONA_720 = "6720a1f0c1a2b3c4d5e60221";
const LONA_URGENTE = "6720a1f0c1a2b3c4d5e60222";
const SUAJE = 2;
const FOLIADO = 3;
const OJILLOS = 5;

const json = (method: string, body: unknown) =>
  new Request("http://localhost/api/pedidos/borrador/items", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const lineaCtx = (itemId: string) => ({ params: Promise.resolve({ itemId }) });

/** Sube un archivo (por omisión, un "jpg" que no es imagen: queda con la advertencia `ilegible`). */
async function subirArchivo(nombre = "tarjeta.jpg", contenido: Uint8Array | string = "imagen"): Promise<string> {
  return (await subirArchivoPrueba(nombre, contenido)).id;
}

const frente = (archivoId: string) => ({ frente: archivoId, reverso: null });

/** Tarjeta couché × 2 millares con suaje: $310.00. */
const tarjeta = (archivoId: string, cambios: Record<string, unknown> = {}) => ({
  archivos: frente(archivoId),
  productoId: TARJETA,
  varianteId: TARJETA_COUCHE,
  especificaciones: [SUAJE],
  cantidad: 2,
  ...cambios,
});

/** Lona 720 dpi de 2.00 × 1.50 m × 2 con ojillos: $414.00. */
const lona = (archivoId: string, cambios: Record<string, unknown> = {}) => ({
  archivos: frente(archivoId),
  productoId: LONA,
  varianteId: LONA_720,
  medida: { ancho: 2, alto: 1.5 },
  especificaciones: [OJILLOS],
  cantidad: 2,
  ...cambios,
});

const readJson = async (file: string) => JSON.parse(await readFile(path.join(env.dataDir, file), "utf8"));
const enUploads = async () => readdir(path.join(env.uploadsDir, "temporal")).catch(() => []);

async function editarProductos(cambiar: (archivo: ProductosArchivo) => void) {
  const archivo = JSON.parse(await readFile(env.productosPath, "utf8"));
  cambiar(archivo);
  await writeFile(env.productosPath, JSON.stringify(archivo));
}
const producto = (archivo: ProductosArchivo, id: string) => archivo.productos.find((p) => p._id === id)!;
const variante = (archivo: ProductosArchivo, productoId: string, varianteId: string) =>
  producto(archivo, productoId).variantes.find((v) => v.varianteId === varianteId)!;

beforeEach(async () => {
  await rm(env.base, { recursive: true, force: true });
  await mkdir(env.base, { recursive: true });
  await copyFile(PRODUCTOS_PATH, env.productosPath);
  jar.clear();
});

afterAll(async () => {
  await rm(env.base, { recursive: true, force: true });
});

describe("GET /api/pedidos/borrador", () => {
  it("sin sesión → 401", async () => {
    expect((await getBorrador()).status).toBe(401);
  });

  it("crea el borrador vacío la primera vez, sin IVA, y devuelve el mismo después", async () => {
    await iniciarSesionActiva();
    const primero = (await (await getBorrador()).json()).pedido;
    expect(primero).toMatchObject({
      estatus: "borrador",
      folio: null,
      productos: [],
      subtotal: 0,
      descuento: 0,
      baseIva: 0,
      tasaIva: 0,
      iva: 0,
      total: 0,
    });
    const segundo = (await (await getBorrador()).json()).pedido;
    expect(segundo.id).toBe(primero.id);
    expect((await readJson("orders.json")).pedidos).toHaveLength(1);
  });

  it("recalcula con el catálogo vigente y lo guarda en orders.json", async () => {
    await iniciarSesionActiva();
    await agregar(json("POST", tarjeta(await subirArchivo())));
    await editarProductos((a) => {
      variante(a, TARJETA, TARJETA_COUCHE).precio = 120;
    });

    const { pedido } = await (await getBorrador()).json();
    expect(pedido.productos[0]).toMatchObject({ precioBase: 120, importeUnitario: 160, subtotal: 320 });
    expect(pedido).toMatchObject({ subtotal: 320, total: 320 });
    expect((await readJson("orders.json")).pedidos[0].total).toBe(320);
  });

  it("marca problema si la variante se desactiva, pasa a solo mostrador o el producto desaparece", async () => {
    await iniciarSesionActiva();
    await agregar(json("POST", tarjeta(await subirArchivo())));

    await editarProductos((a) => {
      variante(a, TARJETA, TARJETA_COUCHE).activa = false;
    });
    let { pedido } = await (await getBorrador()).json();
    expect(pedido.productos[0].problema).toBe("Couché 8.7 x 5 cm ya no está disponible");
    // Conserva el último importe válido.
    expect(pedido.productos[0].subtotal).toBe(310);

    await editarProductos((a) => {
      const v = variante(a, TARJETA, TARJETA_COUCHE);
      v.activa = true;
      v.canales = ["mostrador"];
    });
    ({ pedido } = await (await getBorrador()).json());
    expect(pedido.productos[0].problema).toBe("Couché 8.7 x 5 cm solo se vende en mostrador");

    await editarProductos((a) => {
      a.productos = a.productos.filter((p) => p._id !== TARJETA);
    });
    ({ pedido } = await (await getBorrador()).json());
    expect(pedido.productos[0].problema).toBe("El producto ya no existe en el catálogo");
  });

  it("marca problema si la medida queda fuera de rango y lo quita al volver", async () => {
    await iniciarSesionActiva();
    await agregar(json("POST", lona(await subirArchivo())));
    await editarProductos((a) => {
      variante(a, LONA, LONA_720).medida.ancho.max = 1.5;
    });
    let { pedido } = await (await getBorrador()).json();
    expect(pedido.productos[0].problema).toBe("El ancho debe estar entre 0.50 y 1.50 m");

    await copyFile(PRODUCTOS_PATH, env.productosPath);
    ({ pedido } = await (await getBorrador()).json());
    expect(pedido.productos[0].problema).toBeNull();
  });

  it("con un mock inválido responde 500 y el log indica el campo", async () => {
    await iniciarSesionActiva();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await editarProductos((a) => {
      a.productos[0].variantes[1].sku = a.productos[0].variantes[0].sku;
    });
    const res = await getBorrador();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("CATALOGO_INVALIDO");
    expect(errorSpy.mock.calls[0].join(" ")).toMatch(/productos\.0\.variantes\.1\.sku/);
    errorSpy.mockRestore();
  });

  it("un orders.json de la SPEC 02 (versión 1) se descarta sin romper y se reinicia en la versión 6", async () => {
    await iniciarSesionActiva();
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mkdir(env.dataDir, { recursive: true });
    await writeFile(
      path.join(env.dataDir, "orders.json"),
      JSON.stringify({ version: 1, ultimoFolio: 4, pedidos: [{ id: "viejo", items: [], totales: {} }] }),
    );
    const res = await getBorrador();
    expect(res.status).toBe(200);
    expect((await res.json()).pedido.productos).toEqual([]);
    expect(await readJson("orders.json")).toMatchObject({ version: 6, contadores: {} });
    aviso.mockRestore();
  });
});

describe("POST /api/pedidos/borrador/items", () => {
  it("una línea válida → 201 con la copia de la variante y la cotización del servidor", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo("tarjeta.tiff");
    // Un importe mandado por el cliente se ignora: el servidor calcula.
    const res = await agregar(json("POST", { ...tarjeta(archivoId), subtotal: 1 }));
    expect(res.status).toBe(201);

    const { pedido, archivos } = await res.json();
    expect(pedido.productos).toHaveLength(1);
    expect(pedido.productos[0]).toMatchObject({
      archivos: {
        frente: {
          archivoId,
          nombreOriginal: "tarjeta.tiff",
          formato: "tiff",
          pesoMB: 0,
          validado: false,
          advertencias: [{ codigo: "ilegible", mensaje: "No se pudo leer la imagen; mostrador la revisará" }],
        },
        reverso: null,
      },
      descripcion: "",
      productoId: TARJETA,
      varianteId: TARJETA_COUCHE,
      sku: "70000177",
      nombre: "Tarjeta",
      variante: "Couché 8.7 x 5 cm",
      atributos: { presentacion: "Couché", acabadoBase: "Barniz UV" },
      grupoArmado: "Tarjetas Couché",
      volumen: "millar",
      precioBase: 115,
      cantidad: 2,
      medida: { tipo: "fija", unidad: "cm", ancho: 8.7, alto: 5, area: null },
      especificaciones: [{ id: SUAJE, nombre: "Suaje", unidades: 1, importeUnitario: 40 }],
      importeBaseUnitario: 115,
      importeEspecificacionesUnitario: 40,
      importeUnitario: 155,
      subtotal: 310,
      problema: null,
      estatus: null,
      fechaEntregaEstimada: null,
      loteId: null,
    });
    expect(pedido.productos[0].lineaId).toEqual(expect.any(String));
    expect(pedido).toMatchObject({ subtotal: 310, descuento: 0, baseIva: 310, tasaIva: 0, iva: 0, total: 310 });
    expect(archivos[archivoId]).toMatchObject({ nombreOriginal: "tarjeta.tiff", estado: "subido" });
    expect((await readJson("orders.json")).pedidos[0].productos[0].subtotal).toBe(310);
  });

  it("tarjeta + lona con ojillos → subtotal y total $724.00", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo();
    await agregar(json("POST", tarjeta(archivoId)));
    const res = await agregar(json("POST", lona(archivoId)));
    const { pedido } = await res.json();
    expect(pedido.productos[1]).toMatchObject({
      medida: { tipo: "variable", unidad: "m", ancho: 2, alto: 1.5, area: 3 },
      especificaciones: [{ nombre: "Ojillos", unidades: 14, importeUnitario: 42 }],
      subtotal: 414,
    });
    expect(pedido).toMatchObject({ subtotal: 724, total: 724 });
  });

  it("una variante solo de mostrador → 422", async () => {
    await iniciarSesionActiva();
    const res = await agregar(json("POST", lona(await subirArchivo(), { varianteId: LONA_URGENTE })));
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields).toEqual({ varianteId: "Lona urgente 720 dpi solo se vende en mostrador" });
  });

  it("una medida fuera de rango → 422 con el rango", async () => {
    await iniciarSesionActiva();
    const res = await agregar(json("POST", lona(await subirArchivo(), { medida: { ancho: 6, alto: 1.5 } })));
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields).toEqual({ "medida.ancho": "El ancho debe estar entre 0.50 y 5.00 m" });
  });

  it("un acabado que no aplica a la variante → 422", async () => {
    await iniciarSesionActiva();
    const res = await agregar(json("POST", tarjeta(await subirArchivo(), { varianteId: CREDENCIAL_PVC })));
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields).toEqual({
      especificaciones: "El acabado Suaje no aplica a Credencial PVC 8.5 x 5.4 cm",
    });
  });

  it("una cantidad fuera de rango → 422 de validación", async () => {
    await iniciarSesionActiva();
    const res = await agregar(json("POST", tarjeta(await subirArchivo(), { cantidad: 100_001 })));
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields).toEqual({ cantidad: "La cantidad máxima es 100,000" });
  });

  it("un archivo de otro usuario → 422", async () => {
    await iniciarSesionActiva("ana@ejemplo.com");
    const ajeno = await subirArchivo();
    await iniciarSesionActiva("beto@ejemplo.com");
    const res = await agregar(json("POST", tarjeta(ajeno)));
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields).toEqual({ "archivos.frente": "El archivo no existe" });
  });

  it("la línea 21 → 409 'Máximo 20 ítems por pedido'", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo();
    for (let i = 0; i < 20; i++) {
      expect((await agregar(json("POST", tarjeta(archivoId)))).status).toBe(201);
    }
    const res = await agregar(json("POST", tarjeta(archivoId)));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({
      code: "MAXIMO_ITEMS",
      message: "Máximo 20 ítems por pedido",
    });
    expect((await readJson("orders.json")).pedidos[0].productos).toHaveLength(20);
  });
});

describe("frente y reverso (SPEC 05)", () => {
  const anio = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", year: "numeric" }).format(new Date()));
  const conReverso = (archivoId: string, reverso: unknown, cambios: Record<string, unknown> = {}) =>
    tarjeta(archivoId, { archivos: { frente: archivoId, reverso }, ...cambios });
  const campos = async (res: Response) => (await res.json()).error.fields;

  it("laminada sin reverso → 422 'Elige el reverso'", async () => {
    await iniciarSesionActiva();
    const res = await agregar(json("POST", tarjeta(await subirArchivo(), { varianteId: TARJETA_LAMINADA })));
    expect(res.status).toBe(422);
    expect(await campos(res)).toEqual({ "archivos.reverso": "Elige el reverso" });
  });

  it("volante bond con reverso → 422", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo();
    const res = await agregar(
      json("POST", {
        archivos: { frente: archivoId, reverso: { tipo: "texto", texto: "Hola" } },
        productoId: VOLANTE,
        varianteId: VOLANTE_BOND,
        cantidad: 1,
      }),
    );
    expect(res.status).toBe(422);
    expect(await campos(res)).toEqual({ "archivos.reverso": "Este producto no lleva reverso" });
  });

  it("sin frente → 422", async () => {
    await iniciarSesionActiva();
    const res = await agregar(json("POST", tarjeta("", { archivos: { frente: null, reverso: null } })));
    expect(res.status).toBe(422);
    expect(await campos(res)).toEqual({ "archivos.frente": "Sube el archivo que quieres imprimir" });
  });

  it("tarjeta couché sin reverso, con archivo, con calendario del año siguiente y con texto → 201", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo();
    const reversoId = await subirArchivo("reverso.pdf", "%PDF");

    const casos: [unknown, unknown][] = [
      [null, null],
      [{ tipo: "archivo", archivoId: reversoId }, { tipo: "archivo", archivoId: reversoId, formato: "pdf" }],
      [{ tipo: "calendario", anio: anio + 1 }, { tipo: "calendario", anio: anio + 1 }],
      [{ tipo: "texto", texto: "  Oración a San Judas  " }, { tipo: "texto", texto: "Oración a San Judas" }],
    ];
    for (const [reverso, guardado] of casos) {
      const res = await agregar(json("POST", conReverso(archivoId, reverso)));
      expect(res.status).toBe(201);
      const { pedido } = await res.json();
      const linea = pedido.productos.at(-1);
      if (guardado === null) expect(linea.archivos.reverso).toBeNull();
      else expect(linea.archivos.reverso).toMatchObject(guardado as object);
    }
  });

  it("la laminada acepta calendario del año actual", async () => {
    await iniciarSesionActiva();
    const res = await agregar(
      json("POST", conReverso(await subirArchivo(), { tipo: "calendario", anio }, { varianteId: TARJETA_LAMINADA })),
    );
    expect(res.status).toBe(201);
  });

  it("un año pasado y un texto de 501 caracteres → 422", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo();
    const pasado = await agregar(json("POST", conReverso(archivoId, { tipo: "calendario", anio: anio - 1 })));
    expect(pasado.status).toBe(422);
    expect(await campos(pasado)).toEqual({ "archivos.reverso": `Elige el calendario de ${anio} o ${anio + 1}` });

    const largo = await agregar(json("POST", conReverso(archivoId, { tipo: "texto", texto: "a".repeat(501) })));
    expect(largo.status).toBe(422);
    expect(await campos(largo)).toEqual({ "archivos.reverso.texto": "El texto no puede tener más de 500 caracteres" });

    const vacio = await agregar(json("POST", conReverso(archivoId, { tipo: "texto", texto: "   " })));
    expect(await campos(vacio)).toEqual({ "archivos.reverso.texto": "Escribe el texto del reverso" });
  });

  it("un archivo que sigue pendiente → 422", async () => {
    await iniciarSesionActiva();
    const { archivo } = await (await solicitarSubida("tarjeta.jpg", 10)).json();
    const res = await agregar(json("POST", tarjeta(archivo.id)));
    expect(res.status).toBe(422);
    expect(await campos(res)).toEqual({ "archivos.frente": "El archivo aún no termina de subirse" });
  });

  it("un reverso de otro usuario → 422", async () => {
    await iniciarSesionActiva("ana@ejemplo.com");
    const ajeno = await subirArchivo();
    await iniciarSesionActiva("beto@ejemplo.com");
    const res = await agregar(json("POST", conReverso(await subirArchivo(), { tipo: "archivo", archivoId: ajeno })));
    expect(await campos(res)).toEqual({ "archivos.reverso": "El archivo no existe" });
  });

  it("un archivo CMYK de la medida correcta queda validado", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo("tarjeta.jpg", await fixture("tarjeta-cmyk.jpg"));
    const { pedido } = await (await agregar(json("POST", tarjeta(archivoId)))).json();
    expect(pedido.productos[0].archivos.frente).toMatchObject({
      formato: "jpg",
      color: "CMYK",
      anchoPx: 1098,
      altoPx: 661,
      resolucion: 300,
      validado: true,
      advertencias: [],
    });
  });

  it("un archivo RGB → 201 con validado: false y la advertencia color", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo("tarjeta.jpg", await fixture("tarjeta-rgb.jpg"));
    const res = await agregar(json("POST", tarjeta(archivoId)));
    expect(res.status).toBe(201);
    expect((await res.json()).pedido.productos[0].archivos.frente).toMatchObject({
      color: "RGB",
      validado: false,
      advertencias: [{ codigo: "color", mensaje: "El archivo está en RGB; se requiere CMYK" }],
    });
  });

  it("cambiar colorRequerido en el mock recalcula las advertencias", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo("tarjeta.jpg", await fixture("tarjeta-rgb.jpg"));
    await agregar(json("POST", tarjeta(archivoId)));

    await editarProductos((a) => {
      producto(a, TARJETA).archivo.colorRequerido = "cualquiera";
    });
    const { pedido } = await (await getBorrador()).json();
    expect(pedido.productos[0].archivos.frente).toMatchObject({ validado: true, advertencias: [] });
    expect((await readJson("orders.json")).pedidos[0].productos[0].archivos.frente.validado).toBe(true);
  });

  it("al recalcular, un calendario de un año que ya pasó marca problema", async () => {
    const user = await iniciarSesionActiva();
    await agregar(json("POST", conReverso(await subirArchivo(), { tipo: "calendario", anio })));

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(`${anio + 1}-07-01T12:00:00Z`));
      await cambiarSesion(user); // la sesión de 7 días ya habría vencido
      const { pedido } = await (await getBorrador()).json();
      expect(pedido.productos[0].problema).toBe(`Elige el calendario de ${anio + 1} o ${anio + 2}`);
    } finally {
      vi.useRealTimers();
    }
  });

  it("quitar la línea libera también el archivo del reverso", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo();
    const reversoId = await subirArchivo("reverso.pdf", "%PDF");
    const { pedido } = await (await agregar(json("POST", conReverso(archivoId, { tipo: "archivo", archivoId: reversoId })))).json();
    expect((await enUploads()).sort()).toEqual([`${archivoId}.jpg`, `${reversoId}.pdf`].sort());

    await quitar(new Request("http://localhost"), lineaCtx(pedido.productos[0].lineaId));
    expect(await enUploads()).toEqual([]);
  });

  it("cambiar el reverso de archivo a texto libera el archivo anterior", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo();
    const reversoId = await subirArchivo("reverso.pdf", "%PDF");
    const { pedido } = await (await agregar(json("POST", conReverso(archivoId, { tipo: "archivo", archivoId: reversoId })))).json();

    await editar(json("PUT", conReverso(archivoId, { tipo: "texto", texto: "Gracias" })), lineaCtx(pedido.productos[0].lineaId));
    expect(await enUploads()).toEqual([`${archivoId}.jpg`]);
  });
});

describe("PUT /api/pedidos/borrador/items/:itemId", () => {
  it("cambiar cantidad y acabados recalcula la línea", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo();
    const { pedido } = await (await agregar(json("POST", tarjeta(archivoId)))).json();
    const lineaId = pedido.productos[0].lineaId;

    const res = await editar(
      json("PUT", tarjeta(archivoId, { cantidad: 3, especificaciones: [FOLIADO] })),
      lineaCtx(lineaId),
    );
    expect(res.status).toBe(200);
    const editado = (await res.json()).pedido;
    expect(editado.productos).toHaveLength(1);
    expect(editado.productos[0]).toMatchObject({
      lineaId,
      cantidad: 3,
      especificaciones: [{ nombre: "Foliado", importeUnitario: 80 }],
      importeUnitario: 195,
      subtotal: 585,
    });
    expect(editado.total).toBe(585);
  });

  it("una línea inexistente → 404", async () => {
    await iniciarSesionActiva();
    const res = await editar(json("PUT", tarjeta(await subirArchivo())), lineaCtx("no-existe"));
    expect(res.status).toBe(404);
  });

  it("una edición inválida → 422 y la línea queda igual", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo();
    const { pedido } = await (await agregar(json("POST", lona(archivoId)))).json();
    const res = await editar(
      json("PUT", lona(archivoId, { medida: { ancho: 2, alto: 11 } })),
      lineaCtx(pedido.productos[0].lineaId),
    );
    expect(res.status).toBe(422);
    expect((await readJson("orders.json")).pedidos[0].productos[0].medida.alto).toBe(1.5);
  });

  it("cambiar el archivo libera el anterior si nadie más lo usa", async () => {
    await iniciarSesionActiva();
    const viejo = await subirArchivo("viejo.jpg");
    const nuevo = await subirArchivo("nuevo.jpg");
    const { pedido } = await (await agregar(json("POST", tarjeta(viejo)))).json();

    await editar(json("PUT", tarjeta(nuevo)), lineaCtx(pedido.productos[0].lineaId));
    expect(await enUploads()).toEqual([`${nuevo}.jpg`]);
  });
});

describe("DELETE /api/pedidos/borrador/items/:itemId", () => {
  it("quita la línea y borra su archivo de uploads/ y de archivos.json", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo();
    const { pedido } = await (await agregar(json("POST", tarjeta(archivoId)))).json();
    expect(await enUploads()).toEqual([`${archivoId}.jpg`]);

    const res = await quitar(new Request("http://localhost"), lineaCtx(pedido.productos[0].lineaId));
    expect(res.status).toBe(200);
    const { pedido: actualizado } = await res.json();
    expect(actualizado.productos).toEqual([]);
    expect(actualizado.total).toBe(0);
    expect(await enUploads()).toEqual([]);
    expect((await readJson("archivos.json")).archivos).toEqual([]);
  });

  it("no borra el archivo si otra línea lo usa", async () => {
    await iniciarSesionActiva();
    const archivoId = await subirArchivo();
    await agregar(json("POST", tarjeta(archivoId)));
    const { pedido } = await (await agregar(json("POST", lona(archivoId)))).json();

    await quitar(new Request("http://localhost"), lineaCtx(pedido.productos[0].lineaId));
    expect(await enUploads()).toEqual([`${archivoId}.jpg`]);
  });

  it("una línea inexistente → 404", async () => {
    await iniciarSesionActiva();
    expect((await quitar(new Request("http://localhost"), lineaCtx("no-existe"))).status).toBe(404);
  });
});
