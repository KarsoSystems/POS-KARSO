export const queryKeys = {
  sesion: ["sesion"],
  productos: ["tienda", "productos"],
  banners: ["tienda", "banners"],
  sucursales: ["tienda", "sucursales"],
  borrador: ["pedidos", "borrador"],
  pedidos: ["pedidos", "lista"],
  pedido: (id: string) => ["pedidos", "detalle", id],
  pedidoPorFolio: (folio: string) => ["pedidos", "folio", folio],
  demoPanel: ["demo-panel", "pedidos"],
} as const;
