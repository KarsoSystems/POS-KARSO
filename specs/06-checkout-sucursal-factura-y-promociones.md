# SPEC 06 — Checkout: sucursal de entrega, factura y promociones

> **Estado:** Approved 
> **Depende de:** SPEC 02, SPEC 04, SPEC 05
> **Fecha:** 2026-11-06
> **Objetivo:** Que el cliente elija en el borrador la sucursal donde recoge, si requiere factura (con sus datos fiscales y el IVA) y hasta los códigos de promoción que permita la configuración, y que el pedido guarde esos datos con los totales de KARSO 5.4: subtotal, descuento, base de IVA, IVA y total.

---

## Por qué existe este spec

Hoy el pedido no tiene sucursal de entrega. `descuento` y `tasaIva` siempre valen 0 y no hay forma de pedir factura. KARSO define las tres cosas:

- `sucursalEntregaId` en el pedido (6.5): no hay entrega a domicilio.
- "Requiero factura", que suma el IVA y guarda `datosFiscales` sin timbrar (3 y 5.4).
- Promociones por porcentaje, con vigencia, límites de uso, canales y reglas de combinación (5.5, 6.6 y 6.9).

La descripción original incluía también el pago. Se dividió en dos specs (decisión del usuario):

- **Este spec (06), checkout:** sucursal, factura y promociones.
- **SPEC 07, pago:** Mercado Pago emulado, folio `KAR-…`, `pago_pendiente` → `enviado`, vencimiento y cancelar solo en `pago_pendiente`.

La hoja de ruta se recorre: seguimiento pasa a la SPEC 08 y perfil y sesión a la SPEC 09.

**Reglas que KARSO no fija** (decisiones del usuario; hay que proponerlas al socio):

1. Mientras no haya backend, los usos de cada promoción se registran **en el usuario** (`usosPromociones`). El backend definirá la colección o estructura para esa relación.
2. Cancelar un pedido **libera** el uso de sus códigos.
3. Un código que deja de valer mientras está en el borrador (vence, se agota o se desactiva) **se quita solo, con un aviso**. No bloquea el pedido.

---

## Alcance

**Entra:**

- **Mock del panel** (como productos y banners), validado con zod al cargarse:
  - `config/mock-panel/sucursales.json` con las 3 sucursales. "KARSO Centro" sale de KARSO; las otras dos son de ejemplo;
  - `config/mock-panel/promociones.json` con códigos para probar: vigentes, de un solo uso, de un porcentaje alto, aún no vigente, vencido, solo de mostrador e inactivo;
  - `config/mock-panel/configuracion.json` con lo que usa la tienda de 6.9: zona horaria, `iva.tasa` y las reglas de promociones.
- **Sucursal de entrega:**
  - se elige en el borrador entre las sucursales activas y es obligatoria para "Hacer pedido";
  - el pedido guarda `sucursalEntregaId` y una copia de la sucursal (nombre, dirección, teléfono y horario);
  - si la sucursal elegida se desactiva, el borrador la quita y avisa.
- **Factura:**
  - una casilla "Requiero factura" en el borrador;
  - los datos fiscales de 6.1 (RFC, razón social, régimen fiscal, código postal, uso de CFDI y correo para la factura) se precargan desde el perfil del usuario y se pueden editar;
  - la casilla "Guardar en mi perfil", marcada por omisión, actualiza el perfil al guardarlos;
  - la validación usa el formato del RFC y los catálogos del SAT para CFDI 4.0;
  - con factura, `tasaIva` = `iva.tasa` de la configuración y `iva` = base × tasa; sin factura, ambos valen 0;
  - "Hacer pedido" exige datos fiscales válidos si se pidió factura.
- **Promociones:**
  - el cliente aplica y quita códigos en el borrador; mayúsculas y minúsculas dan igual;
  - cada código se valida por existencia, estado activo, vigencia, canal `en_linea`, usos totales y usos por cliente;
  - se aceptan hasta `maxCodigosPorPedido` códigos;
  - el modo de combinación (`suma` o `cascada`) y el tope `descuentoMaximoPorcentaje` salen de la configuración;
  - el descuento se aplica sobre el subtotal, antes del IVA. El pedido guarda `promociones[]` con el `descuento` de cada código.
