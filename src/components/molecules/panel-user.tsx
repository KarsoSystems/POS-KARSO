"use client";

import { createContext, useContext } from "react";
import type { PublicUser } from "@/lib/auth-api";

const PanelUserContext = createContext<PublicUser | null>(null);

export const PanelUserProvider = PanelUserContext.Provider;

/** Usuario de la sesión dentro del panel (null mientras carga). */
export function usePanelUser(): PublicUser | null {
  return useContext(PanelUserContext);
}
