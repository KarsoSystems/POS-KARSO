"use client";

import { useQuery } from "@tanstack/react-query";
import { tiendaApi } from "@/lib/tienda-api";
import { queryKeys } from "./query-keys";

/** Banners activos y vigentes, por `orden`. */
export function useBanners() {
  return useQuery({
    queryKey: queryKeys.banners,
    queryFn: tiendaApi.banners,
    select: (data) => data.banners,
  });
}
