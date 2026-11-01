# Portal de clientes — imprenta

Portal donde los clientes mayoristas de la imprenta mandan sus archivos a imprimir, presupuestan, pagan y reciben el pedido por envío, sin ir al local.

Este repositorio es el **demo**: la app Next.js guarda todo en archivos JSON locales. En preproducción y producción esta app será solo el front y hablará con un backend propio (MongoDB + storage tipo S3) por HTTP. El cambio es de URL base, no de código del front.

El trabajo se define con specs en [`specs/`](specs/). Lo implementado hoy:

- [SPEC 01](specs/01-base-y-autenticacion-demo.md): registro, login (correo o Google simulado), verificación de WhatsApp simulada y el esqueleto del panel.
- [SPEC 02](specs/02-pedidos-subpedidos-y-presupuesto.md): pedidos con subpedidos (ítems), subida de archivos, presupuesto por hoja de impresión con IVA, vista previa a escala del acomodo, confirmación con folio y "Mis pedidos". Sin pago todavía.

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
3. Llegas al **panel**, que muestra tu número de cliente (`CLI-000001`, …).
4. En **Mis pedidos → Nuevo pedido**, usa **Agregar ítem**: sube un archivo (JPG, PNG, PDF, AI o PSD, hasta 50 MB), elige producto, tamaño, papel, hoja y cantidad. El presupuesto y la vista previa se actualizan en vivo.
5. **Hacer pedido** congela los precios, asigna un folio (`P-000001`, …) y deja el pago como "Pago pendiente". Mientras el pedido esté en estado "Pedido" lo puedes cancelar desde su detalle.

**"Continuar con Google"** es una simulación: un modal pide nombre y correo, sin OAuth. Si el correo ya tiene cuenta, entra a esa misma cuenta. Si no, crea una y pide completar apellidos y WhatsApp.

## Rutas

**Pantallas** (todo `/panel` exige sesión con la cuenta activa):

| Ruta | Pantalla |
| --- | --- |
| `/login`, `/registro`, `/registro/verificar`, `/registro/completar` | Acceso (SPEC 01) |
| `/panel` | Inicio del panel |
| `/panel/pedidos` | Mis pedidos: folio, fecha, ítems, total y estado; "Nuevo pedido" |
| `/panel/pedidos/nuevo` | Borrador: ítems, totales con IVA, "Agregar ítem" y "Hacer pedido" |
| `/panel/pedidos/nuevo/item` | Editor de un ítem nuevo, con presupuesto y vista previa en vivo |
| `/panel/pedidos/nuevo/item/[itemId]` | Editor de un ítem existente |
| `/panel/pedidos/[id]` | Detalle de un pedido confirmado; "Cancelar pedido" mientras está en "Pedido" |

**API de pedidos** (con sesión activa; errores con la forma `{ error: { code, message, fields? } }`):

| Método y ruta | Uso |
| --- | --- |
| `GET /api/catalogo` | Catálogo vigente |
| `POST /api/archivos` | Subir archivo (multipart, campo `archivo`); 413 si pasa de 50 MB, 415 si el formato no está permitido |
| `GET /api/archivos/:id` | Ver o descargar un archivo propio; 404 si no es del usuario |
| `GET /api/pedidos/borrador` | Borrador del usuario (lo crea si no hay), recalculado |
| `POST /api/pedidos/borrador/items` | Agregar ítem; 422 si no es válido o no cabe, 409 con 20 ítems |
| `PUT` / `DELETE /api/pedidos/borrador/items/:itemId` | Editar o quitar un ítem |
| `POST /api/pedidos/borrador/confirmar` | "Hacer pedido"; 422 `PEDIDO_VACIO`, 409 `ITEMS_CON_PROBLEMAS` |
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
| `CATALOGO_PATH` | No | Ruta del catálogo. Por defecto `config/catalogo.json`. Los tests la apuntan a una copia temporal para poder editarla. |

## Catálogo y precios

Hojas, papeles, precios y productos viven en [`config/catalogo.json`](config/catalogo.json), versionado en git: el historial muestra cada cambio de precio. Se lee y valida (zod) en cada petición, así que **los cambios aplican sin reiniciar el servidor**.

| Campo | Qué es |
| --- | --- |
| `ejemplo` | `true` muestra el aviso "Precios de ejemplo" en el borrador y el editor. Ponlo en `false` cuando los precios sean reales. |
| `margenCm` / `separacionCm` | Margen no imprimible de la hoja y espacio entre piezas para el corte. |
| `tasaIva` | IVA (`0.16`). Se aplica una vez sobre el subtotal del pedido. |
| `hojas` | Hojas de impresión (`tabloide`, `mesa`) con `anchoCm` < `altoCm` (vertical). |
| `papeles` | Cada papel con `precioHojaCentavos` **por hoja de impresión, sin IVA, en centavos** (`500` = $5.00) para **todas** las hojas. |
| `productos` | Cada producto con sus tamaños predefinidos y los `papelesIds` permitidos. Todos aceptan además tamaño personalizado. |

Los valores actuales son **de ejemplo**; la imprenta los reemplaza. Si el JSON queda inválido (un papel inexistente en un producto, un precio faltante…), la API responde 500 y la consola del servidor dice qué campo falla, por ejemplo `productos.0.papelesIds.2: El papel "x" no existe`.

