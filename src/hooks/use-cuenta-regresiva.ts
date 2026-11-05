"use client";

import { useEffect, useState } from "react";

/** Segundos que faltan, bajando de uno en uno hasta 0. `reiniciar(n)` vuelve a empezar desde n. */
export function useCuentaRegresiva(inicial: number) {
  const [segundos, setSegundos] = useState(inicial);

  useEffect(() => {
    if (segundos <= 0) return;
    const id = setTimeout(() => setSegundos((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [segundos]);

  return { segundos, reiniciar: setSegundos };
}
