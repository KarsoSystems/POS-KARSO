"use client";

import { useQuery } from "@tanstack/react-query";
import { tiendaApi } from "@/lib/tienda-api";
import { queryKeys } from "./query-keys";

/** Sucursales activas donde el cliente puede recoger (`{ ejemplo, sucursales }`). */
export function useSucursales() {
  return useQuery({ queryKey: queryKeys.sucursales, queryFn: tiendaApi.sucursales });
}
