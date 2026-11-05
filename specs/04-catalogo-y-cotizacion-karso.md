# SPEC 04 — Catálogo y cotización KARSO

> **Estado:** Approved
> **Depende de:** SPEC 01, SPEC 02, SPEC 03
> **Fecha:** 2026-11-05
> **Objetivo:** Reemplazar el precio por hoja de la SPEC 02 por el catálogo de KARSO (productos con variantes, atributos, medidas y especificaciones, simulados como si vinieran del panel) y el cálculo de la sección 5.4 de `KARSO-PROMPT-v1.md`, y mostrar en el inicio del panel los banners simulados.

---

## Por qué existe este spec

Con el socio se acordó `KARSO-PROMPT-v1.md` como contrato de todo el sistema: tienda (este repo), panel de administración (otro proyecto) y backend NestJS. Sus nombres de campos y reglas son obligatorios para que las partes encajen.

KARSO cobra **por variante**, no por hoja de impresión: precio por millar, unidad o paquete, por m² o por metro lineal, más acabados. El armado de planillas lo hace una persona en CorelDRAW, así que el acomodo y la vista previa de la hoja de la SPEC 02 dejan de tener sentido.

El panel no existe todavía: los productos y banners que él administra se **simulan** con JSON versionados, con la misma forma que devolverá el backend, para probar el look & feel.

**Regla de alcance de este repo:** lo que es solo del panel (roles, empleados, lotes, armado, mostrador, configuración) no entra. Lo que comparten panel y tienda sí, y los datos que provee el panel se simulan.

**Hoja de ruta acordada** (los números se asignan al crearlas):

1. **SPEC 04 (este)** — catálogo, cotización y banners.
2. SPEC 05 — archivos: frente y reverso, reglas y validación de la sección 5.7.
3. SPEC 06 — pago: sucursal de entrega, factura con IVA, promociones y Mercado Pago emulado.
4. SPEC 07 — seguimiento: 8 estatus, estatus por línea, fecha de entrega, QR, rechazo y corrección, simulador del panel.
5. SPEC 08 — perfil (socio, dirección, datos fiscales) y sesión con access/refresh y JWKS.

---

## Alcance

**Entra:**

- Productos simulados en `config/mock-panel/productos.json` con la forma de la sección 6.4 de KARSO: Volantes, Tarjetas, Imán, Adhesivo y Lona 13 oz. (detalle en el modelo de datos). Montos **en pesos**, como en KARSO, marcados `ejemplo: true`.
- Banners simulados en `config/mock-panel/banners.json` con la forma de la sección 6.8, e imágenes SVG de ejemplo en `public/mock/` (banners en escritorio y móvil, y una imagen por producto).
- `GET /api/tienda/productos` y `GET /api/tienda/banners`, públicos, ya filtrados por el servidor. Se retira `GET /api/catalogo`.
- Editor de línea:
  1. producto, elegido en tarjetas con imagen agrupadas por categoría;
  2. un selector por atributo, donde las combinaciones que no existen se muestran **deshabilitadas** con "No disponible para …";
  3. medida (fija mostrada, variable con ancho y alto y medidas rápidas, o metro lineal con el largo);
  4. especificaciones como casillas, solo las que aplican a la variante;
  5. cantidad con su unidad y equivalencia en piezas;
  6. descripción;
  7. cotización en vivo con el desglose de la sección 5.4.
- Cálculo de la sección 5.4 puro y compartido (front y servidor), en centavos internos y redondeado por línea.
- El borrador (sigue guardado en el servidor) adopta la forma de línea de KARSO (`productos[]` con `lineaId`) y los totales de KARSO (`subtotal`, `descuento`, `baseIva`, `tasaIva`, `iva`, `total`). Sin factura todavía: `tasaIva` 0 y la leyenda "Precios sin IVA. Si requieres factura, se suma al pagar".
- Línea del borrador y del detalle: producto, variante con atributos y SKU, medida, cantidad con su unidad, acabados con importe y desglose (base unitaria + acabados = importe unitario × cantidad = subtotal). Se mantienen editar, quitar, máximo 20 líneas y `problema`.
- Carrusel de banners en `/panel` (inicio): activos y vigentes, por `orden`, con flechas y desplazamiento, sin avance automático. Su `liga` abre el editor con el producto ya elegido.
- Se retiran el acomodo, el precio por hoja, `config/catalogo.json` y la vista previa de la hoja.
- `data/orders.json` pasa a versión 2. Los datos de la versión 1 se descartan.
- Tests de unidad, de route handlers y e2e.

