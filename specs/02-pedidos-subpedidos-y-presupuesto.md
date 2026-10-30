# SPEC 02 — Pedidos, subpedidos y presupuesto

> **Estado:** Approved
> **Depende de:** SPEC 01
> **Fecha:** 2026-10-30
> **Objetivo:** Que el cliente arme un pedido con uno o más subpedidos (archivo, producto, tamaño, papel, hoja y cantidad), vea el presupuesto por hoja de impresión con una vista previa a escala del acomodo y lo confirme con folio, sin pago todavía.

---

## Por qué existe este spec

Es el corazón del negocio: hoy el cliente llega al local con su archivo, dice qué imprimir, de qué tamaño y cuántas piezas, y en mostrador se le cotiza. Este spec lleva ese proceso al panel.

La imprenta es mayorista y cobra **por hoja de impresión** (tabloide o mesa). Por eso el presupuesto no es una tabla de precios por producto: se calcula cuántas piezas caben en la hoja y cuántas hojas hacen falta.

**Cambio en la hoja de ruta del SPEC 01:** este spec toma el número 02 (antes reservado para "Perfil") porque pedidos es lo más valioso. La nueva hoja de ruta queda:

1. SPEC 01 — base y autenticación (implementado).
2. **SPEC 02 (este)** — pedidos, subpedidos, presupuesto y vista previa simple.
3. Spec futuro — pago y envío.
4. Spec futuro — perfil: datos, direcciones e información de pago.
5. Spec futuro — acomodo avanzado / vista previa editable.
6. Spec futuro — panel de la imprenta (mover estados, ver pedidos de todos).

Los números de los specs futuros se asignan al crearlos.

---

## Alcance

**Entra:**

- Catálogo versionado en `config/catalogo.json`: hojas (tabloide y mesa), margen y separación, papeles con precio por hoja (sin IVA), productos con sus tamaños predefinidos y papeles permitidos. Viene con **valores de ejemplo** marcados como tales.
- Subida de archivos JPG, PNG, PDF, AI y PSD, de hasta 50 MB, a `uploads/` mediante una interfaz de almacenamiento intercambiable (después S3).
- Un pedido **borrador** por cliente, guardado en el servidor; sobrevive recargas.
- Subpedidos (ítems) del borrador: agregar, editar y quitar. Cada uno tiene archivo, descripción opcional, producto, tamaño (predefinido o personalizado en cm), papel, hoja elegida por el cliente y cantidad.
- Cálculo de acomodo: piezas por hoja en cuadrícula, con margen, separación y prueba de giro de 90°.
- Presupuesto por ítem (hojas × precio por hoja) y del pedido (subtotal, IVA 16 % desglosado y total), en MXN y en centavos.
- Presupuesto en vivo en el editor del ítem, con la misma función que usa el servidor.
- Vista previa simple: SVG a escala de la hoja elegida con la cuadrícula de piezas y la imagen en cada una (rectángulo con el nombre del archivo para PDF/AI/PSD).
- "Hacer pedido": con 0 ítems muestra un aviso con "Regresar al pedido" e "Ir al inicio del panel". Con 1 a 20 ítems congela precios, asigna folio `P-000001` y pasa a estado `pedido`, con el pago como "Pago pendiente".
- "Mis pedidos" habilitado en el menú: lista, detalle y cancelar mientras el estado sea `pedido`.
- Estados del pedido: `borrador`, `pedido`, `en_proceso`, `entregado` y `cancelado`. El cliente solo confirma y cancela; `en_proceso` y `entregado` se cambian a mano en el JSON en el demo.
- Tests de unidad, de route handlers y e2e.

**Fuera de alcance (specs futuros):**

- Pago (simulado o real) y envío a domicilio.
- Perfil, direcciones e información de pago.
- Panel de la imprenta, roles y cambio de estados desde la UI.
- Acomodo mixto (piezas en distintas orientaciones en la misma hoja) y edición manual del acomodo.
- Elegir la hoja automáticamente por costo.
- Miniaturas o conversión de PDF, AI y PSD.
- Limpieza automática de archivos subidos que nunca se usaron.
- Notificaciones (correo o WhatsApp) de cambio de estado.
- Factura (CFDI).
- MongoDB y S3 reales.