- **Usos:**
  - se registran en el usuario al hacer el pedido y se liberan al cancelarlo;
  - los usos totales de un código son la suma de los registros de todos los usuarios.
- **Recalcular el borrador:** al leerlo o cambiarlo se recalculan descuento e IVA con la configuración vigente. Los códigos que ya no valen y la sucursal inactiva se quitan, con avisos que se muestran en el borrador.
- **Pantallas:**
  - la columna del resumen del borrador suma la sucursal de entrega, los códigos de promoción y la factura;
  - los totales muestran el descuento por código y el IVA;
  - "Hacer pedido" explica qué falta;
  - el detalle del pedido muestra la sucursal, los códigos aplicados, los datos de factura y el IVA.
- **Datos:**
  - `orders.json` pasa a la versión 4 y descarta la 3, como en las SPEC 04 y 05;
  - `users.json` pasa a la versión 2 **migrando** los usuarios (agrega `datosFiscales: null` y `usosPromociones: []`).
- Tests de unidad, de route handlers y e2e.

**Fuera de alcance:**

- El pago, Mercado Pago, el folio `KAR-…`, `pago_pendiente`, `enviado` y el vencimiento a las 24 h (SPEC 07). Aquí "Hacer pedido" confirma sin pago, como hoy: folio `P-…` y estado `pedido`, que el cliente puede cancelar.
- Timbrar la factura y el objeto `factura` del pedido (uuid, pdf, xml). KARSO lo deja fuera del MVP.
- Editar los datos fiscales desde el perfil (SPEC 09). Aquí solo se guardan desde el borrador.
- Revisar que el uso de CFDI sea compatible con el régimen fiscal (matriz del SAT).
- Promociones de mostrador, usos por teléfono o correo, y `usosActuales` del panel.
- Fecha de entrega y horarios de corte (SPEC 08).

---

## Modelo de datos

### Mock del panel

**Sucursal** (`src/lib/sucursales/schema.ts`, KARSO 6.3):

```ts
interface Direccion { calle: string; colonia: string; ciudad: string; estado: string; codigoPostal: string }

interface Sucursal {
  _id: string;
  clave: number;           // 0, 1, 2
  nombre: string;          // "KARSO Centro"
  direccion: Direccion;
  telefono: string;        // 10 dígitos
  horario: string;         // "Lunes a viernes 9:00–19:00, sábado 9:00–14:00"
  activa: boolean;
  creadoEn: string;
  actualizadoEn: string;
}
// sucursales.json: { version: 1, ejemplo: true, sucursales: Sucursal[] }
```

**Promoción** (`src/lib/promociones/schema.ts`, KARSO 6.6):

```ts
interface Promocion {
  _id: string;
  codigo: string;                         // en mayúsculas, único
  descripcion: string;
  porcentaje: number;                     // > 0 y ≤ 100
  vigencia: { inicio: string; fin: string };
  usosMaximos: number | null;             // null = sin límite
  usosPorCliente: number | null;
  usosActuales: number;                   // lo lleva el panel; la tienda no lo lee ni lo escribe
  canales: ("en_linea" | "mostrador")[];
  activa: boolean;
  creadoPor: string;
  creadoEn: string;
  actualizadoEn: string;
}
// promociones.json: { version: 1, promociones: Promocion[] }
```

Códigos del mock. Las vigencias de los códigos vigentes terminan en 2030, para que los tests no venzan pronto.

| Código | % | Para probar |
| --- | --- | --- |
| `KARSO10` | 10 | Vigente, sin límites |
| `BIENVENIDA5` | 5 | Vigente, `usosPorCliente: 1` |
| `MAYOREO25` | 25 | Vigente; con `KARSO10` suma 35 % y pasa del tope de 30 % |
| `BUENFIN10` | 10 | El de KARSO: del 13 al 17 de noviembre de 2026, aún no vigente |
| `VERANO15` | 15 | Vencido |
| `SUCURSAL20` | 20 | Solo `mostrador` |
| `PAUSA30` | 30 | `activa: false` |

**Configuración** (`src/lib/configuracion/schema.ts`): el subconjunto de KARSO 6.9 que usa la tienda. Los demás campos llegan en sus specs.