**Fuera de alcance:**

- Frente y reverso, reglas de archivo de la sección 5.7, quitar PNG, 40 MB y validación de CMYK y dpi → SPEC 05. Aquí la línea sigue con **un** archivo (el actual), que cuenta como el frente.
- IVA por factura, datos fiscales, promociones y descuento, sucursal de entrega, Mercado Pago, folio `KAR-…` y estatus `pago_pendiente` → SPEC 06. "Hacer pedido", el folio `P-000001` y los estados de la SPEC 02 siguen igual hasta entonces.
- Estatus por línea, fecha de entrega, QR y rechazos → SPEC 07.
- Mover auth, archivos y pedidos a `/api/tienda`. Solo productos y banners se mueven en este spec.
- Catálogo público fuera del panel (sin sesión en la UI).
- Productos con datos pendientes en KARSO: tarjeta sulfatada, folder, notas, corte de vinil, DTF, planchado, sublimación y sand blast.
- Precios `cotizacion`, canal `mostrador`, `grupoArmado` como funcionalidad (solo se copia al pedido) y todo lo del panel.

---

## Modelo de datos

### Productos simulados (`config/mock-panel/productos.json`, en git)

Archivo: `{ "version": 1, "ejemplo": true, "productos": Producto[] }`. Cada producto sigue **exactamente** la forma de la sección 6.4 de KARSO, con montos en pesos.

```ts
// src/lib/catalogo/schema.ts (zod; el JSON se valida al cargarlo)
type Canal = "en_linea" | "mostrador";
type Volumen = "millar" | "unidad" | "paquete";
type PrecioPor = "volumen" | "m2" | "metro_lineal" | "cotizacion";
type TipoCobro = "fijo" | "por_volumen" | "por_m2" | "por_metro_lineal" | "por_pieza";
type Cara = "obligatorio" | "opcional" | "no_aplica";

interface ReglasArchivo {          // se valida y se guarda; se usa en la SPEC 05
  requiereArchivo: boolean;
  formatos: string[];
  colorRequerido: "CMYK" | "RGB" | "cualquiera";
  resolucionMinima: number;
  pesoMaximoMB: number;
  validarMedida: boolean;
}

interface Rango { min: number; max: number }

interface MedidaVariante {
  tipo: "fija" | "variable";
  unidad: "cm" | "m";
  ancho: Rango;                    // fija: min = max
  alto: Rango;                     // metro lineal: ancho fijo y el cliente captura alto (largo)
  rebase: number;
  tolerancia: number;
  permiteGirar: boolean;
  medidasRapidas: { nombre: string; ancho: number; alto: number }[];
}

interface Variante {
  varianteId: string;
  sku: string;                     // único
  nombre: string;                  // "Carta · Real · Couché 128 g"
  grupoArmado: string | null;
  atributos: Record<string, string>; // { tamano: "Carta", ajuste: "Real", papel: "Couché 128 g 4x4" }
  medida: MedidaVariante;
  volumen: Volumen;
  piezasPorPaquete: number | null; // solo con volumen "paquete"
  cantidadMinima: number;
  precioPor: PrecioPor;
  precio: number;                  // pesos, sin IVA
  cobroMinimo: number;             // pesos; aplica en m2 y metro_lineal
  diasEntrega: number;
  caras: { frente: Cara; reverso: Cara };
  canales: Canal[];
  activa: boolean;
  archivo?: Partial<ReglasArchivo>; // sobrescribe las del producto
}

interface Especificacion {
  id: number;
  nombre: string;                  // "Ojillos"
  tipoCobro: TipoCobro;
  precio: number;                  // pesos
  cadaMetros?: number;             // solo por_pieza
  precioTexto: string;             // "+$3.00 por ojillo (cada 50 cm)"
  variantes: string[] | null;      // null = todas las variantes del producto
  activa: boolean;
}

interface Producto {
  _id: string;
  nombre: string;
  categoria: string;               // "Tarjetas"
  descripcion: string;
  imagen: string;                  // en el mock: "/mock/productos/<slug>.svg"
  idSocio: number;                 // 0 = público general
  sucursales: string[];
  activo: boolean;
  orden: number;
  requiereArmado: boolean;
  archivo: ReglasArchivo;
  variantes: Variante[];
  especificaciones: Especificacion[];
  condicionesEspeciales: string[];
  creadoEn: string;
  actualizadoEn: string;
}
```

Reglas de validación del JSON, además de los tipos:

