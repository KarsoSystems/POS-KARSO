# Portal de clientes — imprenta

Tienda en línea de **KARSO**, imprenta offset con 3 sucursales: los clientes cotizan, suben sus archivos, pagan y recogen en sucursal. No hay entrega a domicilio.

El contrato de todo el sistema (tienda, panel de administración y backend) es [`KARSO-PROMPT-v1.md`](KARSO-PROMPT-v1.md), acordado con el socio: sus nombres de campos, enums y reglas son obligatorios para que las partes encajen. **Este repositorio es solo la tienda.** Lo que es solo del panel (empleados, roles, armado, mostrador, configuración) no va aquí, y los datos que administra el panel (productos, banners, sucursales, promociones y configuración) se simulan con JSON (ver [Mock del panel](#mock-del-panel)).

Este repositorio es el **demo**: la app Next.js guarda todo en archivos JSON locales. En preproducción y producción esta app será solo el front y hablará con un backend propio (MongoDB + storage tipo S3) por HTTP. El cambio es de URL base, no de código del front.

El trabajo se define con specs en [`specs/`](specs/). Lo implementado hoy:

- [SPEC 01](specs/01-base-y-autenticacion-demo.md): registro, login (correo o Google simulado), verificación de WhatsApp simulada y el esqueleto del panel.
- [SPEC 02](specs/02-pedidos-subpedidos-y-presupuesto.md): pedidos con subpedidos (ítems), subida de archivos, confirmación con folio y "Mis pedidos". Sin pago todavía. (Su precio por hoja y la vista previa del acomodo se retiraron en la SPEC 04.)
- [SPEC 03](specs/03-convenio-tecnico-y-de-diseno.md): refactor según el convenio técnico y de diseño (atomic design, React Query con hooks, identidad gráfica en tema oscuro y claro). App 100% web.
- [SPEC 04](specs/04-catalogo-y-cotizacion-karso.md): catálogo de KARSO (productos con variantes, atributos, medidas y acabados, simulados), cotización de la sección 5.4 y banners en el inicio del panel.
- [SPEC 05](specs/05-archivos-frente-reverso-y-validacion.md): archivos de la línea según la sección 5.7: subida en tres pasos que emula R2, frente y reverso (archivo, calendario o texto) y validación de formato, peso, CMYK, dpi y medida que solo advierte.
- [SPEC 06](specs/06-checkout-sucursal-factura-y-promociones.md): checkout en el borrador: sucursal de entrega, "Requiero factura" con datos fiscales (catálogos del SAT) e IVA, y códigos de promoción, con los totales de KARSO 5.4.
- [SPEC 07](specs/07-pago-mercado-pago-emulado-y-folio-kar.md): pago con Mercado Pago emulado (aprobar, rechazar o dejar pendiente), folio `KAR-AAAA-NNNNNN`, estatus e historial de KARSO (`pago_pendiente` → `enviado`) y cancelación automática si no se paga a tiempo.

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

   La cotización se actualiza en vivo. Ejemplos: tarjeta couché × 2 millares con suaje = $310.00; lona 720 dpi de 2.00 × 1.50 m × 2 con ojillos = $414.00. Los precios del catálogo son **sin IVA**.
5. En el **borrador**, elige la **sucursal de entrega** (obligatoria; no hay entrega a domicilio), aplica **códigos de promoción** (p. ej. `KARSO10`) y marca **"Requiero factura"** si la necesitas: se suma el IVA y se piden tus datos fiscales (ver [Checkout](#checkout-sucursal-factura-y-promociones)).
6. **Hacer pedido** congela precios, descuentos e IVA, asigna un folio (`KAR-2026-000001`, …), deja el pedido en **Pago pendiente** y te lleva a la **página de pago simulada**: elige **Aprobar**, **Rechazar** o **Dejarlo pendiente** (no se cobra nada). Aprobado, el pedido pasa a **Enviado**; si no, desde el detalle puedes volver a **Pagar** hasta la hora límite (ver [Pago](#pago-mercado-pago-emulado)).

**"Continuar con Google"** es una simulación: un modal pide nombre y correo, sin OAuth. Si el correo ya tiene cuenta, entra a esa misma cuenta. Si no, crea una y pide completar apellidos y WhatsApp.

## Rutas

**Pantallas** (todo `/panel` exige sesión con la cuenta activa):

| Ruta | Pantalla |
| --- | --- |
| `/login`, `/registro`, `/registro/verificar`, `/registro/completar` | Acceso (SPEC 01) |
| `/panel` | Inicio del panel, con el carrusel de banners vigentes |
| `/panel/pedidos` | Mis pedidos: folio, fecha, ítems, total y estado; "Nuevo pedido" |
| `/panel/pedidos/nuevo` | Borrador: líneas con su desglose, sucursal de entrega, códigos de promoción, factura, totales, "Agregar ítem" y "Hacer pedido" |
| `/panel/pedidos/nuevo/item` | Editor de una línea nueva, con cotización en vivo. `?producto=<_id>` llega con ese producto elegido |
| `/panel/pedidos/nuevo/item/[itemId]` | Editor de un ítem existente |
| `/panel/pedidos/[id]` | Detalle de un pedido confirmado: estatus, líneas, entrega, factura y totales; en "Pago pendiente", la hora límite y "Pagar"; ya pagado, "Pagado el … · Ref. …" |
| `/panel/pedidos/[id]/pago` | Página de pago simulada (emula Mercado Pago Checkout Pro): folio, total, hora límite y "Aprobar", "Rechazar" o "Dejarlo pendiente" |

**API de la tienda** (pública, sin sesión; filtra el servidor, como las rutas `/tienda` del backend de KARSO):

| Método y ruta | Uso |
| --- | --- |
| `GET /api/tienda/productos` | `{ ejemplo, productos }`: productos activos con sus variantes activas de canal `en_linea` y sus acabados activos, por `orden`. 500 `CATALOGO_INVALIDO` si el mock no valida |
| `GET /api/tienda/banners` | `{ banners }`: activos y vigentes ahora, por `orden` |
| `GET /api/tienda/sucursales` | `{ ejemplo, sucursales }`: activas, por `clave`. 500 `SUCURSALES_INVALIDAS` si el mock no valida |

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
| `PATCH /api/pedidos/borrador` | Checkout, cambios parciales: `{ sucursalEntregaId?, requiereFactura?, datosFiscales?, guardarDatosFiscales? }`; 422 por campo (sucursal no disponible, `datosFiscales.rfc`, …) |
| `POST /api/pedidos/borrador/promociones` | Aplicar un código `{ codigo }` (sin importar mayúsculas); 422 `{ codigo: mensaje }` |
| `DELETE /api/pedidos/borrador/promociones/:codigo` | Quitar un código; 404 si no está aplicado |
| `POST /api/pedidos/borrador/confirmar` | "Hacer pedido": copia los archivos a `pedidos/<folio>/` y registra los usos de sus códigos; 422 `PEDIDO_VACIO`, 409 `ITEMS_CON_PROBLEMAS`, 422 `CHECKOUT_INCOMPLETO` (falta la sucursal o, con factura, los datos fiscales), 409 `PROMOCION_INVALIDA` (un código dejó de valer: el borrador queda sin él) |
| `GET /api/pedidos` | Pedidos confirmados del usuario, recientes primero |
| `GET /api/pedidos/:id` | Detalle; 404 si no es del usuario |
| `POST /api/pedidos/:id/pago-simulado` | Resultado del pago `{ resultado: "aprobado" \| "rechazado" \| "pendiente" }` (lo que hará el webhook de Mercado Pago): aprobado → `enviado`. 404 si no es del usuario; 409 `PAGO_VENCIDO` si ya venció; 409 `ESTATUS_INVALIDO` si ya no espera pago |

`GET /api/pedidos` y `GET /api/pedidos/:id` cancelan antes de responder los pedidos del usuario cuyo pago venció. **No hay ruta para cancelar:** solo el admin cancela, desde el panel.

## Variables de entorno

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `AUTH_SECRET` | Sí | Firma el JWT de la cookie de sesión. Mínimo 32 caracteres; si falta o es más corta, **el servidor no arranca**. Genera una con `openssl rand -base64 48`. |
| `NEXT_PUBLIC_API_BASE_URL` | No | URL base del backend. Vacía = mismo origen (los route handlers de Next del demo). En preproducción apunta al backend real. |
| `DATA_DIR` | No | Carpeta de los datos del demo. Por defecto `./data`. Los tests e2e usan una carpeta temporal. |
| `UPLOADS_DIR` | No | Carpeta de los archivos que suben los clientes. Por defecto `./uploads`. |
| `PRODUCTOS_PATH` | No | Ruta de los productos simulados. Por defecto `config/mock-panel/productos.json`. Los tests la apuntan a una copia temporal para poder editarla. |
| `BANNERS_PATH` | No | Ruta de los banners simulados. Por defecto `config/mock-panel/banners.json`. |
| `SUCURSALES_PATH` | No | Ruta de las sucursales simuladas. Por defecto `config/mock-panel/sucursales.json`. |
| `PROMOCIONES_PATH` | No | Ruta de las promociones simuladas. Por defecto `config/mock-panel/promociones.json`. |
| `CONFIGURACION_PATH` | No | Ruta de la configuración simulada. Por defecto `config/mock-panel/configuracion.json`. |

## Mock del panel

El panel de administración de KARSO es otro proyecto y todavía no existe. Lo que él administrará se simula con JSON versionados en git, con **la misma forma que devolverá el backend** (secciones 6.3, 6.4, 6.6, 6.8 y 6.9 de KARSO), en [`config/mock-panel/`](config/mock-panel/). Se leen y validan (zod) en cada petición: **los cambios aplican sin reiniciar el servidor**.

| Archivo | Contenido |
| --- | --- |
| `productos.json` | Tarjeta, Volante, Lona 13 oz., Imán y Adhesivo, con sus variantes (SKU, atributos, medida, volumen, `precioPor`, precio, cobro mínimo, caras, canales) y especificaciones (acabados). Montos **en pesos, sin IVA**. `ejemplo: true` muestra "Precios de ejemplo". |
| `banners.json` | 4 banners: 2 vigentes (Tarjetas y Lonas), "Buen Fin" con vigencia del 13 al 16 nov 2026 y uno inactivo. |
| `sucursales.json` | Las 3 sucursales: "KARSO Centro" (la de KARSO 6.3) y dos de ejemplo, "KARSO Cumbres" y "KARSO San Nicolás". |
| `promociones.json` | 7 códigos para probar: `KARSO10` (10 %), `BIENVENIDA5` (5 %, un uso por cliente) y `MAYOREO25` (25 %), vigentes hasta 2030; `BUENFIN10` (el de KARSO, del 13 al 17 nov 2026), `VERANO15` (vencido), `SUCURSAL20` (solo mostrador) y `PAUSA30` (inactivo). `usosActuales` lo lleva el panel: la tienda no lo lee ni lo escribe. |
| `configuracion.json` | Lo de KARSO 6.9 que usa la tienda: zona horaria (`America/Mexico_City`; KARSO dice `America/Monterrey`, mismo desfase todo el año: hay que acordarlo con el socio), IVA de 0.16, reglas de promociones (2 códigos por pedido, modo `suma`, tope de 30 %) y `pedidos.horasExpiracionPagoPendiente: 24`. |
| `public/mock/` | Imágenes SVG de ejemplo de los productos y los banners (escritorio y móvil). |

**Supuestos del mock** (también en `supuestos` de `productos.json`): los precios salen de la lista de KARSO (sección 5.13) y pueden estar desactualizados. Lo que KARSO no detalla se rellenó así: rebase 0.3 cm, tolerancia 0.1 y 5 días de entrega; caras como su equivalente de la sección 6.4; volantes bond de 4 y 8 cartas con las medidas de su fila; adhesivo en el grupo de armado `Adhesivos`; despunte, suaje y foliado solo en tarjetas por millar. La lona urgente está **solo en canal `mostrador`**: la tienda no la ofrece. Quedan fuera los productos con datos pendientes (tarjeta sulfatada, folder, notas, corte de vinil) o fuera del MVP (DTF, planchado, sublimación, sand blast). En los volantes, el orden de atributos es papel → tamaño → ajuste, porque el papel define qué tamaños existen.

Si un JSON queda inválido (SKU repetido, medida fija con `min ≠ max`, acabado de una variante que no existe…), la API responde 500 y la consola del servidor dice qué campo falla, por ejemplo `productos.0.variantes.1.sku: SKU repetido: "70000177"`.

**Cómo se cotiza** (KARSO 5.3 y 5.4, en `src/lib/pedidos/cotizacion.ts`, la misma función en el front y en el servidor):

- Base unitaria por `precioPor`: `volumen` = precio; `m2` = máx(ancho × alto × precio, cobro mínimo); `metro_lineal` = máx(largo × precio, cobro mínimo).
- Acabados por unidad de volumen: `fijo` y `por_volumen` = precio; `por_m2` = precio × área; `por_metro_lineal` = precio × perímetro; `por_pieza` = precio × ⌈perímetro ÷ cadaMetros⌉ (ojillos).
- Importe unitario = base + acabados; subtotal = importe unitario × cantidad. Las medidas en cm pasan a metros.
- Pedido: subtotal = Σ líneas; descuento = Σ códigos (ver [Checkout](#checkout-sucursal-factura-y-promociones)); base de IVA = subtotal − descuento; IVA = base × `tasaIva` (la de la configuración con factura, 0 sin ella); total = base + IVA.
- Internamente se calcula en centavos y milímetros enteros, redondeando cada importe una vez; entra y sale en pesos.
- Cantidad: de la `cantidadMinima` de la variante a 100,000 unidades de volumen (máximo técnico contra errores de captura, no un tope de negocio).

**Qué pasa al cambiarlo:** los borradores se recalculan. Si una línea deja de ser válida (variante inactiva o solo de mostrador, acabado que ya no aplica, medida fuera de rango), muestra el problema y "Hacer pedido" queda bloqueado hasta editarla. Un código que deja de valer o una sucursal que se desactiva se quitan del borrador con un aviso. Los pedidos confirmados conservan lo que copiaron (variante, sucursal, códigos, IVA).

## Datos del demo

Los datos viven en `data/` y los archivos subidos en `uploads/`. Git ignora las dos carpetas y se crean solas:

| Archivo | Contenido |
| --- | --- |
| `data/users.json` | Usuarios. La contraseña se guarda hasheada con bcrypt, nunca en texto plano. Versión 2: suma `datosFiscales` y `usosPromociones`; un archivo de la versión 1 **se migra** (no se pierden usuarios), con un aviso en la consola. |
| `data/counters.json` | Consecutivo del `idCliente`. |
| `data/verifications.json` | Códigos de WhatsApp vigentes. |
| `data/orders.json` | Pedidos (incluido un borrador por cliente) y `contadores`, el consecutivo de los folios por año (`"pedidos-2026": 7`, como KARSO 6.10). Versión 5 (líneas de KARSO con `archivos: { frente, reverso }`, sucursal, factura, promociones, estatus, historial y pagos): un archivo de una versión anterior se reemplaza por uno vacío al primer uso, con un aviso en la consola. |
| `data/archivos.json` | Datos de los archivos (dueño, nombre, formato, peso, llave, estado `pendiente`/`subido`, píxeles, color y si tiene miniatura). Versión 2: uno de la versión 1 se reemplaza por uno vacío, con aviso. |
| `uploads/temporal/<id>.<ext>` | Archivos recién subidos, de borradores (el "R2 local"). La miniatura va junto, en `<id>.<ext>.miniatura.jpg`. |
| `uploads/pedidos/<folio>/<lineaId>_<cara>.<ext>` | Copias de los archivos de cada pedido hecho (`_frente` y `_reverso`), con su miniatura. |

Solo el dueño ve o descarga sus archivos, por `GET /api/archivos/:id`; `uploads/` no se sirve como estática.

**Para reiniciar todo**, detén el servidor y borra `data/` y `uploads/`. Si el navegador conserva una cookie de sesión de un usuario que ya no existe, la app la limpia y te manda a `/login`.

**Para reiniciar solo los pedidos**, detén el servidor y borra `data/orders.json`, `data/archivos.json` y `uploads/`. Los folios vuelven a empezar en `KAR-<año>-000001`.

**Estatus del pedido** (KARSO 5.8, campo `estatus`): `borrador` (propio del demo: el carrito) → `pago_pendiente` (al hacer el pedido) → `enviado` (pago aprobado) → `recibido` → `en_proceso` → `listo` → `entregado`, o `rechazado` / `cancelado`. La tienda solo produce `pago_pendiente`, `enviado` y `cancelado` (por vencimiento); los demás los asigna el panel (SPEC 08). En el demo no hay panel: para ver otro estatus, edita el `estatus` del pedido en `data/orders.json`. Cada cambio queda en `historialEstatus` (fecha, quién y comentario).

**Archivos sin usar:** si un cliente sube un archivo y abandona el editor sin guardar, el archivo queda en `uploads/temporal/` (o `pendiente`, si nunca llegó el binario). Quitar una línea o cambiar su archivo sí borra el anterior cuando ninguna otra lo usa, y "Hacer pedido" borra los temporales que pasó a `pedidos/<folio>/`. En R2 una regla de ciclo de vida de 48 h limpiará `temporal/`; en el demo no hay limpieza automática.

**El borrador vive en el servidor** (en producción, en Mongo) para que sea el mismo en todos los dispositivos del cliente. No es una de las 10 colecciones de KARSO: hay que proponerla al socio. La limpieza automática de huérfanos queda para un spec futuro.

## Checkout: sucursal, factura y promociones

Reglas de `KARSO-PROMPT-v1.md` 3, 5.4 y 5.5, implementadas en el [SPEC 06](specs/06-checkout-sucursal-factura-y-promociones.md). Se eligen en el borrador y se guardan en el servidor, como sus líneas: el total se ve siempre al día y es el mismo en todos los dispositivos.

**Sucursal de entrega.** Obligatoria para "Hacer pedido": no hay entrega a domicilio. Se elige entre las activas del mock. El pedido guarda `sucursalEntregaId` y una copia de la sucursal (nombre, dirección, teléfono y horario), para que lo que vio el cliente no cambie si el panel la edita. Si la sucursal elegida se desactiva, el borrador la quita y avisa.

**Factura.** "Requiero factura" suma el IVA (`iva.tasa` de la configuración) y pide los datos fiscales de KARSO 6.1. **Solo se guardan: no se timbra** (el módulo de facturación queda fuera del MVP).

- Se precargan del perfil y se pueden editar. "Guardar en mi perfil", marcada por omisión, decide si el cambio actualiza el perfil o vale solo para este pedido.
- Validación (`src/lib/validation/fiscal.ts`, en el formulario y en el servidor): RFC de persona moral (12) o física (13) con fecha válida; régimen fiscal y uso de CFDI de los catálogos del SAT para CFDI 4.0, y el régimen debe corresponder al tipo de persona; código postal de 5 dígitos; correo válido. No se revisa que el uso de CFDI corresponda al régimen.
- Sin factura, el pedido guarda `datosFiscales: null`.

**Promociones.** Siempre por porcentaje y sobre el subtotal, antes del IVA:

- Mayúsculas y minúsculas dan igual. Cada código se valida por existencia y estado, vigencia, canal `en_linea`, usos totales (`usosMaximos`) y usos por cliente (`usosPorCliente`); cada motivo tiene su mensaje ("Este código venció", "Ya usaste este código", …).
- Hasta `maxCodigosPorPedido` códigos. Con `modoCombinacion: "suma"` cada código descuenta sobre el subtotal; con `"cascada"`, sobre lo que queda. El total no pasa de `descuentoMaximoPorcentaje`: el código que lo rebasa aplica solo lo que falta para el tope.
- Ejemplo de KARSO 6.5: subtotal $724.00 con `BUENFIN10` = descuento $72.40, base $651.60; con factura, IVA $104.26 y **total $755.86** (sin factura, $651.60).
- Un código que deja de valer en el borrador (vence, se agota, se desactiva) **se quita solo, con un aviso**. Si pasa justo al hacer el pedido, la API responde 409 para que el cliente vea el total nuevo antes.
- ⚠️ **Provisional:** mientras no haya backend, los usos se guardan **en el usuario** (`usosPromociones` en `users.json`, uno por código y pedido) y los totales de un código son la suma de todos los usuarios. Un pedido cancelado (por vencimiento del pago) **libera** sus códigos. El backend definirá su colección (y hará atómico el conteo, como pide KARSO); hay que acordarlo con el socio.

## Pago: Mercado Pago emulado

Reglas de `KARSO-PROMPT-v1.md` 5.6 y 5.8, implementadas en el [SPEC 07](specs/07-pago-mercado-pago-emulado-y-folio-kar.md). Mercado Pago se emula, como "Continuar con Google": **no hay cobros reales**.

**Hacer pedido** crea el pedido en `pago_pendiente` con folio `KAR-AAAA-NNNNNN` (un contador por año; el año es el de la confirmación en la zona horaria de la tienda), `vencimientoPago` = confirmación + `horasExpiracionPagoPendiente` y su primer cambio en `historialEstatus`. Después lleva a la **página de pago simulada**, que emula Checkout Pro (el cliente "sale" a pagar y regresa al detalle):

| Botón | Qué pasa |
| --- | --- |
| Aprobar | Se registra un pago `aprobado` por el total y el pedido pasa a **`enviado`** ("Pago aprobado por Mercado Pago" en el historial); `pagado` = total y `saldo` 0. |
| Rechazar | Se registra el intento `rechazado`; el pedido sigue en `pago_pendiente` y el detalle ofrece "Pagar" para reintentar. |
| Dejarlo pendiente | Se registra un pago `pendiente` (Mercado Pago aún no confirma); el pedido sigue en `pago_pendiente`. |

Cada pago queda en `pagos[]` (KARSO 6.5: `tipo: "total"`, `metodo: "mercadopago"`, monto, referencia de 10 dígitos, estatus y fecha); `pagado` y `saldo` solo cuentan los aprobados. En producción, el resultado llega por el **webhook de Mercado Pago** (con firma), no por la página: `POST /api/pedidos/:id/pago-simulado` hace lo mismo que hará el webhook.

**Vencimiento.** Si un pedido sigue en `pago_pendiente` cuando llega su hora límite (24 h por omisión), **se cancela al leerlo** (Mis pedidos, el detalle o el pago): `estatus: "cancelado"`, `cancelacion` con `por: "sistema"` y motivo "Pago no recibido en 24 h", y sus códigos de promoción se liberan. Ya no se puede pagar (409 `PAGO_VENCIDO`). Las fechas se muestran en la zona horaria de la tienda.

**Solo el admin cancela** (KARSO 5.8): la tienda no tiene botón ni ruta para cancelar. Esto revierte la decisión anterior de dejar cancelar al cliente en `pago_pendiente`; un pedido que el cliente no quiere se deja vencer.

**Nota para el socio: vencimiento en el backend.** En el demo no hay procesos en segundo plano, así que el vencimiento se revisa al leer. En el backend (NestJS en Railway) conviene **sumar** una tarea periódica, sin quitar la revisión al leer (que impide pagar un pedido vencido aunque la tarea se atrase):

- dentro del mismo servicio con `@nestjs/schedule` (p. ej. cada 5 minutos); con más de una instancia, cada cancelación debe ser un `findOneAndUpdate` condicionado a `estatus: "pago_pendiente"` y al vencimiento, para que sea segura;
- o como un servicio aparte con horario de cron en Railway, que corre y termina (revisar en su documentación la frecuencia mínima).

Falta definir con el socio qué hacer si Mercado Pago aprueba un pago de un pedido que ya se canceló por tiempo (registrar el pago y marcarlo para reembolso, por ejemplo).

## Archivos de la línea

Reglas de `KARSO-PROMPT-v1.md` 5.7, implementadas en el [SPEC 05](specs/05-archivos-frente-reverso-y-validacion.md).

**Subida en tres pasos, como con Cloudflare R2:**

1. `POST /api/archivos/subidas` crea el archivo `pendiente` y devuelve una URL firmada de 15 minutos (HMAC-SHA256 con `AUTH_SECRET` sobre método, llave, vencimiento y bytes).
2. El navegador sube el binario con `PUT` a esa URL, con barra de progreso y botón para cancelar. En el demo la sirve el **"R2 local"**, `/api/r2-local/<key>`, que guarda en `uploads/temporal/` contando bytes. En producción el `PUT` va directo a R2 y esa ruta no existe.
3. `POST /api/archivos/:id/confirmar`: el servidor lee el archivo con [`sharp`](https://sharp.pixelplumbing.com/) y guarda el ancho y alto en px, el espacio de color y el formato real. Para JPG y TIFF genera una miniatura JPG en sRGB de 400 px, porque el navegador no dibuja CMYK ni TIFF. El original no se toca.

**Formatos al subir:** JPG, JPEG, TIFF, PDF, AI, EPS y SVG (la unión de lo que acepta el catálogo), con un tope global de **40 MB**. PNG y PSD ya no se aceptan. De PDF, AI, EPS y SVG no se lee nada por dentro: solo se revisan su formato y su peso.

**Validación: solo advierte.** Las reglas son las del producto con las que sobrescribe la variante (`archivo` en el mock). Cada una que falla agrega una advertencia y la línea se guarda con `validado: false`. El editor las recalcula en vivo al cambiar de variante o de medida, sin volver a subir. El borrador y el detalle muestran la insignia "Podría ser rechazado", y "Hacer pedido" se permite igual: la decisión la toma mostrador al revisar el pedido (SPEC 08, seguimiento).

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

La máquina imprime frente y reverso en la misma pasada. Cuando el cliente no tiene diseño de reverso, la imprenta aprovecha esa cara con un **calendario** (año actual o siguiente, en la zona horaria de la tienda) o un **texto** de hasta 500 caracteres, como una oración o datos de contacto. El diseño lo hace la imprenta y **no tiene costo extra**. ⚠️ Esta regla no está en `KARSO-PROMPT-v1.md`: **hay que proponerla al socio**. Al recalcular el borrador, un calendario de un año que ya pasó marca la línea con problema.

**Al hacer el pedido,** cada cara con archivo de cada línea se copia a `uploads/pedidos/<folio>/<lineaId>_frente.<ext>` (o `_reverso`), con su miniatura, como un archivo nuevo, y la línea apunta a él. Un mismo archivo en dos líneas se copia dos veces. Los temporales que ya nadie usa se borran. Las rutas usan el folio `KAR-…` (SPEC 07).

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
│   ├── sucursales/      #   esquema de sucursales (y dirección)
│   ├── promociones/     #   esquema de promociones
│   ├── configuracion/   #   esquema de la configuración general (lo que usa la tienda)
│   └── pedidos/         #   cotización, promociones, pago (folio, vencimiento), evaluación de líneas, validación de archivos y formato (puros: los usan front y servidor)
├── server/              # solo servidor: dominio, sesión, repositorios, mock del panel, almacén JSON y de archivos, URL firmada y sharp
└── middleware.ts        # redirecciones según el estado de la cuenta
config/mock-panel/       # productos, banners, sucursales, promociones y configuración simulados del panel de KARSO
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
| [06](specs/06-checkout-sucursal-factura-y-promociones.md) | Checkout: sucursal de entrega, factura con IVA y datos fiscales (SAT), códigos de promoción (suma o cascada, tope, usos) | En verificación |
| [07](specs/07-pago-mercado-pago-emulado-y-folio-kar.md) | Pago: Mercado Pago emulado, folio `KAR-…`, estatus e historial de KARSO, `pago_pendiente` → `enviado`, vencimiento al leer; solo el admin cancela | En verificación |
| 08 | Seguimiento: 8 estatus y estatus por línea, fecha de entrega, QR, rechazo y corrección, simulador del panel | Pendiente |
| 09 | Perfil (socio, dirección, editar datos fiscales) y sesión con access/refresh y JWKS | Pendiente |

La hoja de ruta 04–09 sale de alinear la tienda con `KARSO-PROMPT-v1.md` (la del SPEC 02 queda reemplazada). La SPEC 06 original (checkout y pago) se dividió en checkout (06) y pago (07). El panel de administración es otro proyecto: aquí solo se simulan sus datos.

Fuera del demo por ahora: recuperar contraseña, verificación de correo, envío real de códigos, OAuth real de Google, backend real (NestJS + MongoDB + Cloudflare R2), miniaturas y lectura de PDF/AI/EPS/SVG, limpieza de archivos huérfanos, notificaciones y timbrado de factura (CFDI). La app es 100% web: no hay versión de escritorio.
