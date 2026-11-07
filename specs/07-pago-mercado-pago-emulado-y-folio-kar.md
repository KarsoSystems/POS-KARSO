# SPEC 07 — Pago: Mercado Pago emulado, folio KAR y pago pendiente

> **Estado:** Approved
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-11-07
> **Objetivo:** Que "Hacer pedido" cree el pedido con folio `KAR-AAAA-NNNNNN` en `pago_pendiente`, que el cliente lo pague en una página que emula Mercado Pago (aprobar, rechazar o dejar pendiente) y que el pedido pase a `enviado` al aprobarse el pago, o a `cancelado` si no se paga antes de `horasExpiracionPagoPendiente`, con el estatus, el historial y los pagos de KARSO 5.6, 5.8 y 6.5.

---

## Por qué existe este spec

Hoy "Hacer pedido" deja el pedido en un estado propio del demo (`pedido`) con `pago: { estado: "pendiente" }`, folio `P-000001` y un botón para que el cliente lo cancele. KARSO define otra cosa:

- **Pago (5.6):** completo con Mercado Pago. El pedido nace en `pago_pendiente`, pasa a `enviado` cuando Mercado Pago lo confirma (webhook) y, si no se paga en `horasExpiracionPagoPendiente` (24 h), se cancela automáticamente.
- **Estatus (5.8 y 6.5):**
  - el campo `estatus` lleva 8 valores;
  - `historialEstatus` registra fecha, quién y un comentario en cada cambio;
  - `pagos[]` guarda cada pago, y `pagado` y `saldo` resumen lo cobrado;
  - `cancelacion` registra la cancelación.
- **Folio (6.5 y 6.10):** `KAR-2026-001001`, con un contador por año.
- **Cancelado: solo admin** (5.8).

Este spec es la segunda mitad de la SPEC 06 original, que se dividió en checkout (06) y pago (07). Mercado Pago se emula, igual que Google (decisión del usuario).

**Decisiones del usuario que cambian o completan KARSO** (hay que comentarlas con el socio):

