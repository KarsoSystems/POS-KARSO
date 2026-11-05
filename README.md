# Portal de clientes — imprenta

Portal donde los clientes mayoristas de la imprenta mandan sus archivos a imprimir, presupuestan, pagan y reciben el pedido por envío, sin ir al local.

Este repositorio es el **demo**: la app Next.js guarda todo en archivos JSON locales. En preproducción y producción esta app será solo el front y hablará con un backend propio (MongoDB + storage tipo S3) por HTTP. El cambio es de URL base, no de código del front.

El trabajo se define con specs en [`specs/`](specs/). Lo implementado hoy:

- [SPEC 01](specs/01-base-y-autenticacion-demo.md): registro, login (correo o Google simulado), verificación de WhatsApp simulada y el esqueleto del panel.
- [SPEC 02](specs/02-pedidos-subpedidos-y-presupuesto.md): pedidos con subpedidos (ítems), subida de archivos, presupuesto por hoja de impresión con IVA, vista previa a escala del acomodo, confirmación con folio y "Mis pedidos". Sin pago todavía.
- [SPEC 03](specs/03-convenio-tecnico-y-de-diseno.md): refactor según el convenio técnico y de diseño (atomic design, React Query con hooks, identidad gráfica en tema oscuro y claro). App 100% web.

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
| `pnpm test` | Tests de unidad, de route handlers y de hooks (Vitest). |
| `pnpm test:e2e` | Tests end-to-end (Playwright). Levantan su propio servidor en el puerto 3100 con datos temporales. La primera vez: `pnpm exec playwright install chromium`. |

## Estructura

```
src/
├── app/                 # páginas (/panel/pedidos/*) y route handlers (/api/auth, /api/archivos, /api/pedidos, /api/catalogo)
├── components/          # UI con atomic design (ver abajo)
│   ├── atoms/           #   piezas indivisibles: shadcn/ui y átomos propios
│   ├── molecules/       #   combinan átomos con una sola responsabilidad
│   ├── organisms/       #   secciones con datos (usan hooks) o formularios completos
│   └── templates/       #   esqueletos de página: panel y acceso
├── hooks/               # React Query y lógica de UI: use-auth, use-pedidos, use-catalogo, use-subir-archivo, …
├── lib/                 # compartido con el front: cliente HTTP, validación (zod), catálogo,
│   └── pedidos/         #   acomodo, presupuesto y vista previa (puros: los usan front y servidor)
├── server/              # solo servidor: dominio, sesión, repositorios, almacén JSON y de archivos
└── middleware.ts        # redirecciones según el estado de la cuenta
config/catalogo.json     # hojas, papeles, precios y productos
docs/identidad/          # maqueta del socio, fuente de la identidad gráfica
e2e/                     # tests de Playwright (fixtures en e2e/fixtures)
specs/                   # specs del proyecto
```

Reglas del proyecto (las hace cumplir `pnpm lint`):

- **Los componentes no importan nada de `src/server`.** El front solo habla con el backend a través de `src/lib/api-client.ts`. Así, pasar del demo al backend real no toca la UI.
- **Los datos se piden con hooks de `src/hooks/`** (TanStack React Query). Componentes y páginas no llaman a `authApi` ni a `pedidosApi`; solo importan sus tipos.
- **Cada nivel de atomic design importa solo de los de abajo:** `atoms` ← `molecules` ← `organisms` ← `templates` ← páginas de `src/app`. Solo `organisms/` y `templates/` usan hooks de datos.
- `pnpm dlx shadcn add <componente>` crea los componentes nuevos en `atoms/` (alias `ui` de `components.json`).

En desarrollo, el botón flotante de React Query Devtools muestra la caché. No se incluye en el build de producción.

## Convenio técnico y de diseño

Acordado con el socio y aplicado en el [SPEC 03](specs/03-convenio-tecnico-y-de-diseno.md):

| Punto del convenio | Estado | Dónde |
| --- | --- | --- |
| Peticiones HTTP centralizadas en un solo cliente | ✅ | `src/lib/api-client.ts`, `auth-api.ts` y `pedidos-api.ts` |
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
| [02](specs/02-pedidos-subpedidos-y-presupuesto.md) | Pedidos y subpedidos, subida de archivos, catálogo, presupuesto por hoja con IVA, vista previa simple, confirmación con folio, Mis pedidos | En verificación |
| [03](specs/03-convenio-tecnico-y-de-diseno.md) | Convenio técnico y de diseño: atomic design, React Query con hooks, identidad gráfica con tema oscuro y claro, retiro de la app de escritorio | En verificación |
| — | Pago y envío | Pendiente |
| — | Perfil: datos, direcciones e información de pago | Pendiente |
| — | Acomodo avanzado / vista previa editable | Pendiente |
| — | Panel de la imprenta: mover estados y ver los pedidos de todos | Pendiente |

La hoja de ruta se reordenó en el SPEC 02 (pedidos antes que perfil). Los números de los specs futuros se asignan al crearlos.

Fuera del demo por ahora: recuperar contraseña, verificación de correo, envío real de códigos, OAuth real de Google, backend real (MongoDB + S3), miniaturas de PDF/AI/PSD, limpieza de archivos huérfanos, notificaciones y factura (CFDI). La app es 100% web: no hay versión de escritorio.
