# SPEC 08 — Seguimiento: estatus por línea, disponible para recoger y QR

> **Estado:** Approved
> **Depende de:** SPEC 06, SPEC 07
> **Fecha:** 2026-11-07
> **Objetivo:** Que el cliente siga su pedido de `enviado` a `entregado`, con el estatus de cada línea y del pedido, el día a partir del cual puede recogerlo (días hábiles con corte y festivos), un QR que abre la traza de su pedido y la línea de tiempo del historial. Todo lo calcula el servidor, como lo hará el backend, y en el demo lo mueve un simulador del panel.

---

## Por qué existe este spec

La SPEC 07 deja el pedido en `enviado` al pagarse. Lo que sigue lo hace el panel de KARSO (5.8 y 5.9):

- **Estatus:** mostrador valida (`recibido`), cada línea pasa a `en_proceso` y a `listo`, y el estatus del pedido se **calcula** a partir de sus líneas. Mostrador lo entrega cuando el saldo es $0.
- **Fecha de entrega:** días hábiles de lunes a sábado, sin festivos, con corte de las 4:00 pm (sábado 12:00 pm). Se cuenta desde `recibido` y es la más tardía de las líneas.
- **QR:** cada pedido tiene uno, para recogerlo.

La tienda **no** hace nada de eso: solo lo muestra. Para verlo en el demo, un **simulador del panel** hace lo que hará el panel real. Toda la lógica vive en el servidor, que emula al backend, para que la tienda solo lea campos del pedido (decisión del usuario).

La descripción original incluía también el rechazo y la corrección de archivos. Se dividió (decisión del usuario):

- **08 · Seguimiento** (este spec).
- **09 · Rechazo y corrección de archivos.**
- **10 · Perfil y sesión** (antes la 09).

**Decisiones del negocio y del socio** (2026-11-07):

1. La tienda no promete una "fecha de entrega": dice **"Disponible para recoger a partir del martes 10 nov"**. Es la `fechaEntregaEstimada` de KARSO, con otro texto.
2. El pedido lo **cierra otro panel** (mostrador) cuando se entrega. En el demo lo hace el simulador.

---

## Alcance

**Entra:**

- **Estatus por línea (KARSO 5.8):**
  - cada línea tiene `estatus`: `recibido`, `en_proceso`, `listo` o `null` antes de que se valide el pedido;
  - cada línea tiene también su `fechaEntregaEstimada`;
  - el estatus del pedido se calcula así: `listo` si todas las líneas están listas, `en_proceso` si alguna está en proceso o lista, y si no, el del pedido (`recibido`).
- **Días hábiles (KARSO 5.9):**
  - la configuración suma el bloque `entregas` de KARSO 6.9: días hábiles con su corte y festivos;
  - al pasar a `recibido`, el servidor fija `fechaInicioConteo` y calcula la fecha de cada línea (día de recepción + `diasEntrega` días hábiles) y la del pedido (la más tardía);
  - `diasEntrega: 0` es el mismo día si se recibe antes del corte.
- **"Disponible para recoger a partir del…":**
  - desde `recibido`, el detalle muestra la fecha del pedido con su día de la semana, y cada línea muestra la suya;
  - antes de `recibido`, muestra "Estará listo N días hábiles después de que validemos tus archivos", donde N es el mayor `diasEntrega` de sus líneas.
- **Historial:** el detalle muestra `historialEstatus` como línea de tiempo, con fecha, estatus y comentario. Es la traza del pedido.
- **QR para el cliente:**
  - aparece en el detalle desde `pago_pendiente`, y más grande cuando el pedido está `listo`, con "Muéstralo al recoger";
  - lleva el enlace a `/panel/seguimiento/<folio>`, que pide sesión de **su dueño** y muestra la traza;
  - el folio va en el enlace, así que mostrador lo puede leer al escanearlo;
  - se dibuja en el navegador con la librería `qrcode`.
