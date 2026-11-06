import type { NextResponse } from "next/server";
import type { Banner } from "@/lib/banners/schema";
import type { Producto, ProductosArchivo } from "@/lib/catalogo/schema";
import type { ConfiguracionTienda } from "@/lib/configuracion/schema";
import type { Promocion } from "@/lib/promociones/schema";
import type { Sucursal, SucursalesArchivo } from "@/lib/sucursales/schema";
import { apiError } from "@/server/http/responses";
import {
  cargarBanners,
  cargarConfiguracion,
  cargarProductos,
  cargarPromociones,
  cargarSucursales,
} from "@/server/mock-panel";

// Lo que la tienda ve del catálogo del panel. Filtra el servidor, como lo harán
// las rutas /tienda del backend real: el front no decide qué se vende en línea.

/**
 * Productos activos con sus variantes activas en canal `en_linea` y sus
 * especificaciones activas, por `orden`. Un producto sin variantes en línea no
 * aparece; una especificación limitada a variantes que ya no aparecen, tampoco.
 */
export function productosEnLinea(productos: Producto[]): Producto[] {
  return productos
    .filter((producto) => producto.activo)
    .map((producto) => {
      const variantes = producto.variantes.filter((v) => v.activa && v.canales.includes("en_linea"));
      const visibles = new Set(variantes.map((v) => v.varianteId));
      const especificaciones = producto.especificaciones
        .filter((e) => e.activa)
        .map((e) => (e.variantes ? { ...e, variantes: e.variantes.filter((id) => visibles.has(id)) } : e))
        .filter((e) => e.variantes === null || e.variantes.length > 0);
      return { ...producto, variantes, especificaciones };
    })
    .filter((producto) => producto.variantes.length > 0)
    .sort((a, b) => a.orden - b.orden);
}

/** Banners activos y vigentes en `ahora` (`vigencia: null` = siempre), por `orden`. */
export function bannersVigentes(banners: Banner[], ahora: Date = new Date()): Banner[] {
  const t = ahora.getTime();
  return banners
    .filter((b) => b.activo)
    .filter((b) => !b.vigencia || (Date.parse(b.vigencia.inicio) <= t && t <= Date.parse(b.vigencia.fin)))
    .sort((a, b) => a.orden - b.orden);
}

/** Sucursales activas, por `clave`: donde el cliente puede recoger. */
export function sucursalesActivas(sucursales: Sucursal[]): Sucursal[] {
  return sucursales.filter((s) => s.activa).sort((a, b) => a.clave - b.clave);
}

type ParaRuta<T> = ({ response?: never } & T) | ({ response: NextResponse } & { [K in keyof T]?: never });

/**
 * Para route handlers: el mock cargado o `{ response }` con 500. El detalle (ruta
 * del campo que falla) va al log del servidor, no al cliente.
 */
export async function productosParaRuta(): Promise<ParaRuta<{ archivo: ProductosArchivo }>> {
  try {
    return { archivo: await cargarProductos() };
  } catch (error) {
    console.error("[mock-panel]", (error as Error).message);
    return { response: apiError(500, "CATALOGO_INVALIDO", "El catálogo no está disponible") };
  }
}

export async function bannersParaRuta(): Promise<ParaRuta<{ banners: Banner[] }>> {
  try {
    return { banners: (await cargarBanners()).banners };
  } catch (error) {
    console.error("[mock-panel]", (error as Error).message);
    return { response: apiError(500, "BANNERS_INVALIDOS", "Los banners no están disponibles") };
  }
}

export async function sucursalesParaRuta(): Promise<ParaRuta<{ archivo: SucursalesArchivo }>> {
  try {
    return { archivo: await cargarSucursales() };
  } catch (error) {
    console.error("[mock-panel]", (error as Error).message);
    return { response: apiError(500, "SUCURSALES_INVALIDAS", "Las sucursales no están disponibles") };
  }
}

export async function promocionesParaRuta(): Promise<ParaRuta<{ promociones: Promocion[] }>> {
  try {
    return { promociones: (await cargarPromociones()).promociones };
  } catch (error) {
    console.error("[mock-panel]", (error as Error).message);
    return { response: apiError(500, "PROMOCIONES_INVALIDAS", "Las promociones no están disponibles") };
  }
}

export async function configuracionParaRuta(): Promise<ParaRuta<{ configuracion: ConfiguracionTienda }>> {
  try {
    return { configuracion: (await cargarConfiguracion()).configuracion };
  } catch (error) {
    console.error("[mock-panel]", (error as Error).message);
    return { response: apiError(500, "CONFIGURACION_INVALIDA", "La configuración no está disponible") };
  }
}

/**
 * Lo que el servidor necesita del panel para recalcular un borrador: el catálogo
 * completo (sin filtrar, para distinguir "ya no está disponible" de "solo en
 * mostrador"), todas las sucursales, las promociones y la configuración.
 */
export interface ContextoTienda {
  productos: Producto[];
  sucursales: Sucursal[];
  promociones: Promocion[];
  configuracion: ConfiguracionTienda;
}

/** Los cuatro mocks del panel, o `{ response }` con el 500 del primero que no valide. */
export async function contextoParaRuta(): Promise<ParaRuta<{ contexto: ContextoTienda }>> {
  const [productos, sucursales, promociones, configuracion] = await Promise.all([
    productosParaRuta(),
    sucursalesParaRuta(),
    promocionesParaRuta(),
    configuracionParaRuta(),
  ]);
  for (const resultado of [productos, sucursales, promociones, configuracion]) {
    if (resultado.response) return { response: resultado.response };
  }
  return {
    contexto: {
      productos: productos.archivo!.productos,
      sucursales: sucursales.archivo!.sucursales,
      promociones: promociones.promociones!,
      configuracion: configuracion.configuracion!,
    },
  };
}