---

## Modelo de datos

### Catálogo (`config/catalogo.json`, en git)

```ts
// src/lib/catalogo/schema.ts (zod; el JSON se valida al cargarlo)
interface Catalogo {
  version: 1;
  ejemplo: boolean;          // true → la UI muestra "Precios de ejemplo"
  margenCm: number;          // margen no imprimible de la hoja (ejemplo: 0.5)
  separacionCm: number;      // espacio entre piezas para el corte (ejemplo: 0.3)
  tasaIva: number;           // 0.16
  hojas: Hoja[];
  papeles: Papel[];
  productos: Producto[];
}

interface Hoja {
  id: "tabloide" | "mesa" | string;
  nombre: string;            // "Tabloide"
  anchoCm: number;           // orientación vertical: ancho < alto
  altoCm: number;
}

interface Papel {
  id: string;                // "couche-150"
  nombre: string;            // "Couché 150 g"
  precioHojaCentavos: Record<Hoja["id"], number>; // sin IVA, por hoja
}

interface Producto {
  id: string;                // "volante"
  nombre: string;            // "Volante"
  tamanos: TamanoPredefinido[];
  papelesIds: Papel["id"][];
}

interface TamanoPredefinido {
  id: string;                // "media-carta"
  nombre: string;            // "Media carta"
  anchoCm: number;
  altoCm: number;
}
```

**Valores de ejemplo** (`ejemplo: true`; la imprenta los reemplaza):

| Hoja | Medidas |
| --- | --- |
| Tabloide | 27.9 × 43.2 cm |
| Mesa | 33.0 × 48.3 cm |

| Papel | Tabloide | Mesa |
| --- | --- | --- |
| Bond 90 g | $3.00 | $4.00 |
| Couché 150 g | $5.00 | $6.50 |
| Couché 300 g | $8.00 | $10.00 |

| Producto | Tamaños predefinidos | Papeles |
| --- | --- | --- |
| Volante | Cuarto de carta 10.8 × 14, media carta 14 × 21.6, carta 21.6 × 27.9 | Bond 90, Couché 150 |
| Cartel | Tabloide 27.9 × 43.2 | Couché 150, Couché 300 |
| Tarjeta | Estándar 9 × 5 | Couché 300 |

Margen 0.5 cm y separación 0.3 cm. Todos los productos aceptan además tamaño personalizado.

### Archivos

```ts
// src/server/domain/archivo.ts
type ExtensionPermitida = "jpg" | "jpeg" | "png" | "pdf" | "ai" | "psd";

interface Archivo {
  id: string;                // UUID; nombre en disco: uploads/<id>.<ext>
  userId: string;            // dueño; solo él puede leerlo
  nombreOriginal: string;    // "cartel-perro.jpg"
  extension: ExtensionPermitida;
  mime: string;
  bytes: number;             // ≤ 50 MB (52_428_800)
  previsualizable: boolean;  // true solo para jpg/jpeg/png
  createdAt: string;
}

// src/server/storage/file-storage.ts — interfaz; el demo usa disco local
interface FileStorage {
  put(key: string, data: ReadableStream<Uint8Array>): Promise<void>;
  get(key: string): Promise<ReadableStream<Uint8Array> | null>;
  delete(key: string): Promise<void>;
}
```

### Pedidos