- **Simulador del panel** (`/demo/panel` y `/api/demo-panel/...`), que solo existe con `DEMO_PANEL=1`:
  - lista todos los pedidos de todos los clientes, con folio, cliente, estatus, saldo y líneas;
  - **Validar** (`enviado` → `recibido`): las líneas pasan a `recibido` y se calculan las fechas;
  - **Línea a `en_proceso`** y **línea a `listo`**: el estatus del pedido se recalcula;
  - **Entregar** (`listo` → `entregado`): solo con saldo de $0;
  - cada acción queda en el historial con `por: "panel-demo"`;
  - no tiene enlace desde la tienda.
- **Notificaciones preparadas:**
  - una sola función, `notificar(evento, pedido)`, para `pedido.enviado` (pago aprobado, que es el "pedido confirmado" de KARSO) y `pedido.listo`;
  - en el demo solo escribe en la consola del servidor `[DEMO CORREO] …`;
  - el backend la reemplazará por sus eventos (ver la nota al final).
- **Datos:** `orders.json` pasa a la versión 6 y descarta la 5, como en las specs anteriores.
- Tests de unidad, de route handlers y e2e.

**Fuera de alcance:**

- El rechazo con motivo, la corrección en 5 días y la cancelación por no corregir (SPEC 09).
- Producción, lotes y descarga para armado (KARSO 5.10 y 6.7): son solo del panel. `loteId` existe en la línea, pero siempre vale `null`.
- Pagos en mostrador y saldo pendiente al escanear (panel).
- Correo y WhatsApp reales (backend).
- Que el cliente elija o pida una fecha.
- La página de seguimiento pública, sin sesión.

---

## Modelo de datos

### Configuración (`src/lib/configuracion/schema.ts`, KARSO 6.9)

```ts
interface DiaHabil {
  dia: "lunes" | "martes" | "miercoles" | "jueves" | "viernes" | "sabado" | "domingo";
  corte: string;       // "16:00", hora local de la tienda
  cierre?: string;     // "14:00" (sábado); solo informativo
}

// en ConfiguracionTienda:
entregas: {
  diasHabiles: DiaHabil[];   // lunes a viernes a las 16:00 y sábado a las 12:00, como KARSO
  festivos: string[];        // ["2026-11-16", "2026-12-25", "2027-01-01"], "YYYY-MM-DD" en la zona de la tienda
};
```

### Reglas puras (`src/lib/pedidos/entrega.ts`)

- **`diaDeRecepcion(fecha, entregas, zona)`:** devuelve el día, en formato `"YYYY-MM-DD"`. Si la fecha cae en un día hábil antes de su corte, es ese mismo día. Si es después del corte, en domingo o en festivo, es el siguiente día hábil.
- **`sumarDiasHabiles(dia, n, entregas)`:** el día que resulta de sumar `n` días hábiles, saltando domingos y festivos.
- **`fechaEntregaLinea(fechaInicioConteo, diasEntrega, entregas, zona)`:** `sumarDiasHabiles(diaDeRecepcion(...), diasEntrega)`.
- **`fechaEntregaPedido(lineas)`:** la más tardía de las líneas.
- **`estatusDelPedido(estatusPedido, lineas)`:** el cálculo de KARSO 5.8. Solo aplica desde `recibido`; `entregado`, `cancelado` y los anteriores a `recibido` se quedan como están.

Ejemplos de KARSO 5.9 (con 5 días hábiles y el lunes 16 de noviembre festivo), que van como tests:

| Pasa a `recibido` | Día de recepción | Disponible a partir del |
| --- | --- | --- |
| Lunes 2 nov, 10:00 am | Lunes 2 | Sábado 7 nov |
| Lunes 2 nov, 5:00 pm | Martes 3 | Lunes 9 nov |
| Sábado 7 nov, 1:00 pm | Lunes 9 | Sábado 14 nov |
| Martes 10 nov, 10:00 am | Martes 10 | Martes 17 nov |

El ejemplo completo de KARSO también va como test. Se recibe el lunes 2 de noviembre a las 3:40 pm, con una tarjeta de 5 días y una lona de 2: la tarjeta queda el sábado 7, la lona el miércoles 4 y el pedido el **sábado 7**.

### Pedido (`src/server/domain/pedido.ts`)

Se agregan los campos de KARSO 6.5:

