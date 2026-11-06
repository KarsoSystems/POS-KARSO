import { apiFetch } from "@/lib/api-client";
import type { Banner } from "@/lib/banners/schema";
import type { Producto } from "@/lib/catalogo/schema";
import type { Sucursal } from "@/lib/sucursales/schema";

export type { Banner, Producto, Sucursal };

/** Catálogo que la tienda ve: ya filtrado por el servidor (activos, canal en línea). */
export interface ProductosResponse {
  ejemplo: boolean; // true → la UI muestra "Precios de ejemplo"
  productos: Producto[];
}

/** Sucursales activas donde el cliente puede recoger, por `clave`. */
export interface SucursalesResponse {
  ejemplo: boolean; // true → la UI aclara que son sucursales de ejemplo
  sucursales: Sucursal[];
}

// Rutas públicas de la tienda (KARSO: /tienda); no requieren sesión.
export const tiendaApi = {
  productos: () => apiFetch<ProductosResponse>("/api/tienda/productos"),
  banners: () => apiFetch<{ banners: Banner[] }>("/api/tienda/banners"),
  sucursales: () => apiFetch<SucursalesResponse>("/api/tienda/sucursales"),
};