```ts
interface ConfiguracionTienda {
  zonaHoraria: string;                    // "America/Monterrey"
  iva: { tasa: number };                  // 0.16
  promociones: {
    maxCodigosPorPedido: number;          // 2
    modoCombinacion: "suma" | "cascada";  // "suma"
    descuentoMaximoPorcentaje: number;    // 30
  };
}
// configuracion.json: { version: 1, ejemplo: true, configuracion: ConfiguracionTienda }
```

Cada mock se puede reemplazar con una variable de entorno (`SUCURSALES_PATH`, `PROMOCIONES_PATH`, `CONFIGURACION_PATH`), como `PRODUCTOS_PATH`. Si un mock no pasa la validación, la ruta responde 500 y deja el detalle en el log del servidor.

### Datos fiscales (`src/lib/validation/fiscal.ts`, KARSO 6.1)

```ts
interface DatosFiscales {
  rfc: string;            // en mayúsculas; 12 caracteres (persona moral) o 13 (física)
  razonSocial: string;    // en mayúsculas, 1–254; como en la Constancia, sin régimen societario
  regimenFiscal: string;  // clave del catálogo c_RegimenFiscal, p. ej. "612"
  codigoPostal: string;   // 5 dígitos
  usoCfdi: string;        // clave del catálogo c_UsoCFDI, p. ej. "G03"
  correoFactura: string;  // correo válido, en minúsculas
}
```

- **RFC:** el de persona moral es `^[A-ZÑ&]{3}\d{6}[A-Z\d]{3}$` y el de persona física `^[A-ZÑ&]{4}\d{6}[A-Z\d]{3}$`. Los 6 dígitos deben formar una fecha válida (AAMMDD).
- **Régimen fiscal:** es una lista cerrada (`REGIMENES_FISCALES`, con clave, descripción y si aplica a persona física, moral o ambas). Debe corresponder al tipo de persona que indica el RFC.
- **Uso de CFDI:** es una lista cerrada (`USOS_CFDI`, con clave y descripción) del catálogo vigente para CFDI 4.0.

Mensajes, por campo:

| Campo | Mensaje |
| --- | --- |
| `rfc` | "RFC inválido" |
| `regimenFiscal` | "El régimen 612 no aplica a personas morales" |
| `codigoPostal` | "El código postal debe tener 5 dígitos" |
| `usoCfdi` | "Elige el uso del CFDI" |
| `correoFactura` | "Correo inválido" |

### Promociones puras (`src/lib/pedidos/promociones.ts`)

- `normalizarCodigo(texto)` quita espacios y pasa a mayúsculas.
- `evaluarCodigo(promocion | undefined, { ahora, usosTotales, usosDelCliente })` devuelve `{ ok: true }` o `{ ok: false, motivo, mensaje }`:

| Motivo | Mensaje |
| --- | --- |
| `no_existe` (o inactiva) | "Este código no es válido" |
| `no_vigente` (antes de `inicio`) | "Este código aún no está vigente" |
| `vencida` | "Este código venció" |
| `otro_canal` | "Este código solo es válido en sucursal" |
| `agotada` | "Este código se agotó" |
| `ya_usada` | "Ya usaste este código" |

- `calcularDescuentos(subtotal, porcentajes, { modoCombinacion, descuentoMaximoPorcentaje })` devuelve el `descuento` de cada código, en el orden en que se aplicaron. Calcula en centavos enteros y redondea cada importe una vez:
  - **`suma`:** cada código descuenta `subtotal × porcentaje`;
  - **`cascada`:** cada código descuenta su porcentaje sobre lo que queda después de los anteriores;
  - **tope:** el descuento total no pasa de `subtotal × descuentoMaximoPorcentaje`. El código que lo rebasa solo aplica la parte que falta para llegar al tope; los anteriores quedan completos.

**Ejemplo de KARSO:** subtotal $724.00 con `BUENFIN10` = descuento $72.40, base $651.60. Con factura, IVA de 16 % = $104.26 y total **$755.86**.

**Con tope:** subtotal $1,000.00 con `KARSO10` y `MAYOREO25`, en suma: `KARSO10` descuenta $100.00 y `MAYOREO25` solo $200.00, para un total de $300.00 (30 %).

### Pedido (`src/server/domain/pedido.ts`)

Se agregan los campos de KARSO 6.5, más una copia de la sucursal y los avisos del borrador, que son propios del demo:

