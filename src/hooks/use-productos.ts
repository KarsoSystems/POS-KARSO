"use client";

import { useQuery } from "@tanstack/react-query";
import { tiendaApi } from "@/lib/tienda-api";
import { queryKeys } from "./query-keys";

/** Productos que se venden en línea (`{ ejemplo, productos }`), por `orden`. */
export function useProductos() {
  return useQuery({ queryKey: queryKeys.productos, queryFn: tiendaApi.productos });
}