```ts
// src/server/domain/pedido.ts
type EstadoPedido = "borrador" | "pedido" | "en_proceso" | "entregado" | "cancelado";

type Tamano =
  | { tipo: "predefinido"; tamanoId: string }
  | { tipo: "personalizado"; anchoCm: number; altoCm: number };

interface Acomodo {
  piezasPorHoja: number;     // 0 = no cabe
  columnas: number;
  filas: number;
  rotada: boolean;           // la pieza se giró 90° para acomodar más
}

interface PresupuestoItem {
  acomodo: Acomodo;
  hojas: number;             // ⌈cantidad ÷ piezasPorHoja⌉
  precioHojaCentavos: number;
  subtotalCentavos: number;  // hojas × precioHojaCentavos
}

interface Subpedido {
  id: string;
  archivoId: string;
  descripcion: string;       // 0–500 caracteres
  productoId: string;
  tamano: Tamano;
  anchoCm: number;           // medidas resueltas (predefinido o personalizado)
  altoCm: number;
  papelId: string;
  hojaId: string;
  cantidad: number;          // entero 1–100,000
  presupuesto: PresupuestoItem;
  problema: string | null;   // p. ej. "El papel ya no existe en el catálogo"
}

interface Totales {
  subtotalCentavos: number;
  ivaCentavos: number;       // round(subtotal × tasaIva)
  totalCentavos: number;
  tasaIva: number;
}

interface Pedido {
  id: string;                // UUID
  folio: string | null;      // "P-000001", se asigna al confirmar
  userId: string;
  estado: EstadoPedido;
  items: Subpedido[];        // máx. 20
  totales: Totales;          // en borrador se recalcula; al confirmar se congela
  pago: { estado: "pendiente" };
  createdAt: string;
  updatedAt: string;
  confirmadoAt: string | null;
  canceladoAt: string | null;
}
```

**Archivos de persistencia demo** (fuera de git):

```
data/orders.json    // { "version": 1, "ultimoFolio": 0, "pedidos": Pedido[] }
data/archivos.json  // { "version": 1, "archivos": Archivo[] }
uploads/<id>.<ext>  // binarios; carpeta configurable con UPLOADS_DIR
```

### Reglas de cálculo (`src/lib/pedidos/`, puras y compartidas cliente/servidor)

- **Área útil** de la hoja: `(anchoCm − 2·margenCm) × (altoCm − 2·margenCm)`.
- **Piezas por eje:** `⌊(útil + separación) ÷ (pieza + separación)⌋`.
- Se calcula con la pieza normal y girada 90° y se usa la que da más piezas. En empate, la normal.
- `piezasPorHoja = 0` significa que la pieza no cabe en esa hoja. El ítem no se puede guardar y el error dice en qué hoja sí cabe, si cabe en alguna.
- **IVA:** `Math.round(subtotal × tasaIva)` sobre el subtotal del pedido, no por ítem.

### API (`/api/*`, solo con sesión en estado `activo`; forma de error del SPEC 01)

| Método y ruta | Uso | Errores principales |
| --- | --- | --- |
| `GET /api/catalogo` | catálogo vigente | 401 |
| `POST /api/archivos` | subir archivo (multipart, campo `archivo`) | 413 > 50 MB, 415 extensión no permitida |
| `GET /api/archivos/:id` | descargar o ver archivo propio | 404 si no existe o no es del usuario |
| `GET /api/pedidos/borrador` | borrador del usuario (lo crea si no hay), recalculado | — |
| `POST /api/pedidos/borrador/items` | agregar ítem | 422 validación o no cabe, 409 con 20 ítems |
| `PUT /api/pedidos/borrador/items/:itemId` | editar ítem | 404, 422 |
| `DELETE /api/pedidos/borrador/items/:itemId` | quitar ítem (y su archivo si nadie más lo usa) | 404 |
| `POST /api/pedidos/borrador/confirmar` | "Hacer pedido" | 422 `PEDIDO_VACIO`, 409 `ITEMS_CON_PROBLEMAS` |
| `GET /api/pedidos` | pedidos del usuario, sin el borrador, recientes primero | — |
| `GET /api/pedidos/:id` | detalle | 404 si no es del usuario |
| `POST /api/pedidos/:id/cancelar` | cancelar | 409 si el estado no es `pedido` |

### Rutas de UI (bajo `/panel`, ya protegidas por el middleware del SPEC 01)