```ts
interface SucursalEntrega { nombre: string; direccion: Direccion; telefono: string; horario: string }

interface PromocionAplicada {
  promocionId: string;
  codigo: string;
  porcentaje: number;
  descuento: number;      // en pesos
}

// en Pedido:
sucursalEntregaId: string | null;
sucursalEntrega: SucursalEntrega | null;  // copia; si la sucursal cambia en el panel, el pedido conserva lo que vio el cliente
promociones: PromocionAplicada[];
requiereFactura: boolean;
datosFiscales: DatosFiscales | null;
avisos: string[];                          // solo en el borrador: "El código VERANO15 ya no es válido: venció"
// descuento, baseIva, tasaIva, iva y total (SPEC 04) dejan de ser siempre 0 o iguales al subtotal
```

- `data/orders.json` pasa a la versión 4 y descarta la versión 3.
- **Los avisos** se agregan al recalcular, cuando se quita un código o la sucursal. Se vacían en el siguiente cambio exitoso del checkout (`PATCH` o códigos) y al hacer el pedido.

### Usuario (`src/server/domain/user.ts`)

```ts
interface UsoPromocion {
  promocionId: string;
  codigo: string;
  pedidoId: string;
  fecha: string;           // al hacer el pedido
}

// en User:
datosFiscales: DatosFiscales | null;  // se precargan en el borrador
usosPromociones: UsoPromocion[];      // provisional, mientras el backend define su colección
```

- `data/users.json` pasa a la versión 2 con **migración**: los usuarios de la versión 1 reciben `datosFiscales: null` y `usosPromociones: []`. El almacén JSON suma la opción `versionDistinta: { migrar }` además de `"descartar"`.
- **Usos de un código:** los del cliente son sus `usosPromociones` con ese `promocionId`; los totales, la suma de los de todos los usuarios.

### API

| Método y ruta | Uso | Errores principales |
| --- | --- | --- |
| `GET /api/tienda/sucursales` | `{ ejemplo, sucursales }`: las activas, ordenadas por `clave`; sin sesión | 500 `SUCURSALES_INVALIDAS` |
| `PATCH /api/pedidos/borrador` | Cambios parciales: `{ sucursalEntregaId?, requiereFactura?, datosFiscales?, guardarDatosFiscales? }` → `{ pedido, archivos }` | 422 por campo (sucursal inexistente o inactiva, datos fiscales inválidos) |
| `POST /api/pedidos/borrador/promociones` | `{ codigo }` → `{ pedido, archivos }` | 422 `{ codigo: mensaje }` (tabla de motivos, "Ya aplicaste este código", "Solo se aceptan 2 códigos por pedido") |
| `DELETE /api/pedidos/borrador/promociones/:codigo` | Quita el código | 404 si no está aplicado |
| `POST /api/pedidos/borrador/confirmar` | Además de lo de antes: exige sucursal y, con factura, datos fiscales; registra los usos | 422 `CHECKOUT_INCOMPLETO` con `fields` (`sucursalEntregaId`, `datosFiscales`); 409 `PROMOCION_INVALIDA` si al confirmar se quitó un código |
| `POST /api/pedidos/:id/cancelar` | Además, libera los usos del pedido | Sin cambios |

- **Al activar `requiereFactura`:** si el borrador no tiene datos fiscales y el usuario sí, se copian al borrador (precarga).
- **Al guardar `datosFiscales` con `guardarDatosFiscales: true`:** también se actualizan los del usuario.
- **Al desactivar la factura** se conservan los datos fiscales en el borrador, por si la vuelve a pedir. El pedido confirmado guarda `datosFiscales: null`.

---

## Plan de implementación

1. **Mock del panel: sucursales, promociones y configuración.**
   - Esquemas zod y los tres JSON.
   - Cargadores en `src/server/mock-panel.ts` con sus variables de entorno.
   - `sucursalesActivas`, `sucursalesParaRuta`, `promocionesParaRuta` y `configuracionParaRuta` en `src/server/tienda.ts`.
   - `GET /api/tienda/sucursales`.
   - `playwright.config.ts` copia los tres mocks, como hace con los otros.
   - Tests: los mocks de git validan; uno inválido da 500; solo se listan las sucursales activas, ordenadas por `clave`.
2. **Datos fiscales puros.** `src/lib/validation/fiscal.ts` con `datosFiscalesSchema`, `REGIMENES_FISCALES` y `USOS_CFDI`. Tests:
   - RFC de persona moral y física válidos;
   - inválidos por formato y por fecha;
   - minúsculas que se normalizan;
   - régimen que no corresponde al tipo de persona;
   - código postal y correo inválidos;
   - claves fuera de los catálogos.
