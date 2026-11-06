# Portal de clientes — imprenta

Tienda en línea de **KARSO**, imprenta offset con 3 sucursales: los clientes cotizan, suben sus archivos, pagan y recogen en sucursal. No hay entrega a domicilio.

El contrato de todo el sistema (tienda, panel de administración y backend) es [`KARSO-PROMPT-v1.md`](KARSO-PROMPT-v1.md), acordado con el socio: sus nombres de campos, enums y reglas son obligatorios para que las partes encajen. **Este repositorio es solo la tienda.** Lo que es solo del panel (empleados, roles, armado, mostrador, configuración) no va aquí, y los datos que administra el panel (productos, banners) se simulan con JSON (ver [Mock del panel](#mock-del-panel)).

Este repositorio es el **demo**: la app Next.js guarda todo en archivos JSON locales. En preproducción y producción esta app será solo el front y hablará con un backend propio (MongoDB + storage tipo S3) por HTTP. El cambio es de URL base, no de código del front.

El trabajo se define con specs en [`specs/`](specs/). Lo implementado hoy:

- [SPEC 01](specs/01-base-y-autenticacion-demo.md): registro, login (correo o Google simulado), verificación de WhatsApp simulada y el esqueleto del panel.
- [SPEC 02](specs/02-pedidos-subpedidos-y-presupuesto.md): pedidos con subpedidos (ítems), subida de archivos, confirmación con folio y "Mis pedidos". Sin pago todavía. (Su precio por hoja y la vista previa del acomodo se retiraron en la SPEC 04.)
- [SPEC 03](specs/03-convenio-tecnico-y-de-diseno.md): refactor según el convenio técnico y de diseño (atomic design, React Query con hooks, identidad gráfica en tema oscuro y claro). App 100% web.
- [SPEC 04](specs/04-catalogo-y-cotizacion-karso.md): catálogo de KARSO (productos con variantes, atributos, medidas y acabados, simulados), cotización de la sección 5.4 y banners en el inicio del panel.
- [SPEC 05](specs/05-archivos-frente-reverso-y-validacion.md): archivos de la línea según la sección 5.7: subida en tres pasos que emula R2, frente y reverso (archivo, calendario o texto) y validación de formato, peso, CMYK, dpi y medida que solo advierte.

## Arrancar el demo

Requisitos: Node 20+ y pnpm (`corepack enable pnpm`).

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Abre <http://localhost:3000>. Te redirige a `/login`.

### Probar el flujo

1. **Regístrate** en `/registro`. Todos los campos son obligatorios y el WhatsApp debe tener 10 dígitos de México.
2. **Verifica el WhatsApp.** No se envían mensajes reales. El código de 6 dígitos aparece en el aviso amarillo de la pantalla y en la consola del servidor, con el prefijo `[DEMO WHATSAPP]`.
3. Llegas al **panel**, que muestra tu número de cliente (`CLI-000001`, …) y los banners vigentes. Un banner abre el editor con su producto ya elegido.
4. En **Mis pedidos → Nuevo pedido**, usa **Agregar ítem**:
   1. elige el producto y sus opciones (las combinaciones que no existen se ven deshabilitadas, p. ej. Tríptico "Ajustado");
   2. en lonas captura ancho y alto en metros (o usa una medida rápida); en metro lineal, solo el largo;
   3. sube el archivo del frente (JPG, JPEG, TIFF, PDF, AI, EPS o SVG, hasta 40 MB) y, si la variante lo admite, elige el reverso: tu archivo, un calendario o un texto (ver [Archivos de la línea](#archivos-de-la-línea));
   4. marca los acabados y escribe la cantidad en su unidad (millares, piezas o paquetes).

   La cotización se actualiza en vivo. Ejemplos: tarjeta couché × 2 millares con suaje = $310.00; lona 720 dpi de 2.00 × 1.50 m × 2 con ojillos = $414.00. Los precios son **sin IVA**: el IVA se sumará al pagar si se pide factura (SPEC 06).
5. **Hacer pedido** congela los precios, asigna un folio (`P-000001`, …) y deja el pago como "Pago pendiente". Mientras el pedido esté en estado "Pedido" lo puedes cancelar desde su detalle.

**"Continuar con Google"** es una simulación: un modal pide nombre y correo, sin OAuth. Si el correo ya tiene cuenta, entra a esa misma cuenta. Si no, crea una y pide completar apellidos y WhatsApp.

## Rutas

**Pantallas** (todo `/panel` exige sesión con la cuenta activa):

| Ruta | Pantalla |
| --- | --- |
| `/login`, `/registro`, `/registro/verificar`, `/registro/completar` | Acceso (SPEC 01) |
| `/panel` | Inicio del panel, con el carrusel de banners vigentes |
| `/panel/pedidos` | Mis pedidos: folio, fecha, ítems, total y estado; "Nuevo pedido" |
| `/panel/pedidos/nuevo` | Borrador: líneas con su desglose, totales sin IVA, "Agregar ítem" y "Hacer pedido" |
| `/panel/pedidos/nuevo/item` | Editor de una línea nueva, con cotización en vivo. `?producto=<_id>` llega con ese producto elegido |
| `/panel/pedidos/nuevo/item/[itemId]` | Editor de un ítem existente |
| `/panel/pedidos/[id]` | Detalle de un pedido confirmado; "Cancelar pedido" mientras está en "Pedido" |

**API de la tienda** (pública, sin sesión; filtra el servidor, como las rutas `/tienda` del backend de KARSO):

| Método y ruta | Uso |
| --- | --- |
| `GET /api/tienda/productos` | `{ ejemplo, productos }`: productos activos con sus variantes activas de canal `en_linea` y sus acabados activos, por `orden`. 500 `CATALOGO_INVALIDO` si el mock no valida |
| `GET /api/tienda/banners` | `{ banners }`: activos y vigentes ahora, por `orden` |

**API de pedidos** (con sesión activa; errores con la forma `{ error: { code, message, fields? } }`; montos en pesos):

| Método y ruta | Uso |
| --- | --- |
| `POST /api/archivos/subidas` | Paso 1 de la subida: `{ nombre, bytes }` → `{ archivo, subida: { url, metodo: "PUT", expiraEn } }` con el archivo `pendiente`; 415 `FORMATO_NO_PERMITIDO`, 413 si pasa de 40 MB, 422 sin nombre |
| `PUT /api/r2-local/<key>?expira=…&bytes=…&firma=…` | Paso 2: el binario, a la URL firmada (sin sesión: la firma autoriza). 403 si la firma está alterada, venció o es de otra llave; 413 con más bytes que los declarados |
| `POST /api/archivos/:id/confirmar` | Paso 3: el servidor lee el archivo, extrae sus datos y genera la miniatura → `{ archivo }` `subido`; 404 si no es del usuario, 409 si el binario no llegó |
| `GET /api/archivos/:id` | Ver (JPG) o descargar (el resto) un archivo propio ya subido; 404 si no es del usuario |
| `GET /api/archivos/:id/miniatura` | Miniatura JPG en sRGB de un JPG o TIFF propio; 404 si no hay o no es del usuario |
| `GET /api/pedidos/borrador` | Borrador del usuario (lo crea si no hay), recalculado |
| `POST /api/pedidos/borrador/items` | Agregar una línea (`productoId`, `varianteId`, `medida`, `especificaciones`, `cantidad`, `archivos: { frente, reverso }`, `descripcion`); 422 con el campo que falla, 409 con 20 líneas. Las advertencias del archivo no dan error |
| `PUT` / `DELETE /api/pedidos/borrador/items/:itemId` | Editar o quitar una línea (`itemId` = `lineaId`) |
| `POST /api/pedidos/borrador/confirmar` | "Hacer pedido": copia los archivos a `pedidos/<folio>/`; 422 `PEDIDO_VACIO`, 409 `ITEMS_CON_PROBLEMAS` |
| `GET /api/pedidos` | Pedidos confirmados del usuario, recientes primero |
| `GET /api/pedidos/:id` | Detalle; 404 si no es del usuario |
| `POST /api/pedidos/:id/cancelar` | Cancelar; 409 si el estado no es "Pedido" |

## Variables de entorno

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `AUTH_SECRET` | Sí | Firma el JWT de la cookie de sesión. Mínimo 32 caracteres; si falta o es más corta, **el servidor no arranca**. Genera una con `openssl rand -base64 48`. |
| `NEXT_PUBLIC_API_BASE_URL` | No | URL base del backend. Vacía = mismo origen (los route handlers de Next del demo). En preproducción apunta al backend real. |
| `DATA_DIR` | No | Carpeta de los datos del demo. Por defecto `./data`. Los tests e2e usan una carpeta temporal. |
| `UPLOADS_DIR` | No | Carpeta de los archivos que suben los clientes. Por defecto `./uploads`. |
| `PRODUCTOS_PATH` | No | Ruta de los productos simulados. Por defecto `config/mock-panel/productos.json`. Los tests la apuntan a una copia temporal para poder editarla. |
| `BANNERS_PATH` | No | Ruta de los banners simulados. Por defecto `config/mock-panel/banners.json`. |

## Mock del panel

El panel de administración de KARSO es otro proyecto y todavía no existe. Lo que él administrará se simula con JSON versionados en git, con **la misma forma que devolverá el backend** (secciones 6.4 y 6.8 de KARSO), en [`config/mock-panel/`](config/mock-panel/). Se leen y validan (zod) en cada petición: **los cambios aplican sin reiniciar el servidor**.

| Archivo | Contenido |
| --- | --- |
| `productos.json` | Tarjeta, Volante, Lona 13 oz., Imán y Adhesivo, con sus variantes (SKU, atributos, medida, volumen, `precioPor`, precio, cobro mínimo, caras, canales) y especificaciones (acabados). Montos **en pesos, sin IVA**. `ejemplo: true` muestra "Precios de ejemplo". |
| `banners.json` | 4 banners: 2 vigentes (Tarjetas y Lonas), "Buen Fin" con vigencia del 13 al 16 nov 2026 y uno inactivo. |
| `public/mock/` | Imágenes SVG de ejemplo de los productos y los banners (escritorio y móvil). |

**Supuestos del mock** (también en `supuestos` de `productos.json`): los precios salen de la lista de KARSO (sección 5.13) y pueden estar desactualizados. Lo que KARSO no detalla se rellenó así: rebase 0.3 cm, tolerancia 0.1 y 5 días de entrega; caras como su equivalente de la sección 6.4; volantes bond de 4 y 8 cartas con las medidas de su fila; adhesivo en el grupo de armado `Adhesivos`; despunte, suaje y foliado solo en tarjetas por millar. La lona urgente está **solo en canal `mostrador`**: la tienda no la ofrece. Quedan fuera los productos con datos pendientes (tarjeta sulfatada, folder, notas, corte de vinil) o fuera del MVP (DTF, planchado, sublimación, sand blast). En los volantes, el orden de atributos es papel → tamaño → ajuste, porque el papel define qué tamaños existen.

Si un JSON queda inválido (SKU repetido, medida fija con `min ≠ max`, acabado de una variante que no existe…), la API responde 500 y la consola del servidor dice qué campo falla, por ejemplo `productos.0.variantes.1.sku: SKU repetido: "70000177"`.

**Cómo se cotiza** (KARSO 5.3 y 5.4, en `src/lib/pedidos/cotizacion.ts`, la misma función en el front y en el servidor):

- Base unitaria por `precioPor`: `volumen` = precio; `m2` = máx(ancho × alto × precio, cobro mínimo); `metro_lineal` = máx(largo × precio, cobro mínimo).
- Acabados por unidad de volumen: `fijo` y `por_volumen` = precio; `por_m2` = precio × área; `por_metro_lineal` = precio × perímetro; `por_pieza` = precio × ⌈perímetro ÷ cadaMetros⌉ (ojillos).
- Importe unitario = base + acabados; subtotal = importe unitario × cantidad. Las medidas en cm pasan a metros.
- Pedido: subtotal = Σ líneas; descuento 0 y sin IVA hasta la SPEC 06 (`tasaIva` 0), así que total = subtotal.
- Internamente se calcula en centavos y milímetros enteros, redondeando cada importe una vez; entra y sale en pesos.
- Cantidad: de la `cantidadMinima` de la variante a 100,000 unidades de volumen (máximo técnico contra errores de captura, no un tope de negocio).

**Qué pasa al cambiarlo:** los borradores se recalculan. Si una línea deja de ser válida (variante inactiva o solo de mostrador, acabado que ya no aplica, medida fuera de rango), muestra el problema y "Hacer pedido" queda bloqueado hasta editarla. Los pedidos confirmados conservan lo que copiaron de la variante.

## Datos del demo

Los datos viven en `data/` y los archivos subidos en `uploads/`. Git ignora las dos carpetas y se crean solas:

| Archivo | Contenido |
| --- | --- |
| `data/users.json` | Usuarios. La contraseña se guarda hasheada con bcrypt, nunca en texto plano. |
| `data/counters.json` | Consecutivo del `idCliente`. |
| `data/verifications.json` | Códigos de WhatsApp vigentes. |
| `data/orders.json` | Pedidos (incluido un borrador por cliente) y `ultimoFolio`, el consecutivo de los folios `P-000001`. Versión 3 (líneas de KARSO con `archivos: { frente, reverso }`): un archivo de una versión anterior se reemplaza por uno vacío al primer uso, con un aviso en la consola. |
| `data/archivos.json` | Datos de los archivos (dueño, nombre, formato, peso, llave, estado `pendiente`/`subido`, píxeles, color y si tiene miniatura). Versión 2: uno de la versión 1 se reemplaza por uno vacío, con aviso. |
| `uploads/temporal/<id>.<ext>` | Archivos recién subidos, de borradores (el "R2 local"). La miniatura va junto, en `<id>.<ext>.miniatura.jpg`. |
| `uploads/pedidos/<folio>/<lineaId>_<cara>.<ext>` | Copias de los archivos de cada pedido hecho (`_frente` y `_reverso`), con su miniatura. |

Solo el dueño ve o descarga sus archivos, por `GET /api/archivos/:id`; `uploads/` no se sirve como estática.

**Para reiniciar todo**, detén el servidor y borra `data/` y `uploads/`. Si el navegador conserva una cookie de sesión de un usuario que ya no existe, la app la limpia y te manda a `/login`.

**Para reiniciar solo los pedidos**, detén el servidor y borra `data/orders.json`, `data/archivos.json` y `uploads/`. Los folios vuelven a empezar en `P-000001`.

**Estados del pedido:** `borrador` → `pedido` (al confirmar) → `en_proceso` → `entregado`, o `cancelado` (el cliente cancela mientras está en `pedido`). En el demo no hay panel de la imprenta: para mover un pedido a `en_proceso` o `entregado`, edita su `estado` en `data/orders.json`.

**Archivos sin usar:** si un cliente sube un archivo y abandona el editor sin guardar, el archivo queda en `uploads/temporal/` (o `pendiente`, si nunca llegó el binario). Quitar una línea o cambiar su archivo sí borra el anterior cuando ninguna otra lo usa, y "Hacer pedido" borra los temporales que pasó a `pedidos/<folio>/`. En R2 una regla de ciclo de vida de 48 h limpiará `temporal/`; en el demo no hay limpieza automática.

**El borrador vive en el servidor** (en producción, en Mongo) para que sea el mismo en todos los dispositivos del cliente. No es una de las 10 colecciones de KARSO: hay que proponerla al socio. La limpieza automática de huérfanos queda para un spec futuro.

## Archivos de la línea

Reglas de `KARSO-PROMPT-v1.md` 5.7, implementadas en el [SPEC 05](specs/05-archivos-frente-reverso-y-validacion.md).

**Subida en tres pasos, como con Cloudflare R2:**

1. `POST /api/archivos/subidas` crea el archivo `pendiente` y devuelve una URL firmada de 15 minutos (HMAC-SHA256 con `AUTH_SECRET` sobre método, llave, vencimiento y bytes).
2. El navegador sube el binario con `PUT` a esa URL, con barra de progreso y botón para cancelar. En el demo la sirve el **"R2 local"**, `/api/r2-local/<key>`, que guarda en `uploads/temporal/` contando bytes. En producción el `PUT` va directo a R2 y esa ruta no existe.
3. `POST /api/archivos/:id/confirmar`: el servidor lee el archivo con [`sharp`](https://sharp.pixelplumbing.com/) y guarda el ancho y alto en px, el espacio de color y el formato real. Para JPG y TIFF genera una miniatura JPG en sRGB de 400 px, porque el navegador no dibuja CMYK ni TIFF. El original no se toca.

**Formatos al subir:** JPG, JPEG, TIFF, PDF, AI, EPS y SVG (la unión de lo que acepta el catálogo), con un tope global de **40 MB**. PNG y PSD ya no se aceptan. De PDF, AI, EPS y SVG no se lee nada por dentro: solo se revisan su formato y su peso.

**Validación: solo advierte.** Las reglas son las del producto con las que sobrescribe la variante (`archivo` en el mock). Cada una que falla agrega una advertencia y la línea se guarda con `validado: false`. El editor las recalcula en vivo al cambiar de variante o de medida, sin volver a subir. El borrador y el detalle muestran la insignia "Podría ser rechazado", y "Hacer pedido" se permite igual: la decisión la toma mostrador al revisar el pedido (SPEC 07).

| Advertencia | Cuándo | Ejemplo |
| --- | --- | --- |
| `formato` | La extensión no está en `formatos` | "Formato PDF no permitido para este producto; se aceptan JPG, JPEG y TIFF" |
| `peso` | Pesa más que `pesoMaximoMB` | "Pesa 45.2 MB; el máximo es 40 MB" |
| `ilegible` | `sharp` no pudo leer la imagen, o su formato real no es el de la extensión | "No se pudo leer la imagen; mostrador la revisará" |
| `color` | `colorRequerido` no es `cualquiera` y no coincide | "El archivo está en RGB; se requiere CMYK" |
| `resolucion` | Resolución efectiva menor que `resolucionMinima` | "Resolución efectiva de 150 dpi; se requieren al menos 300 dpi (mínimo 1098 × 661 px)" |
| `medida` | La proporción no corresponde, fuera de la tolerancia | "La medida no corresponde: … se esperaba 9.3 × 5.6 cm (± 0.1 cm)" |

**Medida y resolución** (solo imágenes con `validarMedida`). La medida esperada es la de la pieza más el rebase por lado: la tarjeta de 8.7 × 5 cm con 0.3 cm de rebase da 9.3 × 5.6 cm. Se prueba esa orientación y, si `permiteGirar`, la girada. La resolución se calcula con los píxeles y la medida física, no con los dpi del archivo, que muchas veces dicen 72:

- tarjeta 9.3 × 5.6 cm a 300 dpi: mínimo **1098 × 661 px**; un archivo de 2196 × 1322 (600 dpi) también pasa;
- lona de 2.00 × 1.50 m a 100 dpi: mínimo **7874 × 5906 px**.

**Errores que sí bloquean** (422): falta el frente; falta el reverso cuando es `obligatorio`; llega un reverso cuando es `no_aplica`; el archivo no existe, es de otro usuario o sigue `pendiente`; el calendario no es del año actual o el siguiente; el texto está vacío o pasa de 500 caracteres.

**Reverso según `caras.reverso` de la variante:**

- `no_aplica` (p. ej. volante bond): no hay reverso;
- `opcional` (tarjeta couché): sin reverso, tu archivo, calendario o texto;
- `obligatorio` (tarjeta laminada): tu archivo, calendario o texto.

La máquina imprime frente y reverso en la misma pasada. Cuando el cliente no tiene diseño de reverso, la imprenta aprovecha esa cara con un **calendario** (año actual o siguiente, zona America/Monterrey) o un **texto** de hasta 500 caracteres, como una oración o datos de contacto. El diseño lo hace la imprenta y **no tiene costo extra**. ⚠️ Esta regla no está en `KARSO-PROMPT-v1.md`: **hay que proponerla al socio**. Al recalcular el borrador, un calendario de un año que ya pasó marca la línea con problema.

**Al hacer el pedido,** cada cara con archivo de cada línea se copia a `uploads/pedidos/<folio>/<lineaId>_frente.<ext>` (o `_reverso`), con su miniatura, como un archivo nuevo, y la línea apunta a él. Un mismo archivo en dos líneas se copia dos veces. Los temporales que ya nadie usa se borran. Las rutas usan el folio `P-…` hasta la SPEC 06.

**Imágenes de prueba:** `e2e/fixtures/generar-imagenes.mjs` genera las tarjetas (CMYK, RGB, girada, baja resolución, medida incorrecta, TIFF) y la lona de los ejemplos, de un solo color para que pesen poco. Están versionadas y un test revisa que tengan los píxeles y el color esperados. Para regenerarlas:

```bash
node e2e/fixtures/generar-imagenes.mjs
```

## Scripts

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Servidor de desarrollo en el puerto 3000. |
| `pnpm build` / `pnpm start` | Build y servidor de producción. |
| `pnpm lint` | ESLint. |
| `pnpm test` | Tests de unidad, de route handlers y de hooks (Vitest). |
| `pnpm test:e2e` | Tests end-to-end (Playwright). Levantan su propio servidor en el puerto 3100 con datos temporales. La primera vez: `pnpm exec playwright install chromium`. |

## Estructura

```
src/
├── app/                 # páginas (/panel/pedidos/*) y route handlers (/api/auth, /api/archivos, /api/r2-local, /api/pedidos, /api/tienda)
├── components/          # UI con atomic design (ver abajo)
│   ├── atoms/           #   piezas indivisibles: shadcn/ui y átomos propios
│   ├── molecules/       #   combinan átomos con una sola responsabilidad
│   ├── organisms/       #   secciones con datos (usan hooks) o formularios completos
│   └── templates/       #   esqueletos de página: panel y acceso
├── hooks/               # React Query y lógica de UI: use-auth, use-pedidos, use-productos, use-banners, use-editor-item, …
├── lib/                 # compartido con el front: cliente HTTP, validación (zod),
│   ├── catalogo/        #   esquema de productos de KARSO y selectores por atributos
│   ├── banners/         #   esquema de banners
│   └── pedidos/         #   cotización, evaluación de líneas, validación de archivos y formato (puros: los usan front y servidor)
├── server/              # solo servidor: dominio, sesión, repositorios, mock del panel, almacén JSON y de archivos, URL firmada y sharp
└── middleware.ts        # redirecciones según el estado de la cuenta
config/mock-panel/       # productos y banners simulados del panel de KARSO
public/mock/             # imágenes de ejemplo de productos y banners
KARSO-PROMPT-v1.md       # contrato del sistema acordado con el socio
docs/identidad/          # maqueta del socio, fuente de la identidad gráfica
e2e/                     # tests de Playwright (fixtures en e2e/fixtures)
specs/                   # specs del proyecto
```

Reglas del proyecto (las hace cumplir `pnpm lint`):

- **Los componentes no importan nada de `src/server`.** El front solo habla con el backend a través de `src/lib/api-client.ts`. Así, pasar del demo al backend real no toca la UI.
- **Los datos se piden con hooks de `src/hooks/`** (TanStack React Query). Componentes y páginas no llaman a `authApi`, `pedidosApi` ni `tiendaApi`; solo importan sus tipos.
- **Cada nivel de atomic design importa solo de los de abajo:** `atoms` ← `molecules` ← `organisms` ← `templates` ← páginas de `src/app`. Solo `organisms/` y `templates/` usan hooks de datos.
- `pnpm dlx shadcn add <componente>` crea los componentes nuevos en `atoms/` (alias `ui` de `components.json`).

En desarrollo, el botón flotante de React Query Devtools muestra la caché. No se incluye en el build de producción.

## Convenio técnico y de diseño

Acordado con el socio y aplicado en el [SPEC 03](specs/03-convenio-tecnico-y-de-diseno.md):

| Punto del convenio | Estado | Dónde |
| --- | --- | --- |
| Peticiones HTTP centralizadas en un solo cliente | ✅ | `src/lib/api-client.ts`, `auth-api.ts`, `pedidos-api.ts` y `tienda-api.ts` |
| Peticiones HTTP con TanStack React Query | ✅ | `src/app/providers.tsx` y `src/hooks/` |
| Lógica en hooks propios | ✅ | `src/hooks/` (`use-editor-item`, `use-cuenta-regresiva`, …) |
| Atomic design | ✅ | `src/components/{atoms,molecules,organisms,templates}` y reglas de ESLint |
| Identidad gráfica (colores, espacios, tipografía) | ✅ | Tokens en `src/app/globals.css` y Montserrat. Fuente: `docs/identidad/maqueta-crear-pedido.png` |
| App 100% web | ✅ | Se retiró la app de escritorio (`desktop/`) |
| Build ofuscado y sin source maps | ⛔ descartado | Decisión del 2026-11-02. Next no publica source maps del navegador en producción por defecto. |

## Temas

La app tiene tema **oscuro** (por defecto, el de la maqueta) y **claro** (derivado). El selector está al pie de la barra lateral del panel y en la esquina de las pantallas de acceso. La elección se guarda en `localStorage`, en la clave `tema` (`"dark"` o `"light"`), y se aplica antes de pintar, sin parpadeo. No sigue la preferencia del sistema operativo.

Los colores viven en tokens de `src/app/globals.css`: `:root` es el claro y `.dark` el oscuro. Cambiar un color ahí no toca componentes. Además de los de shadcn hay tres propios: `--exito` (verde), `--acento-texto` (montos y nombre del cliente) y `--fondo-degradado` (clase `bg-fondo-degradado`).

## Specs

| Spec | Contenido | Estado |
| --- | --- | --- |
| [01](specs/01-base-y-autenticacion-demo.md) | Base del proyecto, registro, login, Google simulado, verificación de WhatsApp, esqueleto del panel (shell Tauri retirado en SPEC 03) | En verificación |
| [02](specs/02-pedidos-subpedidos-y-presupuesto.md) | Pedidos y subpedidos, subida de archivos, confirmación con folio, Mis pedidos (precio por hoja y vista previa retirados en SPEC 04) | En verificación |
| [03](specs/03-convenio-tecnico-y-de-diseno.md) | Convenio técnico y de diseño: atomic design, React Query con hooks, identidad gráfica con tema oscuro y claro, retiro de la app de escritorio | En verificación |
| [04](specs/04-catalogo-y-cotizacion-karso.md) | Catálogo de KARSO simulado (variantes, atributos, medidas, acabados), cotización 5.4, banners en el inicio; retiro del precio por hoja | En verificación |
| [05](specs/05-archivos-frente-reverso-y-validacion.md) | Archivos: subida en tres pasos (R2 emulado), frente y reverso (archivo, calendario o texto), validación 5.7 que solo advierte (CMYK, dpi, medida, formato, 40 MB) | En verificación |
| 06 | Pago: sucursal de entrega, factura con IVA, promociones, Mercado Pago emulado, folio `KAR-…`, `pago_pendiente` | Pendiente |
| 07 | Seguimiento: 8 estatus y estatus por línea, fecha de entrega, QR, rechazo y corrección, simulador del panel | Pendiente |
| 08 | Perfil (socio, dirección, datos fiscales) y sesión con access/refresh y JWKS | Pendiente |

La hoja de ruta 04–08 sale de alinear la tienda con `KARSO-PROMPT-v1.md` (la del SPEC 02 queda reemplazada). El panel de administración es otro proyecto: aquí solo se simulan sus datos.

Fuera del demo por ahora: recuperar contraseña, verificación de correo, envío real de códigos, OAuth real de Google, backend real (NestJS + MongoDB + Cloudflare R2), miniaturas y lectura de PDF/AI/EPS/SVG, limpieza de archivos huérfanos, notificaciones y timbrado de factura (CFDI). La app es 100% web: no hay versión de escritorio.
