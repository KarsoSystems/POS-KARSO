"use client";

import { useQuery } from "@tanstack/react-query";
import { pedidosApi } from "@/lib/pedidos-api";
import { queryKeys } from "./query-keys";

export function useCatalogo() {
  return useQuery({
    queryKey: queryKeys.catalogo,
    queryFn: pedidosApi.catalogo,
    select: (data) => data.catalogo,
  });
}