| Ruta | Pantalla |
| --- | --- |
| `/panel/pedidos` | Mis pedidos: lista con folio, fecha, número de ítems, total y estado; botón "Nuevo pedido" |
| `/panel/pedidos/nuevo` | Borrador: ítems con miniatura y subtotal, totales, "Agregar ítem", "Hacer pedido" |
| `/panel/pedidos/nuevo/item` | Editor de ítem nuevo |
| `/panel/pedidos/nuevo/item/[itemId]` | Editor de un ítem existente |
| `/panel/pedidos/[id]` | Detalle de un pedido confirmado, con "Cancelar" si está en `pedido` |

---

## Plan de implementación

1. **Catálogo.** `config/catalogo.json` con los valores de ejemplo, esquema zod en `src/lib/catalogo/schema.ts` y carga validada en `src/server/catalogo.ts` (un JSON inválido lanza un error con la ruta del campo). `GET /api/catalogo`. Tests: el catálogo de ejemplo es válido y uno con un papel inexistente en un producto falla.
2. **Acomodo.** `src/lib/pedidos/acomodo.ts` con `calcularAcomodo(pieza, hoja, margenCm, separacionCm)`. Tests con casos a mano: media carta en tabloide, giro que gana, empate, pieza que no cabe y pieza exacta al área útil.
3. **Presupuesto.** `src/lib/pedidos/presupuesto.ts`: presupuesto de un ítem y totales del pedido en centavos con IVA. Tests: hojas redondeadas hacia arriba, IVA redondeado sobre el subtotal y cantidad múltiplo exacto de piezas por hoja.
4. **Dominio y validación.** Tipos en `src/server/domain/pedido.ts` y `archivo.ts`. Esquemas zod en `src/lib/validation/pedidos.ts` (ítem: tamaño, cantidad 1–100,000, descripción ≤ 500). Tests de cada regla.
5. **Almacenamiento de archivos.** `src/server/storage/file-storage.ts` (interfaz) y `local-file-storage.ts` (`UPLOADS_DIR`, por defecto `./uploads`, escritura en streaming a archivo temporal + rename). `JsonArchivoRepository` sobre `data/archivos.json`. Tests en un directorio temporal.
6. **Endpoints de archivos.** `POST /api/archivos`: rechaza por `Content-Length` > 50 MB antes de leer el cuerpo y valida la extensión. `GET /api/archivos/:id` responde con el `Content-Type` guardado y solo al dueño. Tests: 201, 413, 415 y 404 para otro usuario.
7. **Repositorio de pedidos.** `JsonPedidoRepository` sobre `data/orders.json`: `findBorrador`, `crearBorrador`, `findById`, `listByUser`, `update` y `confirmar` (asigna el folio desde `ultimoFolio` dentro del mismo lock). Tests: un solo borrador por usuario y folios consecutivos con confirmaciones concurrentes.
8. **Endpoints del borrador.** `GET /api/pedidos/borrador` y `POST/PUT/DELETE .../items`. Validan contra el catálogo (producto, tamaño, papel permitido, hoja) y que el archivo sea del usuario. Calculan el presupuesto en el servidor y marcan `problema` si el catálogo cambió. Tests: ítem válido, no cabe (422 con la hoja alternativa), papel no permitido, ítem 21 (409) y borrar libera el archivo.
9. **Confirmar, listar, detalle y cancelar.** Endpoints restantes. Tests:
   - 0 ítems → 422 `PEDIDO_VACIO`;
   - un ítem con problema → 409;
   - confirmar congela los totales: cambiar el catálogo después no los altera;
   - folio `P-000001`;
   - después de confirmar, `GET borrador` crea uno nuevo vacío;
   - cancelar en `pedido` → `cancelado`; en `en_proceso` → 409;
   - el pedido de otro usuario → 404.