- Los `sku` y los `varianteId` son únicos.
- En medida `fija`, `min = max` en ancho y alto.
- `piezasPorPaquete` es obligatorio solo con `volumen: "paquete"`.
- `cadaMetros` es obligatorio solo con `por_pieza`.
- Las `variantes` de una especificación existen en su producto.

**Contenido del mock.** Sale de la sección 5.13 y la 6.4 de KARSO:

| Producto | Variantes | Atributos | Notas |
| --- | --- | --- | --- |
| Volante | Couché ajustado: ¼ carta, ½ carta, carta, oficio, tabloide, 4 cartas, 8 cartas, 4 oficios, 8 oficios. Couché real: ¼ carta, ½ carta, carta, oficio, tabloide, tríptico. Bond real: carta, oficio, 4 cartas, 8 cartas. | `tamano`, `ajuste`, `papel` | Medidas y precios de la tabla 5.13. Couché reverso `opcional`, bond `no_aplica`. Por millar, con armado. |
| Tarjeta | Couché, postal chica, postal grande, laminada, postal laminada chica, postal laminada grande, laminada barniz a registro, credencial PVC (por unidad) | `presentacion`, `acabadoBase` | Despunte, suaje y foliado, solo en las variantes por millar. |
| Imán | 100 piezas (paquete), 1,000 piezas (millar), metro lineal de 56 cm de ancho | `presentacion` | Igual que la sección 6.4. |
| Adhesivo | Carta 21 × 28, tabloide 28 × 42, 4 cartas 56 × 42 | `tamano` | Por millar, con armado, reverso `no_aplica`. |
| Lona 13 oz. | 720 dpi, urgente 720 dpi (**solo `mostrador`**), alta resolución 1200 dpi | `calidad`, `entrega` | Igual que la sección 6.4: ojillos, dobladillo y empalme. |

Supuestos del mock (se documentan en el JSON y el README):

- **Bond 4 cartas y 8 cartas:** usan las medidas de la fila de la tabla (56 × 42 y 56 × 87).
- **Variantes que KARSO no detalla:**
  - rebase 0.3 cm, tolerancia 0.1 y 5 días de entrega;
  - caras como su equivalente de la sección 6.4 (postales couché `opcional`, laminadas `obligatorio`);
  - grupo de armado `Adhesivos` para el adhesivo.
- **SKU e ids:** los de la sección 6.4 donde existen; los demás, consecutivos desde `70001001`.
- **Sucursales e imágenes:** todos los productos usan la sucursal `6720a1f0c1a2b3c4d5e60100` de KARSO; la imagen es local (`/mock/productos/…`).

### Banners simulados (`config/mock-panel/banners.json`, en git)

`{ "version": 1, "banners": Banner[] }`, con la forma de la sección 6.8:

```ts
// src/lib/banners/schema.ts
interface Banner {
  _id: string;
  titulo: string;
  imagen: string;                  // "/mock/banners/<slug>.svg"
  imagenMovil: string;             // "/mock/banners/<slug>-movil.svg"
  liga: string | null;             // en el mock: "/panel/pedidos/nuevo/item?producto=<_id>"
  orden: number;
  vigencia: { inicio: string; fin: string } | null; // ISO UTC; null = siempre
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}
```

El mock trae 4 banners: 2 activos sin vigencia (Tarjetas y Lonas), 1 activo con vigencia futura ("Buen Fin", del 13 al 17 nov 2026) y 1 inactivo. Así se prueban los filtros.

### API (forma de error del SPEC 01)

| Método y ruta | Respuesta | Notas |
| --- | --- | --- |
| `GET /api/tienda/productos` | `{ ejemplo: boolean, productos: Producto[] }` | Público. Solo productos `activo`, con sus variantes `activa` que incluyan `en_linea` y sus especificaciones `activa`. Ordenado por `orden`. Un producto sin variantes en línea no aparece. 500 `CATALOGO_INVALIDO` si el JSON no valida. |
| `GET /api/tienda/banners` | `{ banners: Banner[] }` | Público. Solo `activo` y vigentes en este momento (`inicio ≤ ahora ≤ fin`, o `vigencia: null`). Ordenado por `orden`. |

Las rutas de borrador y pedidos se quedan en `/api/pedidos/…`, con los mismos métodos y códigos de la SPEC 02. Cambia el cuerpo de las líneas:

