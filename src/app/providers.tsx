"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

/**
 * Sin reintentos ni recarga al volver a la pestaña: así se comportaba la app
 * antes de React Query. `staleTime: 0` deja el catálogo siempre fresco (SPEC 02).
 */
export function crearQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(crearQueryClient);
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="tema">
      <QueryClientProvider client={queryClient}>
        {children}
        {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