10. **Cliente HTTP del front.** `apiFetch` acepta `FormData` (sin `content-type` manual). `src/lib/pedidos-api.ts` con una función por endpoint. La subida usa `XMLHttpRequest` para reportar el progreso. Tests con `fetch` simulado.
11. **Menú y lista.** "Mis pedidos" deja de ser "Próximamente" y la tarjeta de Inicio enlaza a la lista. `/panel/pedidos` con lista, estado vacío ("Aún no tienes pedidos") y "Nuevo pedido". Insignia de color por estado.
12. **Pantalla del borrador.** `/panel/pedidos/nuevo`: ítems (miniatura o ícono, producto, tamaño, papel, hoja, cantidad, hojas, subtotal, editar y quitar), totales con IVA desglosado y aviso "Precios de ejemplo" si `catalogo.ejemplo`. "Hacer pedido" con 0 ítems abre el aviso "No has agregado nada a tu pedido" con "Regresar al pedido" e "Ir al inicio del panel".
13. **Editor de ítem.** Pasos en una sola pantalla:
    1. archivo (arrastrar o elegir, con barra de progreso);
    2. producto → tamaño predefinido o personalizado → papel → hoja;
    3. cantidad y descripción;
    4. presupuesto en vivo;
    5. "Guardar ítem", que vuelve al borrador.

    Los errores de "no cabe" se muestran junto a la hoja.
14. **Vista previa.** `src/components/pedidos/vista-previa-hoja.tsx`: SVG con `viewBox` en milímetros de la hoja, margen punteado y cuadrícula de piezas. Cada pieza lleva la imagen con `preserveAspectRatio="xMidYMid meet"`, girada si `rotada`, o un rectángulo con el nombre del archivo si no es previsualizable. Debajo, la leyenda "Mesa 33 × 48.3 cm · 6 piezas por hoja · 17 hojas". Se integra en el editor y en el detalle.
15. **Detalle y confirmación.** "Hacer pedido" con ítems → `/panel/pedidos/[id]?confirmado=1` con el aviso "Pedido P-000001 recibido". El detalle muestra folio, estado, fechas, ítems con vista previa, totales congelados y "Pago pendiente". "Cancelar pedido" pide confirmación y solo aparece en `pedido`.
16. **E2E.** `e2e/pedidos.spec.ts` con los flujos de los criterios de aceptación. Usa archivos de prueba en `e2e/fixtures/` y `UPLOADS_DIR` temporal.
17. **Documentación.** `.gitignore` con `/uploads/`. El README suma rutas, el catálogo (cómo editarlo), `UPLOADS_DIR`, cómo reiniciar los pedidos y la tabla de specs con la hoja de ruta nueva.

---

## Criterios de aceptación