```ts
// src/lib/validation/pedidos.ts — entrada de POST/PUT .../items
interface LineaInput {
  archivoId: string;
  descripcion: string;             // 0–500
  productoId: string;
  varianteId: string;
  medida: { ancho: number; alto: number } | null; // solo variantes "variable"; en metro lineal, ancho = el fijo
  especificaciones: number[];      // ids elegidos
  cantidad: number;                // entero, cantidadMinima–100,000
}
```

### Pedido (`src/server/domain/pedido.ts`)

Las líneas copian datos de la variante al guardarse, como pide KARSO. Usan los nombres de la sección 6.5 y los montos van **en pesos con 2 decimales**:

```ts
interface EspecificacionLinea {
  id: number;
  nombre: string;
  tipoCobro: TipoCobro;
  precio: number;
  unidades: number;                // 1, m², metros o piezas calculadas (ojillos: 14)
  importeUnitario: number;
}

interface LineaPedido {
  lineaId: string;
  productoId: string;
  varianteId: string;
  sku: string;
  nombre: string;                  // "Lona 13 oz."
  variante: string;                // "Lona 720 dpi"
  atributos: Record<string, string>;
  categoria: string;
  grupoArmado: string | null;
  volumen: Volumen;
  piezasPorPaquete: number | null;
  precioPor: PrecioPor;
  precioBase: number;
  cantidad: number;
  requiereArmado: boolean;
  diasEntrega: number;
  medida: { tipo: "fija" | "variable"; unidad: "cm" | "m"; ancho: number; alto: number; area: number | null }; // area en m², solo m2
  archivoId: string;               // temporal: en la SPEC 05 pasa a archivos.frente / archivos.reverso
  especificaciones: EspecificacionLinea[];
  descripcion: string;
  importeBaseUnitario: number;
  importeEspecificacionesUnitario: number;
  importeUnitario: number;
  subtotal: number;
  problema: string | null;         // propio del demo, no de KARSO
}

interface Pedido {
  id: string;
  folio: string | null;            // "P-000001" hasta la SPEC 06
  userId: string;
  estado: EstadoPedido;            // los de la SPEC 02 hasta la SPEC 06/07
  productos: LineaPedido[];        // antes `items`; máx. 20
  subtotal: number;
  descuento: number;               // 0 hasta la SPEC 06
  baseIva: number;
  tasaIva: number;                 // 0 sin factura (siempre, hasta la SPEC 06)
  iva: number;
  total: number;
  pago: { estado: "pendiente" };
  createdAt: string;
  updatedAt: string;
  confirmadoAt: string | null;
  canceladoAt: string | null;
}
```

`data/orders.json` pasa a `{ "version": 2, "ultimoFolio": number, "pedidos": Pedido[] }`. Si al leerlo encuentra `version: 1`, lo reemplaza por uno vacío de versión 2 y deja un aviso en el log. `data/archivos.json` y `uploads/` no cambian.

### Reglas de cálculo (`src/lib/pedidos/cotizacion.ts`, puras y compartidas)

Internamente todo se calcula en centavos enteros: `centavos(p) = Math.round(p × 100)`. Las medidas en cm se convierten a metros para m², perímetro y ojillos.

**Base unitaria**, según `precioPor`:

| `precioPor` | Importe |
| --- | --- |
| `volumen` | `precio` |
| `m2` | `max(round(ancho × alto × precio), cobroMinimo)` |
| `metro_lineal` | `max(round(alto × precio), cobroMinimo)` |

**Especificaciones, por unidad de volumen:**

| `tipoCobro` | Unidades | Importe |
| --- | --- | --- |
| `fijo`, `por_volumen` | 1 | `precio` |
| `por_m2` | área de la pieza en m² | `round(precio × área)` |
| `por_metro_lineal` | perímetro de la pieza en m | `round(precio × perímetro)` |
| `por_pieza` | `ceil(perímetro ÷ cadaMetros)` | `precio × unidades` |

**Línea:** `importeUnitario = base + Σ especificaciones` y `subtotal = importeUnitario × cantidad`.

**Pedido:**
- `subtotal = Σ subtotales`;
- `descuento = 0`;
- `baseIva = subtotal − descuento`;
- `iva = round(baseIva × tasaIva)`, con `tasaIva = 0`;
- `total = baseIva + iva`.

**Medida variable:** ancho y alto en metros con a lo más 2 decimales, dentro de `min`–`max`. En metro lineal el ancho es el fijo. El error dice el rango, por ejemplo "El ancho debe estar entre 0.50 y 5.00 m".

