export const queryKeys = {
  sesion: ["sesion"],
  productos: ["tienda", "productos"],
  banners: ["tienda", "banners"],
  sucursales: ["tienda", "sucursales"],
  borrador: ["pedidos", "borrador"],
  pedidos: ["pedidos", "lista"],
  pedido: (id: string) => ["pedidos", "detalle", id],
} as const;