- [ ] `config/catalogo.json` de ejemplo pasa la validación. Con un catálogo inválido, `GET /api/catalogo` responde 500 y el log del servidor indica el campo que falla.
- [ ] Con el catálogo de ejemplo (margen 0.5, separación 0.3), media carta (14 × 21.6) da **2 piezas por hoja en tabloide** (girada, 1 columna × 2 filas) y **4 en mesa** (sin girar, 2 × 2).
- [ ] 1,000 volantes media carta en couché 150: en tabloide dan 500 hojas y subtotal **$2,500.00**; en mesa, 250 hojas y **$1,625.00**. La UI y `orders.json` muestran lo mismo.
- [ ] Un pedido con subtotal $2,500.00 muestra IVA **$400.00** y total **$2,900.00**. El IVA es `round(subtotal × 0.16)` sobre el subtotal del pedido, en centavos.
- [ ] Un cartel tabloide (27.9 × 43.2) en hoja tabloide muestra "No cabe en Tabloide; sí cabe en Mesa" y no se puede guardar.
- [ ] Se pueden subir JPG, PNG, PDF, AI y PSD. Un `.exe` o `.docx` muestra "Formato no permitido" y un archivo > 50 MB muestra "El archivo supera 50 MB", sin guardarse en `uploads/`.
- [ ] JPG y PNG muestran miniatura en el borrador y la imagen en la vista previa. PDF, AI y PSD muestran un ícono con el nombre del archivo.
- [ ] `GET /api/archivos/:id` de un archivo de otro usuario responde 404.
- [ ] El borrador sobrevive a recargar la página y a cerrar y abrir sesión.
- [ ] Se puede editar un ítem (cambiar hoja o cantidad) y el presupuesto se actualiza en vivo antes de guardar.
- [ ] Quitar un ítem borra su archivo de `uploads/` si ningún otro ítem lo usa.
- [ ] El ítem 21 no se puede agregar y se muestra "Máximo 20 ítems por pedido".
- [ ] La vista previa dibuja la hoja elegida con tantas piezas como `piezasPorHoja`, giradas si `rotada`, y la leyenda con medidas, piezas por hoja y hojas.
- [ ] "Hacer pedido" con 0 ítems muestra "No has agregado nada a tu pedido" con "Regresar al pedido" (cierra el aviso) e "Ir al inicio del panel" (lleva a `/panel`), y la API responde 422 `PEDIDO_VACIO`.
- [ ] "Hacer pedido" con ítems lleva al detalle con "Pedido P-000001 recibido" (primer pedido del demo), estado "Pedido" y "Pago pendiente".
- [ ] Después de confirmar, `/panel/pedidos/nuevo` muestra un borrador vacío.
- [ ] Cambiar un precio en `config/catalogo.json` no altera los totales de un pedido ya confirmado y sí recalcula el borrador.
- [ ] Si el catálogo deja de tener el papel o el producto de un ítem del borrador, el ítem muestra el problema y "Hacer pedido" queda bloqueado (409 `ITEMS_CON_PROBLEMAS`).
- [ ] "Mis pedidos" está habilitado en el menú y lista los pedidos confirmados con folio, fecha, ítems, total y estado; sin pedidos muestra "Aún no tienes pedidos".
- [ ] "Cancelar pedido" en estado `pedido` lo pasa a `cancelado`. Si el JSON se edita a `en_proceso`, el botón no aparece y la API responde 409.
- [ ] Con `ejemplo: true` en el catálogo, el borrador y el editor muestran "Precios de ejemplo".
- [ ] A 375 px no hay scroll horizontal en la lista, el borrador, el editor y el detalle.
- [ ] Ningún componente importa de `src/server`.
- [ ] `pnpm test`, `pnpm test:e2e`, `pnpm lint` y `pnpm build` pasan.

---

## Decisiones