3. **Promociones puras.** `src/lib/pedidos/promociones.ts`. Tests:
   - cada motivo de `evaluarCodigo`, incluido que `usosPorCliente: 1` deja de valer con un uso;
   - suma y cascada;
   - el tope de 30 % con `KARSO10` + `MAYOREO25`;
   - el ejemplo de KARSO ($724.00 → $72.40 → $651.60 → IVA $104.26 → $755.86, usando `calcularTotales`).
4. **Datos y recálculo.**
   - Opción `migrar` en el almacén JSON.
   - `users.json` versión 2 con migración y `orders.json` versión 4 con descarte.
   - Campos nuevos en el pedido y el usuario.
   - `recalcularBorrador` calcula descuentos y `tasaIva` con la configuración vigente. Quita los códigos que ya no valen y la sucursal inactiva, y deja avisos.
   - Tests: migración de un usuario de la versión 1, descarte de pedidos de la versión 3, y recálculo con un código vencido y con una sucursal desactivada.
5. **Rutas del checkout.** `PATCH /api/pedidos/borrador`, `POST` y `DELETE` de promociones, y los cambios en confirmar y cancelar. Tests:
   - sucursal válida, inexistente o inactiva;
   - factura con precarga desde el usuario;
   - datos inválidos (422 por campo) y "guardar en mi perfil" con la casilla marcada y desmarcada;
   - cada error al aplicar un código, el tercer código y un código repetido;
   - confirmar sin sucursal, y con factura pero sin datos (422 `CHECKOUT_INCOMPLETO`);
   - confirmar con códigos registra los usos, y `BIENVENIDA5` ya no se puede volver a usar;
   - cancelar libera el uso, y el código se puede usar otra vez;
   - un código que vence entre aplicarlo y confirmar da 409 `PROMOCION_INVALIDA`, y el borrador queda sin él;
   - el ejemplo de KARSO de punta a punta con `BUENFIN10` vigente en la copia del mock: $755.86.
6. **Cliente HTTP y hooks.**
   - `tiendaApi.sucursales()` y `useSucursales()` (llave `["tienda","sucursales"]`).
   - `pedidosApi.cambiarCheckout`, `aplicarCodigo` y `quitarCodigo`, con sus hooks en `use-pedidos`. Actualizan la caché del borrador con la respuesta.
   - Los hooks nuevos se suman a `HOOKS_DE_DATOS` en el lint.
   - Tests.
7. **Moléculas.**
   - `selector-sucursal` (nueva): tarjetas con nombre, dirección, horario y teléfono.
   - `codigos-promocion` (nueva): campo, botón "Aplicar", lista con el porcentaje y el descuento de cada código, y "Quitar".
   - `formulario-datos-fiscales` (nueva): RFC, razón social con su ayuda, régimen y uso de CFDI como listas, código postal, correo, la casilla "Guardar en mi perfil" y el botón "Guardar datos fiscales".
   - `totales-pedido`: una fila de descuento por código ("KARSO10 (10 %)") y la fila de IVA. La leyenda de "Precios sin IVA" se queda solo sin factura.
8. **Borrador.** La columna del resumen queda en este orden:
   1. Sucursal de entrega.
   2. Códigos de promoción.
   3. "Requiero factura" y el formulario.
   4. Totales.
   5. "Hacer pedido".

   Además:
   - los avisos del borrador se muestran arriba, en ámbar;
   - "Hacer pedido" se deshabilita y explica qué falta: "Elige la sucursal de entrega" o "Captura tus datos fiscales". Las líneas con problema lo siguen bloqueando como antes.
9. **Detalle del pedido.**
   - Una sección "Entrega" con la sucursal (nombre, dirección, horario y teléfono).
   - Una sección "Factura" con RFC, razón social, régimen, uso de CFDI y correo, cuando aplica.
   - Los códigos aplicados en los totales.
