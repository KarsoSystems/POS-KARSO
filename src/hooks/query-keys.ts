export const queryKeys = {
  sesion: ["sesion"],
  catalogo: ["catalogo"],
  borrador: ["pedidos", "borrador"],
  pedidos: ["pedidos", "lista"],
  pedido: (id: string) => ["pedidos", "detalle", id],
} as const;