**Selectores** (`src/lib/catalogo/atributos.ts`):
- Los atributos van en el orden de las llaves de la primera variante.
- Las etiquetas salen de un mapa (`tamano` → "Tamaño", `acabadoBase` → "Acabado base"…); una llave desconocida se muestra capitalizada.
- Una opción está disponible si existe una variante con esa opción y con las elecciones anteriores.
- Cambiar una elección borra las posteriores que dejen de combinar.
- Un atributo con una sola opción posible se preselecciona.

**Problemas del borrador.** Al leer el borrador se recalcula cada línea con el catálogo vigente. La línea queda marcada con `problema` si:
- el producto o la variante ya no existen;
- la variante está inactiva o ya no se vende en línea;
- una especificación elegida ya no aplica;
- la medida quedó fuera de rango.

Las líneas marcadas conservan su último importe y bloquean "Hacer pedido" (409 `ITEMS_CON_PROBLEMAS`, como en la SPEC 02).

**Texto de la cantidad** (`src/lib/pedidos/formato.ts`):

| Volumen | Ejemplo |
| --- | --- |
| `millar` | "2 millares (2,000 piezas)", "1 millar (1,000 piezas)" |
| `paquete` | "3 paquetes de 100 (300 piezas)" |
| `unidad` | "2 piezas" |

### Rutas de UI

No cambian. `/panel/pedidos/nuevo/item` acepta además `?producto=<_id>` para llegar con el producto elegido. Un id que no existe o no se vende en línea se ignora.

---

## Plan de implementación

1. **Mock del panel.** `config/mock-panel/productos.json` y `banners.json` con el contenido descrito, esquemas zod en `src/lib/catalogo/schema.ts` (se reescribe) y `src/lib/banners/schema.ts`, y carga validada en `src/server/mock-panel.ts`. Las rutas de los archivos se pueden cambiar con `PRODUCTOS_PATH` y `BANNERS_PATH`, como hoy `CATALOGO_PATH`. Tests: el mock es válido; un SKU duplicado, una variante fija con `min ≠ max` y una especificación con una variante inexistente fallan, con la ruta del campo en el mensaje.
2. **Endpoints de la tienda.** `GET /api/tienda/productos` y `GET /api/tienda/banners` con los filtros de canal, activo y vigencia. Tests de rutas:
   - la lona urgente no aparece;
   - una variante inactiva no aparece;
   - un producto sin variantes en línea desaparece;
   - "Buen Fin" no aparece antes del 13 nov y sí con la fecha simulada dentro de su vigencia;
   - el banner inactivo nunca aparece;
   - responden sin sesión.

   `/api/catalogo` sigue vivo en este paso.
3. **Cálculo.** `src/lib/pedidos/cotizacion.ts` con `calcularLinea` y `calcularTotales`. Tests con los ejemplos de KARSO:
   - tarjeta couché × 2 con suaje: 115 + 40 = 155 → $310.00;
   - lona 2.00 × 1.50 × 2 con ojillos: 165 + 42 (14 ojillos) = 207 → $414.00;
   - los dos juntos: subtotal y total $724.00;
   - dobladillo en 2.00 × 1.50 = $70.00;
   - cobro mínimo de la lona en 0.50 × 0.50 = $100.00;
   - imán metro lineal de 3 m = $1,500.00;
   - redondeo a centavos por línea.
4. **Selectores.** `src/lib/catalogo/atributos.ts` (opciones por atributo con `disponible`, reinicio de elecciones posteriores y variante resuelta). Tests con volantes:
   - Tríptico deja "Ajustado" no disponible;
   - Bond solo combina con carta, oficio, 4 cartas y 8 cartas;
   - preselección de la opción única.
5. **Validación y evaluación de la línea.** `lineaSchema` en `src/lib/validation/pedidos.ts` y `evaluarLinea(productos, input)` en `src/lib/pedidos/linea.ts`, que reemplaza a `item.ts`:
   - resuelve la variante;
   - valida canal, activa, medida y rango, especificaciones aplicables y cantidad mínima;
   - devuelve la línea con su copia de datos o el campo con el error.

   Tests de cada regla y de los mensajes.