10. **E2E.** Se actualiza `e2e/pedidos.spec.ts`: confirmar ahora pide sucursal y el ayudante la elige. Se agrega `e2e/checkout.spec.ts` con los flujos de los criterios.
11. **Documentación.** El README suma:
    - los tres mocks nuevos y sus variables de entorno;
    - las reglas de promociones, con la combinación, el tope y los usos guardados en el usuario, marcados como provisionales;
    - la factura con sus validaciones y la nota de que no se timbra;
    - las rutas nuevas;
    - las versiones de `orders.json` y `users.json`;
    - la hoja de ruta recorrida: 07 pago, 08 seguimiento y 09 perfil y sesión.

---

## Criterios de aceptación

- [ ] `GET /api/tienda/sucursales` responde sin sesión con las 3 sucursales activas, ordenadas por `clave`. Una sucursal desactivada en el mock no aparece, y un mock inválido responde 500.
- [ ] En el borrador, "Hacer pedido" está deshabilitado con "Elige la sucursal de entrega" hasta elegir una. La API responde 422 `CHECKOUT_INCOMPLETO` si se confirma sin sucursal.
- [ ] La sucursal elegida se conserva al recargar y en otro dispositivo. El detalle del pedido muestra su nombre, dirección, horario y teléfono.
- [ ] Si la sucursal elegida se desactiva en el mock, el borrador la quita y muestra el aviso.
- [ ] Marcar "Requiero factura" muestra el formulario y una fila "IVA (16 %)". Desmarcarlo la quita y vuelve la leyenda "Precios sin IVA…".
- [ ] Con factura y sin datos fiscales, "Hacer pedido" queda deshabilitado con "Captura tus datos fiscales".
- [ ] Un RFC inválido, un régimen que no corresponde al tipo de persona, un código postal de 4 dígitos o un correo inválido muestran su mensaje en el campo. La API responde 422 con el mismo campo.
- [ ] Datos fiscales guardados con "Guardar en mi perfil" se precargan en el siguiente pedido. Con la casilla desmarcada, el perfil no cambia.
- [ ] `KARSO10` aplicado a un subtotal de $310.00 muestra "KARSO10 (10 %) −$31.00" y un total de $279.00. Escrito en minúsculas también se acepta.
- [ ] Los códigos aún no vigente (`BUENFIN10`), vencido (`VERANO15`), solo de mostrador (`SUCURSAL20`), inactivo (`PAUSA30`) e inexistente muestran su mensaje y no se aplican.
- [ ] Un tercer código responde "Solo se aceptan 2 códigos por pedido", y uno repetido "Ya aplicaste este código".
- [ ] `KARSO10` + `MAYOREO25` sobre $1,000.00 dan un descuento total de $300.00 (tope de 30 %). Con `modoCombinacion: "cascada"` en el mock, `KARSO10` + `BIENVENIDA5` sobre $1,000.00 dan $100.00 + $45.00.
- [ ] Con `BUENFIN10` vigente en la copia del mock, tarjeta y lona del ejemplo con factura dan subtotal $724.00, descuento $72.40, base $651.60, IVA $104.26 y total **$755.86**. Sin factura, el total es $651.60.
- [ ] Hacer un pedido con `BIENVENIDA5` lo registra en `usosPromociones` del usuario, y aplicarlo otra vez responde "Ya usaste este código". Cancelar ese pedido libera el uso y el código vuelve a aplicarse.
- [ ] Si un código del borrador se vence en el mock, al recargar el borrador ya no lo tiene y muestra "El código … ya no es válido: venció". Confirmar mientras eso pasa responde 409 `PROMOCION_INVALIDA`.
- [ ] El pedido confirmado guarda `sucursalEntregaId`, `sucursalEntrega`, `promociones[]` con el descuento de cada código, `requiereFactura`, `datosFiscales` (null sin factura), `tasaIva` y los totales. Cambiar el IVA o una promoción en el mock no lo altera.
- [ ] Un `orders.json` de versión 3 se reemplaza por uno vacío. Un `users.json` de versión 1 se migra sin perder usuarios, y su sesión sigue funcionando.
- [ ] A 375 px no hay scroll horizontal en el borrador (con sucursal, códigos y formulario de factura abierto) ni en el detalle.
- [ ] Ningún componente importa de `src/server`, y las reglas de atomic design pasan en el lint.
- [ ] `pnpm test`, `pnpm test:e2e`, `pnpm lint` y `pnpm build` pasan.

---

## Decisiones

