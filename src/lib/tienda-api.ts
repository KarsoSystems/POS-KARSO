import { apiFetch } from "@/lib/api-client";
import type { Banner } from "@/lib/banners/schema";
import type { Producto } from "@/lib/catalogo/schema";

export type { Banner, Producto };

/** Catálogo que la tienda ve: ya filtrado por el servidor (activos, canal en línea). */
export interface ProductosResponse {
  ejemplo: boolean; // true → la UI muestra "Precios de ejemplo"
  productos: Producto[];
}

// Rutas públicas de la tienda (KARSO: /tienda); no requieren sesión.
export const tiendaApi = {
  productos: () => apiFetch<ProductosResponse>("/api/tienda/productos"),
  banners: () => apiFetch<{ banners: Banner[] }>("/api/tienda/banners"),
};