6. **Borrador y pedidos con el modelo nuevo.** Cambian `src/server/domain/pedido.ts`, el repositorio (versión 2, descarte de la versión 1), `src/server/pedidos/borrador.ts` y los route handlers de borrador, confirmar, lista, detalle y cancelar. También cambian los tipos de `src/lib/pedidos-api.ts`. Se borran `/api/catalogo`, `config/catalogo.json`, `acomodo.ts`, `presupuesto.ts`, `vista-previa.ts` e `item.ts` con sus tests. Tests de rutas:
   - agregar una línea válida;
   - una variante solo de mostrador → 422;
   - una medida fuera de rango → 422 con el rango;
   - la línea 21 → 409;
   - desactivar la variante en el mock marca `problema` y confirmar responde 409;
   - cambiar un precio recalcula el borrador pero no un pedido confirmado;
   - un `orders.json` de versión 1 se descarta.
7. **Hooks.** `useProductos` y `useBanners` en `src/hooks/` (reemplazan a `useCatalogo`), con llaves `productos` y `banners` en `query-keys.ts`. `use-pedidos.ts` adopta los tipos nuevos. Se actualizan los tests de hooks.
8. **Moléculas del editor.**
   - `selector-atributos`: botones; las opciones no disponibles van deshabilitadas con "No disponible para …".
   - `medida-variable`: ancho y alto, o largo, y medidas rápidas.
   - `especificaciones-linea`: casillas con `precioTexto`.
   - `resumen-pieza`: miniatura del archivo y texto de la medida, por ejemplo "8.7 × 5 cm · rebase 0.3 cm" o "2.00 × 1.50 m · 3.00 m²".
   - `cotizacion-linea`: el desglose de la sección 5.4.

   Se borra `vista-previa-hoja`.
9. **Editor de línea.** Se reescriben `use-editor-item.ts` y `editor-item.tsx`:
   1. archivo;
   2. producto en tarjetas por categoría;
   3. atributos;
   4. medida;
   5. especificaciones;
   6. cantidad con su unidad y equivalencia;
   7. descripción;
   8. cotización en vivo;
   9. "Guardar ítem".

   Lee `?producto=`. Editar una línea existente precarga todas las elecciones.
10. **Borrador, detalle y lista.** `item-resumen` con el contenido nuevo de la línea. `totales-pedido` muestra subtotal y total con la leyenda "Precios sin IVA. Si requieres factura, se suma al pagar". `detalle-pedido` y `fila-pedido` usan los campos nuevos. "Precios de ejemplo" se muestra con `ejemplo: true`.
11. **Banners.** SVG de ejemplo en `public/mock/banners/` y `public/mock/productos/`, con los colores del tema. El organismo `carrusel-banners` (con `<picture>` para escritorio y móvil, flechas, scroll-snap, sin avance automático y sin nada si no hay banners) se integra en `panel-inicio`.
12. **E2E.** Se reescriben `e2e/pedidos.spec.ts` y `pedidos-helpers.ts` (`editarProductos` en lugar de `editarCatalogo`, copia de `config/mock-panel/` para los tests) con los flujos de los criterios. Nuevo `e2e/banners.spec.ts`.
13. **Documentación.** El README suma el mock del panel (qué es, cómo editarlo y sus supuestos), las rutas `/api/tienda/*`, el cálculo de KARSO, que se retiran la hoja y el acomodo, el reinicio de `orders.json` y la tabla de specs con la hoja de ruta 04–08.

Entre los pasos 6 y 10 el editor y el borrador no están completos en la UI. La API y los tests siguen verdes en cada paso.

---

## Criterios de aceptación