- **Sí:** dividir la descripción original en checkout (este spec) y pago (SPEC 07). Toca demasiados temas para un solo spec (decisión del usuario).
- **Sí:** sucursal, factura y códigos se eligen en el borrador y se guardan en el servidor, como sus líneas (decisión del usuario). El total se ve siempre al día y es el mismo en todos los dispositivos.
- **No:** una pantalla de checkout aparte después de "Hacer pedido". Sería un paso más, y el borrador ya vive en el servidor.
- **Sí:** los datos fiscales se precargan del perfil y se pueden editar. Una casilla "Guardar en mi perfil", marcada por omisión, decide si el cambio actualiza el perfil o vale solo para este pedido (decisión del usuario).
- **Sí:** validar el RFC (formato y fecha), el régimen según el tipo de persona y el uso de CFDI con los catálogos del SAT para CFDI 4.0 (decisión del usuario). Así se evitan datos que después no se podrían timbrar.
- **No:** revisar que el uso de CFDI corresponda al régimen fiscal. Es la matriz completa del SAT; mejor que la resuelva el módulo de facturación.
- **Sí:** mockear sucursales, promociones y configuración en `config/mock-panel/` (decisión del usuario), como productos y banners.
- **Sí:** implementar los dos modos de combinación, `suma` y `cascada`, para que cambiar la configuración del panel funcione (decisión del usuario).
- **Sí:** el código que pasa del tope solo aplica la parte que falta para llegarle; los anteriores quedan completos. Así cada código tiene su `descuento` y suman el total exacto.
- **Sí:** los usos de cada código se guardan en el usuario mientras no haya backend (decisión del usuario). El backend definirá su colección.
- **No:** escribir `usosActuales` en el mock del panel. La tienda no modifica datos del panel.
- **Sí:** cancelar un pedido libera el uso de sus códigos (decisión del usuario).
- **Sí:** un código que deja de valer en el borrador se quita solo y avisa (decisión del usuario). Al confirmar sí responde 409, porque el total cambió y el cliente debe verlo antes.
- **Sí:** el pedido copia los datos de la sucursal, igual que copia los de la variante. Lo que vio el cliente no cambia si el panel la edita.
- **Sí:** el folio `P-…` y el estado `pedido` se quedan hasta la SPEC 07 (decisión del usuario).
- **Sí:** `users.json` sube a la versión 2 **migrando**. Descartarlo obligaría a todos a registrarse de nuevo.
- **Sí:** `orders.json` sube a la versión 4 descartando los datos anteriores, como en las SPEC 04 y 05. Son datos de prueba.
- **Sí:** el mock de promociones usa vigencias hasta 2030 en los códigos vigentes, para que los tests no venzan; `BUENFIN10` conserva la fecha de KARSO.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Dos pedidos al mismo tiempo pueden rebasar `usosMaximos` (los usos están en `users.json` y no en el lock de `orders.json`) | En el demo hay un solo proceso y el riesgo es bajo. Está documentado; el backend lo hará atómico, como pide KARSO (`usosActuales` con `$inc`). |
| Los catálogos del SAT cambian con el tiempo | Viven en un solo archivo (`fiscal.ts`) con la fecha de su versión. El módulo de facturación los traerá de un proveedor. |
| La migración de `users.json` falla y deja sin entrar a los usuarios | Test de migración con un archivo de la versión 1. La migración solo agrega campos y no cambia los existentes. |
| El cliente no entiende por qué desapareció un código | El aviso dice qué código y por qué, y se queda visible hasta su siguiente cambio en el checkout. |
| Las vigencias del mock vencen y rompen los e2e | Los códigos vigentes llegan a 2030. Los tests de vigencia editan la copia del mock. |
| La regla de usos en el usuario no se acuerda con el socio | Está marcada como provisional en este spec y en el README. El conteo vive en una sola función, fácil de cambiar. |

---

## Lo que **no** está en este spec

- Pago con Mercado Pago emulado, folio `KAR-…`, `pago_pendiente`, `enviado`, vencimiento del pago y cancelar solo en `pago_pendiente` (SPEC 07).
- Timbrado y el objeto `factura` del pedido.
- Editar los datos fiscales desde el perfil (SPEC 09).
- Promociones y usos de mostrador.
- Compatibilidad entre uso de CFDI y régimen fiscal.
- Fecha de entrega, cortes y festivos (SPEC 08).

Cada uno de estos, si llega, va en su propio spec.