```ts
// en LineaPedido:
estatus: "recibido" | "en_proceso" | "listo" | null;  // null hasta que se valida el pedido
fechaEntregaEstimada: string | null;                  // "YYYY-MM-DD"
loteId: string | null;                                // siempre null en la tienda (lo asigna el armado)

// en Pedido:
fechaInicioConteo: string | null;      // ISO, al pasar a recibido
fechaEntregaEstimada: string | null;   // "YYYY-MM-DD": la más tardía de las líneas
qr: string | null;                     // el folio, como KARSO ("KAR-2026-000001"); se asigna al confirmar
```

- `data/orders.json` pasa a la versión 6 y descarta la versión 5.
- **El enlace del QR** no se guarda. El front lo arma con el origen de la tienda y el `qr`: `<origen>/panel/seguimiento/KAR-2026-000001`.

### Notificaciones (`src/server/notificaciones.ts`)

```ts
type EventoPedido = "pedido.enviado" | "pedido.listo";   // "pedido.rechazado" llega en la SPEC 09
function notificar(evento: EventoPedido, pedido: Pedido): void;
// Demo: console.info("[DEMO CORREO] Tu pedido KAR-2026-000001 está listo para recoger en KARSO Centro")
```

Se llama al aprobar el pago (`pedido.enviado`) y cuando el pedido pasa a `listo` (`pedido.listo`). Si falla, el cambio de estatus no se afecta.

### API

| Método y ruta | Uso | Errores principales |
| --- | --- | --- |
| `GET /api/pedidos/folio/:folio` | El pedido del usuario con ese folio → `{ pedido, archivos }`, para la página de seguimiento | 404 si no existe o no es suyo |
| `GET /api/demo-panel/pedidos` | Todos los pedidos (no los borradores), recientes primero, con el nombre del cliente | 404 sin `DEMO_PANEL=1` |
| `POST /api/demo-panel/pedidos/:id/validar` | `enviado` → `recibido`, con las fechas calculadas | 409 si no está en `enviado` |
| `POST /api/demo-panel/pedidos/:id/lineas/:lineaId` | `{ estatus: "en_proceso" \| "listo" }` → recalcula el estatus del pedido | 409 si el pedido no está en `recibido` o `en_proceso`, o si la línea retrocede |
| `POST /api/demo-panel/pedidos/:id/entregar` | `listo` → `entregado` | 409 si no está en `listo` o si el saldo no es $0 |

Las rutas `demo-panel` no piden sesión de cliente. Si `DEMO_PANEL` no vale `1`, responden 404, igual que la página `/demo/panel`.

---

## Plan de implementación

1. **Días hábiles.**
   - `entregas` en la configuración, con su esquema y el mock.
   - `src/lib/pedidos/entrega.ts` con sus tests: la tabla de KARSO 5.9, el ejemplo completo, `diasEntrega: 0` antes y después del corte, el sábado después de las 12:00, el domingo, un festivo y el cambio de año.
2. **Estatus por línea y datos.**
   - Los campos nuevos de la línea y del pedido; `orders.json` v6 con descarte de la v5.
   - `estatusDelPedido` con sus tests.
   - `qr` = folio al confirmar.
3. **Simulador: servidor.**
   - `src/server/pedidos/panel-demo.ts`: `validar`, `cambiarEstatusLinea` y `entregar`, con historial `por: "panel-demo"` y las fechas calculadas al validar.
   - `src/server/notificaciones.ts`, llamado al aprobar el pago y al quedar listo el pedido.
   - Las rutas `/api/demo-panel/...` detrás de `DEMO_PANEL`.
   - `GET /api/pedidos/folio/:folio`.
   - Tests de rutas:
     - sin `DEMO_PANEL`, 404;
     - validar calcula las fechas, con reloj simulado al lunes 2 de noviembre a las 3:40 pm, y da el sábado 7;
     - una línea en proceso deja el pedido `en_proceso`, y todas listas lo dejan `listo` y avisan con `notificar`;
     - entregar con saldo da `entregado`, y sin estar listo da 409;
     - una línea no retrocede;
     - por folio responde solo al dueño.