- **Sí:** este spec es el 02 y la hoja de ruta se reordena. Pedidos es lo más valioso; el perfil puede esperar.
- **Sí:** vista previa simple dentro de este spec. Explica el precio (piezas por hoja) y el cálculo de acomodo ya existe aquí.
- **No:** pago en este spec. Pedidos, archivos, precios y vista previa ya son cuatro áreas; el pago va en el siguiente.
- **Sí:** precio por hoja de impresión. Es como cobra una imprenta mayorista y se deriva del acomodo.
- **No:** tabla fija por producto. Obliga a capturar cada combinación y no refleja el costo real.
- **No:** cotización manual de la imprenta. Necesita un panel de administración que no existe.
- **Sí:** la hoja la elige el cliente. Decisión del negocio; el error de "no cabe" sugiere la otra hoja.
- **No:** elegir la hoja automáticamente por costo. Queda para otro spec.
- **Sí:** acomodo en cuadrícula con margen, separación y prueba de giro. Es predecible y fácil de explicar en la vista previa.
- **No:** acomodo mixto. Es más complejo y se puede agregar sin cambiar el modelo (`Acomodo` crecería).
- **Sí:** catálogo en `config/catalogo.json`, versionado en git y validado con zod. La imprenta ajusta precios sin tocar código, y el historial de git muestra los cambios.
- **No:** catálogo dentro de `data/`. Es configuración, no datos de usuarios, y debe viajar con el repo.
- **Sí:** valores de ejemplo con `ejemplo: true` y aviso visible. Evita que un precio inventado pase por real.
- **Sí:** productos del catálogo con tamaños y papeles permitidos, más tamaño personalizado. Cubre lo común rápido y lo especial sin bloquear.
- **Sí:** aceptar AI y PSD sin miniatura. Son los formatos con los que llegan los clientes; convertirlos es otro spec.
- **Sí:** 50 MB por archivo, 20 ítems por pedido y de 1 a 100,000 piezas por ítem.
- **Sí:** almacenamiento de archivos detrás de `FileStorage`. El demo usa disco; S3 se agrega sin tocar los endpoints.
- **Sí:** archivos servidos por `GET /api/archivos/:id` con verificación de dueño. Los archivos de clientes no son públicos.
- **No:** servir `uploads/` como estático. Cualquiera con la URL los vería.
- **Sí:** borrador guardado en el servidor, uno por cliente. Sobrevive recargas y las imágenes se suben mientras se arma.
- **Sí:** cálculo puro en `src/lib/pedidos/` compartido por cliente y servidor. Presupuesto en vivo sin un endpoint extra; el servidor recalcula y manda.
- **Sí:** dinero en centavos (enteros) e IVA 16 % desglosado sobre el subtotal del pedido. Evita errores de redondeo y es lo que esperan los mayoristas.
- **Sí:** precios congelados al confirmar. Un pedido confirmado no cambia aunque cambie el catálogo.
- **Sí:** folio `P-000001` asignado al confirmar, con el contador dentro de `orders.json`. No toca `counters.json` del SPEC 01 y no gasta folios en borradores.
- **Sí:** el cliente solo confirma y cancela (mientras está en `pedido`); `en_proceso` y `entregado` se editan a mano en el demo. El panel de la imprenta es otro spec.
- **Sí:** "Hacer pedido" habilitado con 0 ítems, mostrando un aviso. Es el comportamiento pedido: explica qué falta y ofrece salidas.
- **Sí:** descripción del ítem opcional (0–500). Ayuda a la imprenta pero no debe frenar el pedido.
- **Sí:** subida con `XMLHttpRequest` para mostrar progreso. `fetch` no reporta el avance de subida en los navegadores actuales.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Archivos de 50 MB cargados en memoria | La subida se escribe en streaming a disco; se rechaza por `Content-Length` antes de leer. El middleware no corre en `/api/*`, así que no aplica su límite de cuerpo. |
| Archivos subidos que nunca se usan (el cliente abandona el editor) | Quedan asociados al usuario en `archivos.json`. La limpieza automática queda fuera de alcance y está documentada en el README. |
| El catálogo cambia y deja ítems del borrador inválidos | Recalcular al leer el borrador; marcar `problema` y bloquear la confirmación con 409. |
| Precios de ejemplo confundidos con reales | `ejemplo: true` muestra "Precios de ejemplo" en el borrador y el editor. |
| Extensión engañosa (un `.exe` renombrado a `.jpg`) | En el demo se valida la extensión y el archivo nunca se ejecuta ni se sirve como HTML: `Content-Type` fijo por extensión y `Content-Disposition` adecuado. La verificación por contenido (magic bytes) va con S3. |
| Folios duplicados por confirmaciones simultáneas | El folio se asigna dentro del lock de `orders.json` (almacén JSON del SPEC 01). |
| Redondeo de dinero | Todo en centavos enteros; el IVA se redondea una sola vez sobre el subtotal. |
| PSD o AI enormes en la vista previa | Nunca se cargan en el navegador; solo se dibuja un rectángulo con el nombre. |

---

## Lo que **no** está en este spec

- Pago y envío.
- Perfil, direcciones e información de pago.
- Panel de la imprenta y cambio de estados desde la UI.
- Acomodo mixto, acomodo editable y elección automática de hoja.
- Miniaturas de PDF, AI y PSD.
- Limpieza de archivos huérfanos.
- Notificaciones y factura.
- MongoDB y S3 reales.

Cada uno de estos, si llega, va en su propio spec.