- [ ] `config/mock-panel/productos.json` y `banners.json` pasan la validación. Con un mock inválido, `GET /api/tienda/productos` responde 500 `CATALOGO_INVALIDO` y el log indica el campo.
- [ ] `GET /api/tienda/productos` y `GET /api/tienda/banners` responden sin sesión y con montos en pesos. `GET /api/catalogo` responde 404.
- [ ] La lona urgente no aparece en la respuesta ni en el editor; la lona 720 y la de 1200 sí.
- [ ] En Volante, al elegir Tríptico la opción "Ajustado" aparece deshabilitada con "No disponible para Tríptico". Con papel Bond solo se pueden elegir Carta, Oficio, 4 cartas y 8 cartas.
- [ ] Tarjeta couché × 2 millares con suaje muestra base $115.00, acabados $40.00, importe unitario $155.00 y subtotal **$310.00**, en el editor y en el borrador.
- [ ] Lona 720 dpi de 2.00 × 1.50 m × 2 con ojillos muestra "3.00 m²", base $165.00, 14 ojillos por $42.00, importe unitario $207.00 y subtotal **$414.00**.
- [ ] Un borrador con esas dos líneas muestra subtotal y total **$724.00** y la leyenda "Precios sin IVA. Si requieres factura, se suma al pagar".
- [ ] Lona de 0.50 × 0.50 m cobra el mínimo de **$100.00**. Imán metro lineal de 3 m cuesta **$1,500.00** y el ancho de 0.56 m se muestra fijo.
- [ ] Una lona de 6 m de ancho no se puede guardar y muestra "El ancho debe estar entre 0.50 y 5.00 m". La medida rápida "Banner" llena 1.60 × 0.60.
- [ ] La credencial PVC no ofrece despunte, suaje ni foliado. La lona ofrece ojillos, dobladillo y empalme con su `precioTexto`.
- [ ] La cantidad se muestra como "2 millares (2,000 piezas)", "3 paquetes de 100 (300 piezas)" o "2 piezas" según el volumen.
- [ ] Editar una línea precarga producto, atributos, medida, especificaciones y cantidad, y la cotización se actualiza en vivo antes de guardar.
- [ ] Cambiar un precio en el mock recalcula el borrador y no altera un pedido ya confirmado.
- [ ] Desactivar en el mock una variante usada en el borrador marca la línea con su problema y "Hacer pedido" queda bloqueado (409 `ITEMS_CON_PROBLEMAS`).
- [ ] "Hacer pedido", el folio `P-000001`, "Mis pedidos", el detalle y "Cancelar pedido" funcionan como en la SPEC 02 con el modelo nuevo de líneas y totales.
- [ ] Un `data/orders.json` de versión 1 se reemplaza por uno vacío de versión 2 al primer uso, sin romper la app.
- [ ] El inicio del panel muestra el carrusel con los 2 banners vigentes en su `orden`. "Buen Fin" (vigencia futura) y el banner inactivo no aparecen. A 375 px se usa `imagenMovil`. No avanza solo.
- [ ] Pulsar un banner abre el editor con su producto ya elegido. Un `?producto=` inexistente abre el editor sin producto.
- [ ] Con `ejemplo: true`, el editor y el borrador muestran "Precios de ejemplo".
- [ ] `grep -rniE "acomodo|precioHoja|vista-previa-hoja|hojaId|papelId" src e2e` no encuentra nada, y no existe `config/catalogo.json`.
- [ ] A 375 px no hay scroll horizontal en el inicio, el editor, el borrador ni el detalle.
- [ ] Ningún componente importa de `src/server`. Las reglas de atomic design de la SPEC 03 siguen pasando en el lint.
- [ ] `pnpm test`, `pnpm test:e2e`, `pnpm lint` y `pnpm build` pasan.

---

## Decisiones