1. **Solo el admin cancela**, como dice KARSO 5.8, y el sistema cuando vence el pago. Esto **revierte** la decisión del 2026-11-05 de dejar que el cliente cancelara en `pago_pendiente`: la tienda ya no tiene botón ni ruta para cancelar.
2. **La zona horaria de la tienda es `America/Mexico_City`.** KARSO 6.9 dice `America/Monterrey`. Desde 2022 las dos tienen el mismo desfase todo el año, así que el resultado es igual, pero el valor de la configuración cambia.
3. **El vencimiento se revisa al leer el pedido**, sin una tarea periódica. Ver la [nota para el socio](#nota-para-el-socio-vencimiento-en-el-backend).

---

## Alcance

**Entra:**

- **Estatus de KARSO:**
  - el pedido cambia `estado` por `estatus`, con el enum completo de 6.5 (`pago_pendiente`, `enviado`, `recibido`, `en_proceso`, `listo`, `entregado`, `rechazado`, `cancelado`) más `borrador`, que es propio del demo;
  - `historialEstatus` de KARSO;
  - en este spec el sistema solo produce `pago_pendiente`, `enviado` y `cancelado`. Los demás estatus los asigna el panel (SPEC 08, seguimiento); en el demo se pueden escribir a mano en `orders.json`.
- **"Hacer pedido":**
  - crea el pedido en `pago_pendiente`, con folio `KAR-AAAA-NNNNNN` y `vencimientoPago` = confirmación + `horasExpiracionPagoPendiente`;
  - el historial registra `{ estatus: "pago_pendiente", por: "sistema" }`;
  - después lleva al cliente a la página de pago.
- **Página de pago simulada** (`/panel/pedidos/[id]/pago`), que emula Checkout Pro:
  - muestra el folio, el total y la hora límite, con tres botones: **Aprobar**, **Rechazar** y **Dejarlo pendiente**;
  - cada botón llama a `POST /api/pedidos/:id/pago-simulado`, que aplica la lógica que tendrá el webhook real, y regresa al detalle con un mensaje según el resultado.
- **Resultado del pago:**
  - **aprobado:** registra el pago y el pedido pasa a `enviado`, con su historial ("Pago aprobado por Mercado Pago");
  - **rechazado:** registra el intento y el pedido sigue en `pago_pendiente`, con "Pagar" para reintentar hasta que venza;
  - **pendiente:** registra el pago como pendiente y el pedido sigue en `pago_pendiente`.
- **Pagos de KARSO:** `pagos[]` (`tipo: "total"`, `metodo: "mercadopago"`, monto, referencia simulada, estatus, fecha, `recibidoPor: null`), y `pagado` y `saldo`, que solo cuentan los pagos aprobados.
- **Vencimiento al leer:**
  - al leer un pedido (lista, detalle o pago), si sigue en `pago_pendiente` y ya pasó `vencimientoPago`, pasa a `cancelado`;
  - se registra `cancelacion` (`por: "sistema"`, motivo "Pago no recibido en 24 h", `reembolso: null`) y su historial;
  - se liberan los usos de sus códigos de promoción;
  - pagar un pedido vencido responde 409.
- **Sin cancelación por el cliente:** se retiran `POST /api/pedidos/:id/cancelar`, el botón "Cancelar pedido" y su diálogo.
- **Folio:**
  - `KAR-{año}-{6 dígitos}`, con un contador por año en `orders.json` (`contadores: { "pedidos-2026": n }`, como KARSO 6.10);
  - el año sale de la fecha de confirmación en la zona horaria de la configuración;
  - empieza en `KAR-2026-000001`;
  - los archivos se copian a `pedidos/KAR-…/`.
- **Configuración:**
  - `configuracion.json` cambia `zonaHoraria` a `America/Mexico_City` y suma `pedidos.horasExpiracionPagoPendiente: 24`;
  - el año del calendario del reverso (SPEC 05) usa la misma zona horaria.
- **Pantallas:**
  - **detalle:**
    - en `pago_pendiente` muestra "Pagar $X" y "Paga antes del …";
    - en `enviado`, "Pagado el … · Ref. …";
    - en `cancelado`, el motivo;
  - **Mis pedidos y el detalle** muestran las insignias de cada estatus;
  - **el borrador** conserva el texto "Hacer pedido".
- **Datos:** `orders.json` pasa a la versión 5 y descarta la versión 4, igual que en las specs anteriores; con eso se pierden los pedidos `P-…`.
- Tests de unidad, de route handlers y e2e.

**Fuera de alcance:**

- Mercado Pago real: preferencias, SDK, webhook con firma y llaves.
- **Seguimiento (SPEC 08):** `recibido`, `en_proceso`, `listo`, `entregado`, `rechazado`, el estatus por línea, la fecha de entrega, el QR, el rechazo y la corrección de archivos, y el simulador del panel.
- Cancelación y reembolsos por el admin, que es el panel, otro proyecto.
- Pagos de mostrador (anticipo y liquidación).
- Notificaciones por correo ("pedido confirmado").
- Tarea periódica de vencimiento (queda como nota para el backend).

---

## Modelo de datos

### Configuración (`src/lib/configuracion/schema.ts`)

```ts
interface ConfiguracionTienda {
  zonaHoraria: string;                 // "America/Mexico_City" (KARSO: "America/Monterrey"; mismo desfase)
  iva: { tasa: number };
  promociones: { ... };                // SPEC 06
  pedidos: {
    horasExpiracionPagoPendiente: number;  // 24, entero positivo
  };
}
```

La lógica pura que corre también en el front, como el año del calendario de la SPEC 05, no tiene acceso a la configuración. Por eso usa una constante, `ZONA_HORARIA_TIENDA`, con el mismo valor. Un test revisa que coincida con `configuracion.json`.

### Estatus (`src/lib/pedidos/formato.ts`)

```ts
type EstatusPedido =
  | "borrador"        // propio del demo: el carrito en el servidor
  | "pago_pendiente" | "enviado" | "recibido" | "en_proceso" | "listo" | "entregado" | "rechazado" | "cancelado";

const ETIQUETA_ESTATUS: Record<EstatusPedido, string> = {
  borrador: "Borrador",
  pago_pendiente: "Pago pendiente",
  enviado: "Enviado",
  recibido: "Recibido",
  en_proceso: "En proceso",
  listo: "Listo",
  entregado: "Entregado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
};
```

### Pedido (`src/server/domain/pedido.ts`)

Cambios respecto a la SPEC 06, con los nombres de KARSO 6.5:

```ts
interface CambioEstatus {
  estatus: EstatusPedido;
  fecha: string;            // ISO 8601
  por: string;              // "sistema" (o el id del empleado, desde el panel)
  comentario: string;
}

interface Pago {
  tipo: "total";            // anticipo y liquidación son de mostrador
  metodo: "mercadopago";
  monto: number;            // en pesos: el total del pedido
  referencia: string;       // 10 dígitos al azar, como el id de pago de Mercado Pago
  estatus: "aprobado" | "rechazado" | "pendiente";
  fecha: string;
  recibidoPor: null;        // solo en mostrador
}

interface Cancelacion {
  fecha: string;
  por: string;              // "sistema" en la tienda
  motivo: string;           // "Pago no recibido en 24 h"
  reembolso: null;          // los reembolsos los registra el admin
}

// en Pedido:
estatus: EstatusPedido;              // reemplaza a `estado`
historialEstatus: CambioEstatus[];   // [] en el borrador
folio: string | null;                // "KAR-2026-000001" al confirmar
vencimientoPago: string | null;      // propio del demo: confirmadoAt + horasExpiracionPagoPendiente
pagos: Pago[];
pagado: number;                      // suma de los pagos aprobados
saldo: number;                       // total − pagado
cancelacion: Cancelacion | null;
// se retiran: estado, pago: { estado }, canceladoAt
```

`data/orders.json` pasa a la versión 5: `{ version: 5, contadores: Record<string, number>, pedidos: Pedido[] }`.

- **`contadores`** reemplaza a `ultimoFolio`. La llave es `pedidos-<año>` y el folio se asigna en el mismo lock que la confirmación, como ahora.
- **La versión 4 se descarta.**

### Reglas puras (`src/lib/pedidos/pago.ts`)

- **`formatFolio(anio, consecutivo)`:** `formatFolio(2026, 1)` da `"KAR-2026-000001"`.
- **`anioEn(fecha, zonaHoraria)`:** el año en esa zona. Por ejemplo, `2026-12-31T23:30-06:00` todavía es 2026 en la Ciudad de México y `2027-01-01T06:30Z` ya es 2027.
- **`vencimientoPago(confirmadoAt, horas)`:** la fecha ISO límite para pagar.
- **`venceElPago(pedido, ahora)`:** `true` si el pedido está en `pago_pendiente` y `ahora ≥ vencimientoPago`.
- **`resumenPagos(pagos, total)`:** devuelve `{ pagado, saldo }`, sumando solo los aprobados, en centavos enteros.

### API

| Método y ruta | Uso | Errores principales |
| --- | --- | --- |
| `POST /api/pedidos/borrador/confirmar` | Además de lo de la SPEC 06: folio `KAR-…`, `pago_pendiente`, `vencimientoPago` e historial → `{ pedido, archivos }` | Sin cambios |
| `POST /api/pedidos/:id/pago-simulado` | `{ resultado: "aprobado" \| "rechazado" \| "pendiente" }` → registra el pago y, si se aprueba, pasa el pedido a `enviado` → `{ pedido, archivos }` | 404 si no es del usuario; 409 `PAGO_VENCIDO` si ya venció (y lo cancela); 409 `ESTATUS_INVALIDO` si no está en `pago_pendiente` |
| `GET /api/pedidos` y `GET /api/pedidos/:id` | Además, antes de responder, cancelan los pedidos del usuario cuyo pago venció | Sin cambios |
| `POST /api/pedidos/:id/cancelar` | **Se retira** (solo el admin cancela) | — |

---

## Plan de implementación

1. **Configuración y reglas puras.**
   - `configuracion.json` cambia la zona horaria a `America/Mexico_City` y suma `pedidos.horasExpiracionPagoPendiente: 24`; también su esquema.
   - `ZONA_HORARIA_TIENDA` reemplaza a la constante de Monterrey de `archivo-linea.ts`.
   - `src/lib/pedidos/pago.ts` con su test: el folio, el año en el cambio de año, el vencimiento a las 24 h y el resumen con un pago rechazado y uno aprobado.
   - Un test revisa que la constante coincida con el mock.
2. **Estatus y datos.**
   - `EstatusPedido` y sus etiquetas.
   - Los campos nuevos del pedido; `orders.json` versión 5 con `contadores` y descarte de la 4.
   - El repositorio asigna el folio `KAR-` con el contador del año.
   - Todo el código que usaba `estado`, `pago` o `canceladoAt` pasa a los campos nuevos.
   - Se retiran la ruta de cancelar, su botón y sus tests.
   - Tests: repositorio (folio por año, contador nuevo al cambiar de año, descarte de la versión 4) y rutas existentes ajustadas.
3. **Confirmar, pagar y vencer.**
   - `confirmar` crea el pedido en `pago_pendiente` con su historial y su vencimiento.
   - `src/server/pedidos/pago.ts` con `registrarPagoSimulado` y `vencerPagosDelUsuario`.
   - `POST /api/pedidos/:id/pago-simulado`, y el vencimiento en `GET /api/pedidos` y `GET /api/pedidos/:id`.
   - Tests de rutas:
     - pagar aprobado: `enviado`, historial, `pagado` = total y `saldo` 0;
     - rechazado y luego aprobado: dos pagos, y `pagado` solo cuenta el aprobado;
     - pendiente: sigue en `pago_pendiente`;
     - pagar un pedido `enviado` da 409;
     - pagar uno de otro usuario da 404;
     - con reloj simulado a las 24 h: al leer pasa a `cancelado` con su motivo y libera `BIENVENIDA5`, y pagarlo da 409 `PAGO_VENCIDO`;
     - un minuto antes del vencimiento sí se puede pagar;
     - los archivos quedan en `pedidos/KAR-2026-000001/`.
4. **Cliente HTTP y hooks.** `pedidosApi.pagarSimulado(id, resultado)` y `usePagarSimulado(id)`, que actualizan la caché del detalle e invalidan la lista. Tests.
5. **Pantallas.**
   - La página `/panel/pedidos/[id]/pago`, con un organismo y la plantilla del panel.
   - **El borrador** lleva a la página de pago después de "Hacer pedido".
   - **El detalle:**
     - en `pago_pendiente`: "Pagar $X" y "Paga antes del …" con fecha y hora en la zona horaria de la tienda;
     - en `enviado`: "Pagado el … · Ref. …";
     - en `cancelado`: el motivo de la cancelación;
     - el mensaje al volver de la página de pago;
     - ya no tiene botón de cancelar.
   - **`estado-badge`** con todos los estatus, usada también en Mis pedidos.
6. **E2E.**
   - Se actualizan `e2e/pedidos.spec.ts`, `e2e/checkout.spec.ts` y `e2e/archivos.spec.ts`: folio `KAR-…`, estatus `pago_pendiente` y ya sin cancelar desde la tienda. El test de usos de `BIENVENIDA5` se libera ahora por vencimiento.
   - Se agrega `e2e/pago.spec.ts` con los flujos de los criterios. Para el vencimiento, el test edita `vencimientoPago` en `orders.json`.
7. **Documentación.** El README suma:
   - el flujo de pago simulado;
   - los estatus y el historial;
   - el folio `KAR-`;
   - el vencimiento al leer;
   - que solo el admin cancela;
   - la zona horaria `America/Mexico_City` (con la diferencia frente a KARSO);
   - `orders.json` versión 5;
   - la [nota para el socio](#nota-para-el-socio-vencimiento-en-el-backend).

---

## Criterios de aceptación

- [ ] "Hacer pedido" crea el pedido con folio `KAR-2026-000001` (y el siguiente `KAR-2026-000002`), estatus `pago_pendiente`, `historialEstatus` con un cambio `pago_pendiente` por "sistema", y `vencimientoPago` 24 h después. Luego lleva a `/panel/pedidos/<id>/pago`.
- [ ] El primer pedido confirmado cuando ya es 2027 en la Ciudad de México (con reloj simulado en los tests) recibe `KAR-2027-000001`.
- [ ] La página de pago muestra el folio, el total y la hora límite. **Aprobar** regresa al detalle con "Pago aprobado". El pedido queda en `enviado`, con un pago `aprobado` por el total, `pagado` = total, `saldo` 0 e historial "Pago aprobado por Mercado Pago".
- [ ] **Rechazar** regresa al detalle con "Tu pago fue rechazado". El pedido sigue en `pago_pendiente`, con el pago `rechazado` registrado, y "Pagar" permite reintentar y aprobar. Al final hay 2 pagos y `pagado` solo cuenta el aprobado.
- [ ] **Dejarlo pendiente** deja el pedido en `pago_pendiente`, con un pago `pendiente`.
- [ ] Un pedido en `enviado` no muestra "Pagar", y la API responde 409 `ESTATUS_INVALIDO` si se intenta pagar. Uno de otro usuario responde 404.
- [ ] Un pedido en `pago_pendiente` cuya hora límite ya pasó aparece en Mis pedidos y en el detalle como "Cancelado", con el motivo "Pago no recibido en 24 h" y la cancelación `por: "sistema"`. Pagarlo responde 409 `PAGO_VENCIDO`.
- [ ] El vencimiento libera los códigos: `BIENVENIDA5` usado en un pedido que vence se puede volver a aplicar.
- [ ] Un minuto antes de la hora límite el pedido todavía se puede pagar.
- [ ] El detalle en `pago_pendiente` muestra "Pagar $323.64" y "Paga antes del …"; en `enviado`, "Pagado el … · Ref. …". Mis pedidos muestra las insignias "Pago pendiente", "Enviado" y "Cancelado".
- [ ] La tienda no tiene "Cancelar pedido", y `POST /api/pedidos/:id/cancelar` responde 404.
- [ ] Los archivos del pedido quedan en `uploads/pedidos/KAR-2026-000001/<lineaId>_frente.<ext>`.
- [ ] `configuracion.json` tiene `zonaHoraria: "America/Mexico_City"` y `pedidos.horasExpiracionPagoPendiente: 24`. Cambiar las horas a 1 en el mock cambia el vencimiento de los pedidos nuevos.
- [ ] Un pedido con estatus `en_proceso` o `entregado` escrito a mano en `orders.json` se muestra con su insignia y sin "Pagar".
- [ ] Un `orders.json` de versión 4 se reemplaza por uno vacío sin romper la app.
- [ ] A 375 px no hay scroll horizontal en la página de pago ni en el detalle.
- [ ] Ningún componente importa de `src/server`, y las reglas de atomic design pasan en el lint.
- [ ] `pnpm test`, `pnpm test:e2e`, `pnpm lint` y `pnpm build` pasan.

---

## Decisiones

- **Sí:** el campo `estatus` con el enum completo de KARSO y `historialEstatus` desde ahora, más `borrador` del demo (decisión del usuario). Así no habrá que renombrar en la SPEC 08.
- **No:** conservar `estado` y agregarle valores. Se alejaría de los nombres de KARSO, que son obligatorios.
- **Sí:** emular Mercado Pago como Checkout Pro: página de pago aparte, resultado que aplica la lógica del webhook y regreso al detalle (decisión del usuario). Cuando llegue Mercado Pago real, el front casi no cambia.
- **No:** un modal en el detalle. Se parecería menos al flujo real, que sale de la tienda y regresa.
- **Sí:** un pago rechazado deja el pedido en `pago_pendiente` para reintentar hasta que venza (decisión del usuario).
- **Sí:** el vencimiento se revisa al leer el pedido (decisión del usuario). Aunque haya una tarea periódica, esta revisión evita pagar un pedido vencido.
- **No:** una tarea periódica en el demo. Requiere un proceso en segundo plano que el demo no tiene.
- **Sí:** **solo el admin cancela** (decisión del usuario, siguiendo KARSO 5.8). Revierte la decisión del 2026-11-05. Un pedido que el cliente no quiere se deja vencer.
- **Sí:** al cancelarse por vencimiento, el pedido libera sus códigos, como pedía la SPEC 06 al cancelar.
- **Sí:** los usos de los códigos se siguen registrando al hacer el pedido, no al pagar (decisión del usuario). Así nadie paga con un código que se agotó mientras pagaba.
- **Sí:** folio `KAR-AAAA-NNNNNN` con un contador por año, desde `KAR-2026-000001` (decisión del usuario).
- **Sí:** zona horaria `America/Mexico_City` en la configuración, y de ahí la leen el folio, el vencimiento y el calendario (decisión del usuario). KARSO dice `America/Monterrey`; hay que comentarlo con el socio.
- **Sí:** `vencimientoPago` guardado en el pedido (propio del demo). Si después cambian las horas en la configuración, los pedidos ya hechos conservan su plazo.
- **Sí:** `orders.json` versión 5 descartando los datos anteriores, como en las SPEC 04, 05 y 06. Son datos de prueba y se pierden los folios `P-…`.
- **Sí:** el botón del borrador sigue diciendo "Hacer pedido" (el usuario no pidió cambiarlo).

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un pedido vencido sigue en `pago_pendiente` en el archivo hasta que alguien lo lee | Nadie lo puede pagar: el pago revisa primero el vencimiento. La lista y el detalle lo muestran cancelado. Con el backend real lo resuelve una tarea periódica (ver la nota). |
| Las insignias y pantallas de los estatus de la SPEC 08 se ven antes de tener sus reglas | Solo se muestran si alguien los escribe a mano en `orders.json`. Sus reglas llegan en la SPEC 08. |
| El demo no simula la llegada tardía del webhook (aprobación después de que el cliente se fue) | "Dejarlo pendiente" cubre el estado intermedio. El webhook real queda para la integración con Mercado Pago. |
| La zona horaria del front (constante) y la de la configuración se desalinean | Un test compara las dos. |
| Quitar la cancelación del cliente deja pedidos no deseados esperando 24 h | Es la regla de KARSO. El cliente ve la hora límite, y el admin puede cancelar desde el panel. |

---

## Nota para el socio: vencimiento en el backend

En el demo, un pedido en `pago_pendiente` se cancela cuando alguien lo lee y su plazo ya pasó. En el backend (NestJS en Railway) conviene **sumar una tarea periódica**, sin quitar la revisión al leer:

- **Dentro del mismo servicio**, con `@nestjs/schedule`, por ejemplo cada 5 minutos. Si se levanta más de una instancia, la tarea correría en todas. Para que sea segura, cada cancelación debe ser un `findOneAndUpdate` condicionado a `estatus: "pago_pendiente"` y al vencimiento.
- **O como un servicio aparte con horario de cron en Railway.** El servicio corre, hace su trabajo y termina. Hay que revisar en la documentación de Railway la frecuencia mínima que permite.

La revisión al leer se queda como respaldo: aunque la tarea se atrase, nadie podría pagar un pedido vencido. Si Mercado Pago aprueba un pago de un pedido que ya se canceló por tiempo, el backend debe registrar el pago y marcarlo para reembolso; es una regla a definir con el socio.

---

## Lo que **no** está en este spec

- Mercado Pago real y su webhook firmado.
- Seguimiento: `recibido` en adelante, estatus por línea, fecha de entrega, QR, rechazo y corrección (SPEC 08).
- Cancelación y reembolso por el admin (panel).
- Pagos de mostrador.
- Notificaciones por correo.
- La tarea periódica de vencimiento (backend).

Cada uno de estos, si llega, va en su propio spec.