4. **Cliente HTTP y hooks.** `pedidosApi.porFolio` y `usePedidoPorFolio`. El cliente del simulador va aparte, en `src/lib/demo-panel-api.ts` con `use-demo-panel`. Tests.
5. **Pantallas de la tienda.**
   - **Detalle:**
     - estatus por línea en `item-resumen`;
     - "Disponible para recoger a partir del …" en la tarjeta de entrega, o los días hábiles antes de validar;
     - la línea de tiempo del historial (`historial-estatus`, nueva);
     - el QR (`qr-seguimiento`, nueva), más grande en `listo`.
   - **`/panel/seguimiento/[folio]`:** carga el pedido por folio y muestra el detalle; si no es del usuario, "Pedido no encontrado".
   - Se suma la dependencia `qrcode` con versión exacta.
6. **Pantalla del simulador** (`/demo/panel`): lista de pedidos con sus acciones y su resultado, solo con `DEMO_PANEL=1`.
7. **E2E.** Se agrega `e2e/seguimiento.spec.ts`: el servidor de e2e arranca con `DEMO_PANEL=1`. Se ajustan las suites existentes si hace falta.
8. **Documentación.** El README suma:
   - los estatus por línea y su cálculo;
   - los días hábiles y "disponible para recoger";
   - el QR y la página de seguimiento;
   - el simulador y cómo activarlo;
   - `orders.json` v6;
   - la hoja de ruta: 09 rechazo y corrección, y 10 perfil y sesión;
   - la [nota sobre notificaciones](#nota-para-el-backend-notificaciones).

---

## Criterios de aceptación

- [ ] Con `DEMO_PANEL=1`, `/demo/panel` lista los pedidos con folio, cliente, estatus, saldo y líneas. Sin la variable, la página y sus rutas responden 404, y la tienda no tiene enlace al simulador.
- [ ] **Validar** un pedido `enviado` lo deja en `recibido`: las líneas quedan en `recibido`, el historial registra `por: "panel-demo"`, y se fijan `fechaInicioConteo` y las fechas. Validarlo otra vez responde 409.
- [ ] Recibido el lunes 2 de noviembre de 2026 a las 3:40 pm (reloj simulado), la tarjeta (5 días) queda el sábado 7, la lona (2 días) el miércoles 4 y el pedido el sábado 7. Los cuatro ejemplos de KARSO 5.9 dan las fechas de su tabla.
- [ ] El detalle de un pedido `recibido` dice "Disponible para recoger a partir del sábado 7 nov", y cada línea muestra su fecha. Antes de validar dice "Estará listo 5 días hábiles después de que validemos tus archivos".
- [ ] Pasar una línea a `en_proceso` deja el pedido en `en_proceso`. Con todas las líneas en `listo`, el pedido queda `listo` y la consola muestra `[DEMO CORREO] … está listo para recoger …`. Una línea no puede volver de `listo` a `en_proceso`: responde 409.
- [ ] **Entregar** un pedido `listo` con saldo de $0 lo deja en `entregado`. Entregar uno que no está `listo`, o con saldo, responde 409.
- [ ] El detalle muestra el historial como línea de tiempo, desde "Pago pendiente" hasta "Entregado", con fecha y comentario.
- [ ] El QR aparece en el detalle desde `pago_pendiente`, y más grande con "Muéstralo al recoger" en `listo`. Lleva `<origen>/panel/seguimiento/<folio>`.
- [ ] `/panel/seguimiento/<folio>` muestra el pedido a su dueño. A otro usuario le dice "Pedido no encontrado", y sin sesión manda a `/login`.
- [ ] Al aprobar el pago, la consola muestra `[DEMO CORREO] … pedido KAR-… confirmado …`.
- [ ] La tienda no calcula fechas ni estatus: solo lee `estatus`, `productos[].estatus`, `fechaEntregaEstimada`, `historialEstatus` y `qr` del pedido.
- [ ] Un `orders.json` de versión 5 se reemplaza por uno vacío sin romper la app.
- [ ] A 375 px no hay scroll horizontal en el detalle (con historial y QR), en la página de seguimiento ni en `/demo/panel`.
- [ ] Ningún componente importa de `src/server`, y las reglas de atomic design pasan en el lint.
- [ ] `pnpm test`, `pnpm test:e2e`, `pnpm lint` y `pnpm build` pasan.

---

## Decisiones

- **Sí:** dividir la descripción original en seguimiento (08) y rechazo y corrección (09); perfil y sesión pasa a la 10 (decisión del usuario).
- **Sí:** la lógica (estatus del pedido, días hábiles y fechas) vive en el servidor, y la tienda solo lee campos del pedido, como con el backend real (decisión del usuario).
- **Sí:** el simulador del panel en `/demo/panel`, detrás de `DEMO_PANEL=1` y con historial `por: "panel-demo"` (decisión del usuario). Sus rutas hacen lo que harán los endpoints del panel.
- **No:** editar `orders.json` a mano para ver el flujo. Es poco práctico para probar y para hacer demostraciones.
- **Sí:** "Disponible para recoger a partir del…" en lugar de "fecha de entrega" (decisión del negocio). El campo sigue llamándose `fechaEntregaEstimada`, como en KARSO.
- **Sí:** antes de `recibido` solo se muestran los días hábiles (decisión del usuario). La fecha depende de cuándo se valide.
- **No:** una fecha pedida por el cliente ni que el panel posponga la entrega. No hacen falta: el negocio prefiere "disponible a partir de".
- **Sí:** el QR es para los clientes y abre la traza con su sesión (decisión del usuario). El enlace lleva el folio, para que mostrador lo lea al escanear.
- **No:** una página pública de seguimiento. Mostraría el pedido sin sesión.
- **Sí:** el QR aparece desde el inicio (`pago_pendiente`) (decisión del usuario).
- **Sí:** `qr` guarda el folio, como KARSO, y el enlace lo arma el front con el origen de la tienda. Así funciona en local, en preproducción y en producción.
- **Sí:** el pedido lo cierra como `entregado` otro panel, el de mostrador, y en el demo el simulador, solo con saldo de $0 (KARSO 5.6).
- **Sí:** una sola función `notificar()` que en el demo escribe en la consola (decisión del usuario: preparar algo). El envío real lo hará el backend.
- **Sí:** producción, lotes y armado (5.10 y 6.7) quedan fuera porque son solo del panel. `loteId` existe en la línea, pero siempre vale `null`.
- **Sí:** `orders.json` versión 6 descartando los datos anteriores, como en las specs anteriores.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El simulador queda activo en producción | Solo existe con `DEMO_PANEL=1`; sin la variable, la página y las rutas responden 404. El README lo advierte. |
| Las fechas se corren por la zona horaria (el corte de las 16:00 es hora local) | Todo se calcula en `zonaHoraria` de la configuración, con tests en el corte, en sábado, en domingo, en festivo y en el cambio de año. |
| Los festivos del mock se quedan viejos | Vienen del panel (configuración). Los tests usan los de KARSO de 2026. |
| El QR no se lee bien en pantallas chicas | Se dibuja en SVG con margen y tamaño mínimo, y más grande en `listo`. |
| Que el cliente tome la fecha como una promesa | El texto dice "disponible a partir de", y antes de validar solo se dan los días hábiles. |

---

## Nota para el backend: notificaciones

KARSO pide como mínimo avisar al cliente cuando su pedido se confirma, se rechaza y está listo. La tienda no debería enviar nada; lo propio es que lo haga el backend:

- **Eventos del dominio:** cada cambio de estatus, al agregarse a `historialEstatus`, emite un evento: `pedido.enviado`, `pedido.rechazado`, `pedido.listo`.
- **Outbox:** el evento se guarda en la misma transacción que el cambio, en una colección `notificaciones`, para que no se pierda si el envío falla.
- **Un worker lo envía:**
  - por **correo**, con un proveedor como Resend o Amazon SES y plantillas por evento;
  - y por **WhatsApp**, porque el teléfono ya está verificado por WhatsApp, con plantillas aprobadas de la Cloud API de Meta.

  El worker reintenta y registra el resultado.
- **En el demo:** `notificar()` marca exactamente dónde se emitirán esos eventos. Con el backend, desaparece.

---

## Lo que **no** está en este spec

- Rechazo, motivo, corrección en 5 días y cancelación por no corregir (SPEC 09).
- Producción, lotes y descarga para armado (panel).
- Pagos de mostrador y saldo al escanear (panel).
- Correo y WhatsApp reales (backend).
- Fecha pedida por el cliente.
- Seguimiento público sin sesión.

Cada uno de estos, si llega, va en su propio spec.