- **Sí:** `KARSO-PROMPT-v1.md` es el contrato. Nombres de campos, enums y reglas de la sección 5 se copian tal cual para que el backend y el panel encajen.
- **Sí:** se retiran el precio por hoja, el acomodo y la vista previa de la SPEC 02. KARSO cobra por variante y el armado lo hace una persona.
- **Sí:** el mock del panel va en `config/mock-panel/`, versionado en git. Es lo que el panel administrará; separarlo deja claro qué se reemplaza por el backend.
- **Sí:** montos del mock y de la API en pesos, como los ejemplos de KARSO. El cálculo interno se hace en centavos para evitar errores de redondeo. *Por confirmar con el socio:* si la API real devolverá pesos o centavos.
- **Sí:** catálogo del mock limitado a Volantes, Tarjetas, Imán, Adhesivo y Lona. Los demás productos tienen datos pendientes en la sección 8 de KARSO o no entran en el MVP.
- **Sí:** la lona urgente entra en el mock con canal solo `mostrador`, para probar que el filtro de canal funciona.
- **Sí:** el servidor filtra productos y banners. Así funcionarán las rutas `/tienda` del backend real, y el front no decide qué se vende en línea.
- **Sí:** productos y banners en `/api/tienda/*` desde ya. Auth, archivos y pedidos se quedan en `/api` hasta la spec que conecte con el backend real (decisión del usuario).
- **Sí:** `/api/tienda/productos` y `/api/tienda/banners` son públicos. KARSO define la tienda como pública; la UI de este spec sigue dentro del panel.
- **Sí:** las combinaciones inexistentes se muestran **deshabilitadas** con "No disponible para …" (decisión del usuario). Siguen sin poder elegirse, como pide KARSO.
- **No:** ocultar las combinaciones inexistentes.
- **Sí:** ojillos = `ceil(perímetro ÷ cadaMetros)`, y `por_m2` y `por_metro_lineal` con medidas en metros. KARSO no lo fija; con esta regla da 14 ojillos en su ejemplo.
- **Sí:** redondeo a centavos en cada importe unitario y subtotal por línea, como pide KARSO.
- **Sí:** medidas variables en metros con 2 decimales y medidas rápidas. En metro lineal solo se captura el largo.
- **Sí:** máximo técnico de 100,000 unidades de volumen por línea, igual que hoy, con `cantidadMinima` de la variante como mínimo. El negocio procesa pedidos de 100 millares o más, así que no hay tope de negocio por volumen. El máximo solo evita errores de captura y desbordes.
- **No:** un tope por volumen (por ejemplo, 100 millares). Limitaría pedidos reales grandes.
- **Sí:** el borrador sigue en el servidor, para que sea consistente entre dispositivos. En producción será una colección en Mongo, que hay que proponer al socio porque no está en las 10 colecciones de KARSO.
- **Sí:** la línea adopta la forma de la sección 6.5 (`productos[]`, `lineaId`, copia de datos y desglose) y el pedido los totales de KARSO. Así las SPEC 05–07 solo agregan campos.
- **Sí:** sin IVA hasta la SPEC 06 (`tasaIva` 0), con la leyenda. KARSO solo suma IVA si el cliente pide factura.
- **No:** mostrar IVA siempre. Contradice la sección 5.4 y habría que deshacerlo en la SPEC 06.
- **Sí:** "Hacer pedido", el folio `P-` y los estados de la SPEC 02 se quedan hasta las SPEC 06 y 07, para no mezclar pago y seguimiento en este spec.
- **Sí:** un solo archivo por línea, el actual, que cuenta como el frente. Frente, reverso y validación son la SPEC 05.
- **Sí:** los datos de `orders.json` de versión 1 se descartan. Son datos de prueba del demo.
- **No:** migrar los pedidos de la SPEC 02. No hay datos reales.
- **Sí:** el carrusel de banners es simple, con flechas y scroll-snap, sin avance automático. El avance automático es molesto y complica la accesibilidad.
- **Sí:** `liga` del banner al editor con `?producto=`. No existe todavía una página pública de producto.
- **Sí:** imágenes SVG locales en `public/mock/`. No hay imágenes reales y no dependen de servicios externos.
- **Sí:** se copia `grupoArmado` a la línea sin usarlo. KARSO lo pide en el pedido; el armado es del panel.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El backend real devuelve una forma distinta a la del mock (pesos o centavos, `_id` o `id`) | El mock copia la sección 6.4 al pie de la letra. La conversión a centavos vive solo en `cotizacion.ts`. La duda de pesos o centavos queda como "por confirmar". |
| Errores de punto flotante en m² y perímetros (2.00 × 1.50 × 55) | Todo se pasa a centavos y se redondea una vez por importe. Los tests usan los ejemplos de KARSO con resultado exacto. |
| El cálculo del front y el del servidor divergen | Es la misma función pura de `src/lib/pedidos/`. El servidor recalcula y manda. |
| Muchas variantes de volantes hacen pesado el selector | Los selectores en cascada reducen las opciones. Las no disponibles se ven deshabilitadas en lugar de multiplicar listas. |
| Cambiar el mock deja líneas inválidas en el borrador | Se recalcula al leer, se marca `problema` y se bloquea la confirmación (como en la SPEC 02). |
| Supuestos del mock (caras, rebase, SKU) confundidos con datos reales | `ejemplo: true` muestra "Precios de ejemplo". Los supuestos se listan en el README y la sección 8 de KARSO los deja pendientes. |
| Pantallas rotas entre los pasos 6 y 10 | La API y los tests siguen verdes. La UI se completa antes de los e2e (paso 12). |
| Vigencia de banners dependiente de la hora | El filtro compara en UTC. Los tests de rutas inyectan la fecha actual. |

---

## Lo que **no** está en este spec

- Frente y reverso, reglas de archivo y validación de CMYK y dpi (SPEC 05).
- Factura e IVA, promociones, sucursal de entrega, Mercado Pago, folio `KAR-` y `pago_pendiente` (SPEC 06).
- Estatus por línea, fecha de entrega, QR y rechazos (SPEC 07).
- Perfil y sesión con access/refresh (SPEC 08).
- Mover auth, archivos y pedidos a `/api/tienda`.
- Página pública de catálogo o de producto.
- Productos con datos pendientes en KARSO, precios por cotización, mostrador y todo lo del panel.

Cada uno de estos, si llega, va en su propio spec.