**Cómo se cobra:** por hoja de impresión. Se calcula cuántas piezas caben en la hoja elegida (cuadrícula con margen y separación, probando la pieza girada 90°), `hojas = ⌈cantidad ÷ piezas por hoja⌉` y `subtotal = hojas × precio por hoja`.

**Qué pasa al cambiarlo:** los borradores se recalculan con el catálogo nuevo. Si un ítem deja de ser válido (se quitó su papel o producto), muestra el problema y "Hacer pedido" queda bloqueado hasta editarlo. Los pedidos ya confirmados conservan sus precios.

## Datos del demo

Los datos viven en `data/` y los archivos subidos en `uploads/`. Git ignora las dos carpetas y se crean solas:

| Archivo | Contenido |
| --- | --- |
| `data/users.json` | Usuarios. La contraseña se guarda hasheada con bcrypt, nunca en texto plano. |
| `data/counters.json` | Consecutivo del `idCliente`. |
| `data/verifications.json` | Códigos de WhatsApp vigentes. |
| `data/orders.json` | Pedidos (incluido un borrador por cliente) y `ultimoFolio`, el consecutivo de los folios `P-000001`. |
| `data/archivos.json` | Datos de los archivos subidos (dueño, nombre, tipo, tamaño). |
| `uploads/<id>.<ext>` | Los archivos. Solo su dueño los descarga, por `GET /api/archivos/:id`; la carpeta no se sirve como estática. |

**Para reiniciar todo**, detén el servidor y borra `data/` y `uploads/`. Si el navegador conserva una cookie de sesión de un usuario que ya no existe, la app la limpia y te manda a `/login`.

**Para reiniciar solo los pedidos**, detén el servidor y borra `data/orders.json`, `data/archivos.json` y `uploads/`. Los folios vuelven a empezar en `P-000001`.

**Estados del pedido:** `borrador` → `pedido` (al confirmar) → `en_proceso` → `entregado`, o `cancelado` (el cliente cancela mientras está en `pedido`). En el demo no hay panel de la imprenta: para mover un pedido a `en_proceso` o `entregado`, edita su `estado` en `data/orders.json`.

**Archivos sin usar:** si un cliente sube un archivo y abandona el editor sin guardar, el archivo queda en `uploads/` asociado a él. Quitar un ítem sí borra su archivo cuando ningún otro ítem lo usa. La limpieza automática de huérfanos queda para un spec futuro.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Servidor de desarrollo en el puerto 3000. |
| `pnpm build` / `pnpm start` | Build y servidor de producción. |
| `pnpm lint` | ESLint. |
| `pnpm test` | Tests de unidad y de route handlers (Vitest). |
| `pnpm test:e2e` | Tests end-to-end (Playwright). Levantan su propio servidor en el puerto 3100 con datos temporales. La primera vez: `pnpm exec playwright install chromium`. |

## Estructura

```
src/
├── app/                 # páginas (/panel/pedidos/*) y route handlers (/api/auth, /api/archivos, /api/pedidos, /api/catalogo)
├── components/          # UI (shadcn/ui en components/ui; pedidos en components/pedidos)
├── lib/                 # compartido con el front: cliente HTTP, validación (zod), catálogo,
│   └── pedidos/         #   acomodo, presupuesto y vista previa (puros: los usan front y servidor)
├── server/              # solo servidor: dominio, sesión, repositorios, almacén JSON y de archivos
└── middleware.ts        # redirecciones según el estado de la cuenta
config/catalogo.json     # hojas, papeles, precios y productos
e2e/                     # tests de Playwright (fixtures en e2e/fixtures)
desktop/                 # shell de escritorio con Tauri 2 (ver desktop/README.md)
specs/                   # specs del proyecto
```

Regla del proyecto: **los componentes no importan nada de `src/server`**. El front solo habla con el backend a través de `src/lib/api-client.ts`. Así, pasar del demo al backend real no toca la UI.

## App de escritorio

`desktop/` contiene un shell de Tauri 2 que abre esta app en una ventana nativa. Los prerrequisitos y el uso están en [`desktop/README.md`](desktop/README.md).

## Specs

| Spec | Contenido | Estado |
| --- | --- | --- |
| [01](specs/01-base-y-autenticacion-demo.md) | Base del proyecto, registro, login, Google simulado, verificación de WhatsApp, esqueleto del panel, shell Tauri | En verificación |
| [02](specs/02-pedidos-subpedidos-y-presupuesto.md) | Pedidos y subpedidos, subida de archivos, catálogo, presupuesto por hoja con IVA, vista previa simple, confirmación con folio, Mis pedidos | En verificación |
| — | Pago y envío | Pendiente |
| — | Perfil: datos, direcciones e información de pago | Pendiente |
| — | Acomodo avanzado / vista previa editable | Pendiente |
| — | Panel de la imprenta: mover estados y ver los pedidos de todos | Pendiente |

La hoja de ruta se reordenó en el SPEC 02 (pedidos antes que perfil). Los números de los specs futuros se asignan al crearlos.

Fuera del demo por ahora: recuperar contraseña, verificación de correo, envío real de códigos, OAuth real de Google, backend real (MongoDB + S3), miniaturas de PDF/AI/PSD, limpieza de archivos huérfanos, notificaciones, factura (CFDI) e instaladores de escritorio.
