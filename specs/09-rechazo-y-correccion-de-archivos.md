# SPEC 09 — Rechazo y corrección de archivos

> **Estado:** Approved
> **Depende de:** SPEC 05, SPEC 07, SPEC 08
> **Fecha:** 2026-11-07
> **Objetivo:** Que mostrador pueda rechazar un pedido `enviado` con un motivo por línea, que el cliente vea los motivos y suba los archivos corregidos de esas líneas dentro del plazo (5 días sin contar domingos), y que el pedido vuelva a `enviado` al enviar la corrección o se cancele solo si el plazo vence.

---

## Por qué existe este spec

La SPEC 08 cubrió el seguimiento de `enviado` a `entregado` y dejó fuera el rechazo (KARSO 5.8):

- **Rechazado:** requiere un **motivo** del catálogo (archivo en RGB, resolución insuficiente, medida incorrecta, texto fuera del área segura, otro) y un comentario. Se avisa al cliente con el motivo.
- **Corrección:** el cliente tiene **5 días** (configurable) para subir el archivo corregido desde su cuenta. Al subirlo, el pedido regresa a `enviado` y se vuelve a validar.
- **Sin corrección:** al vencer el plazo, el pedido pasa solo a `cancelado`.
- **Conteo (5.9):** si fue rechazado, el conteo de días de entrega empieza cuando el cliente vuelve a subir el archivo.

Desde la SPEC 05, la tienda solo **advierte** ("Podría ser rechazado") y deja hacer el pedido: la decisión es de mostrador. Este spec cierra ese ciclo. Como en la SPEC 08, la lógica vive en el servidor (que emula al backend) y en el demo el rechazo lo hace el simulador del panel.

**Decisiones del usuario** (2026-11-07):

1. El rechazo es del **pedido completo** (la traza va sobre todo el pedido), con **motivo y comentario por línea**. El cliente corrige solo las líneas rechazadas.
2. El cliente solo cambia **archivos** (frente y, si la línea tiene reverso de archivo, reverso). Producto, variante, medida, cantidad, reverso de calendario o texto y precio quedan congelados.
3. El cliente sube los archivos y pulsa **"Enviar corrección"**: el pedido regresa a `enviado`, mostrador vuelve a validar, y el conteo de entrega empieza en el **envío de la corrección**.
4. **Plazo:** 5 días que **no cuentan domingos**. Los **festivos sí cuentan** (se trabaja en festivos). Vence al **fin del 5.º día** (23:59, hora de la tienda).
5. **Solo se rechaza desde `enviado`.** Un defecto en producción es responsabilidad del taller, que ya validó.
6. Al vencer, el pedido se cancela con el motivo "No corrigió el archivo en el plazo". La tienda muestra "El reembolso lo gestiona la sucursal" y **libera los códigos de promoción**.
7. El archivo rechazado **se reemplaza y se borra**.
8. La corrección se hace **en el detalle del pedido**, no en el editor de línea.
9. `orders.json` pasa a la **versión 7** (descarta la 6). `notificar()` suma solo `pedido.rechazado`: los tres avisos mínimos de KARSO.

---

## Alcance

**Entra:**

- **Configuración (KARSO 6.9):**
  - `pedidos.diasParaCorregir: 5`;
  - `pedidos.motivosRechazo`, el catálogo de KARSO con `clave` y `nombre`.
- **Plazo de corrección:**
  - el día del rechazo no cuenta;
  - se cuentan los días de `entregas.diasHabiles` (lunes a sábado), **sin** descontar festivos;
  - vence a las 23:59:59.999 del último día, en la zona horaria de la tienda.
- **Rechazo en el simulador:**
  - en `/demo/panel`, un pedido `enviado` tiene "Rechazar";
  - se marca una o varias líneas, cada una con su motivo (catálogo) y comentario (obligatorio, 1–500 caracteres);
  - el pedido queda `rechazado` y cada línea marcada agrega un elemento a `rechazos` (KARSO 6.5);
  - el historial registra `por: "panel-demo"` con los motivos en el comentario;
  - se emite `notificar("pedido.rechazado")`.
- **Corrección del cliente** (en el detalle de un pedido `rechazado`):
  - un aviso con "Corrige antes del <día>";
  - cada línea rechazada muestra su motivo y comentario, y "Subir archivo corregido" para el frente y, si su reverso es archivo, para el reverso;
  - el archivo nuevo usa la subida en tres pasos y las advertencias de la SPEC 05, y **reemplaza y borra** el anterior en `pedidos/<folio>/`;
  - "Enviar corrección" se activa cuando cada línea rechazada tiene al menos un archivo nuevo. Deja el pedido en `enviado` y fija `correccionEnviadaEn`; el historial registra `por: "cliente"`.
- **Revalidar:** el "Validar" del simulador sobre un pedido corregido toma `correccionEnviadaEn` como `fechaInicioConteo` (KARSO 5.9), no la hora de la validación.
- **Vencimiento al leer** (como el pago, SPEC 07):
  - un pedido `rechazado` cuyo plazo venció se cancela al leerlo (lista, detalle, folio, simulador o una acción de corrección);
  - queda `cancelacion` con `por: "sistema"` y motivo "No corrigió el archivo en el plazo";
  - se liberan los códigos de promoción.
- **Vistas:**
  - **Mis pedidos:** "Rechazado · corrige antes del <día>";
  - **Detalle cancelado por no corregir:** el motivo y "El reembolso lo gestiona la sucursal";
  - **Historial:** muestra el rechazo, la corrección y la cancelación.
- **Notificaciones:** `notificar("pedido.rechazado")` escribe `[DEMO CORREO] Tu pedido KAR-… fue rechazado: <línea>: <motivo> — <comentario>. Corrige antes del <día>.`
- `orders.json` versión 7.
- Tests unitarios, de rutas y E2E, y el README.

**No entra:**

- Rechazar desde `recibido`, `en_proceso` o `listo` (decisión del usuario).
- Editar producto, variante, medida, cantidad, tipo de reverso o precio al corregir.
- Registrar reembolsos (los registra el admin desde el panel) y cancelar desde la tienda.
- Conservar el archivo rechazado (decisión del usuario: se reemplaza).
- Avisos de "plazo por vencer" y de pedido cancelado.
- Correo y WhatsApp reales (backend).
- Perfil y sesión (SPEC 10).

---

## Modelo de datos

### Configuración (`src/lib/configuracion/schema.ts`, KARSO 6.9)

`pedidos` suma (y `config/mock-panel/configuracion.json`, con los valores de KARSO):

```ts
pedidos: z.object({
  horasExpiracionPagoPendiente: z.number().int().positive(),
  diasParaCorregir: z.number().int().positive(), // KARSO 5.8: 5
  motivosRechazo: z.array(z.object({ clave: z.string().min(1), nombre: z.string().min(1) }))
    .min(1), // sin claves repetidas (refine)
}),
```

```json
"motivosRechazo": [
  { "clave": "color_rgb", "nombre": "El archivo está en RGB" },
  { "clave": "resolucion_insuficiente", "nombre": "Resolución insuficiente" },
  { "clave": "medida_incorrecta", "nombre": "La medida no corresponde" },
  { "clave": "fuera_area_segura", "nombre": "Texto o elementos fuera del área segura" },
  { "clave": "otro", "nombre": "Otro" }
]
```

### Reglas puras (`src/lib/pedidos/correccion.ts`)

- `fechaLimiteCorreccion(fechaRechazo: string, dias: number, entregas: Entregas, zona: string): string`: ISO del fin del día N. Cuenta los días de la semana que están en `entregas.diasHabiles` y **no** descuenta `festivos`.
- `rechazosVigentes(pedido)`: los `rechazos` de la última ronda, es decir, los que tienen la `fecha` del rechazo más reciente.
- `venceLaCorreccion(pedido, ahora)`: si está `rechazado` y `ahora` ≥ `fechaLimiteCorreccion` de la ronda.
- `correccionCompleta(pedido)`: si cada rechazo vigente tiene `corregidoEn`.

### Pedido (`src/server/domain/pedido.ts`)

```ts
/** Un rechazo de una línea (KARSO 6.5 `rechazos`). */
export interface Rechazo {
  fecha: string; // ISO; la misma para todas las líneas de una ronda
  por: string; // "panel-demo" (o el id del empleado, desde el panel)
  lineaId: string;
  motivo: string; // clave de configuracion.pedidos.motivosRechazo
  comentario: string; // 1–500
  fechaLimiteCorreccion: string; // ISO, fin del día N
  corregidoEn: string | null; // cuando el cliente subió el archivo nuevo de esa línea
}

export interface Pedido {
  // …
  rechazos: Rechazo[]; // [] en el borrador
  correccionEnviadaEn: string | null; // "Enviar corrección": de aquí cuenta la entrega al revalidar
}
```

- `CambioEstatus.por` admite `"cliente"` (al enviar la corrección).
- `Cancelacion.motivo` admite "No corrigió el archivo en el plazo".
- Las líneas no cambian de forma. Al corregir, `archivos.frente` o `archivos.reverso` toman los datos del archivo nuevo, con sus advertencias.
- `orders.json` **versión 7**: un archivo de la versión 6 se descarta, con aviso en la consola.

### Archivos

- Llave: la de la SPEC 05, `pedidos/<folio>/<lineaId>_<cara>.<ext>`. Al corregir:
  - se copia el archivo nuevo de `temporal/` a esa llave (con su miniatura);
  - se borran el registro, el binario y la miniatura del archivo anterior, y el temporal.
- Subir otra vez antes de "Enviar corrección" reemplaza al archivo corregido de la misma forma.
- Las advertencias usan las reglas del producto y la variante del catálogo actual (`reglasDe`). Si la variante ya no está en el catálogo, solo se validan formato y peso.

### Notificaciones (`src/server/notificaciones.ts`)

`notificar(evento: "pedido.enviado" | "pedido.rechazado" | "pedido.listo", pedido)`. El texto de `pedido.rechazado` lista cada línea vigente con su motivo (el `nombre` del catálogo) y comentario, y el día límite.

### API

**Simulador** (solo con `DEMO_PANEL=1`):

| Método y ruta | Uso |
| --- | --- |
| `POST /api/demo-panel/pedidos/:id/rechazar` | `{ lineas: [{ lineaId, motivo, comentario }] }` (al menos una, sin repetir línea): `enviado` → `rechazado`. 409 `ESTATUS_INVALIDO` si no está `enviado`; 404 si una línea no existe; 422 con motivo fuera del catálogo o comentario vacío |
| `GET /api/demo-panel/pedidos` | Responde también el catálogo de motivos para el formulario, y cancela antes los pedidos con corrección vencida |
| `POST /api/demo-panel/pedidos/:id/validar` | Igual que en la SPEC 08. Con `correccionEnviadaEn`, el conteo empieza ahí |

**Cliente** (con sesión, solo el dueño; 404 si no es suyo):

| Método y ruta | Uso |
| --- | --- |
| `PUT /api/pedidos/:id/lineas/:lineaId/archivos` | `{ frente?: archivoId, reverso?: archivoId }` (al menos uno; archivos propios ya `subido`). Reemplaza la cara y marca `corregidoEn` → `{ pedido }`. 409 `ESTATUS_INVALIDO` si no está `rechazado`; 409 `CORRECCION_VENCIDA`; 422 `LINEA_NO_RECHAZADA`; 422 con `reverso` si la línea no tiene reverso de archivo; 422 con formato no permitido |
| `POST /api/pedidos/:id/correccion` | "Enviar corrección": `rechazado` → `enviado` → `{ pedido }`. 422 `CORRECCION_INCOMPLETA` si falta una línea; 409 `CORRECCION_VENCIDA`; 409 `ESTATUS_INVALIDO` |

`GET /api/pedidos`, `GET /api/pedidos/:id` y `GET /api/pedidos/folio/:folio` cancelan antes los pedidos del usuario con la corrección vencida, igual que con los pagos vencidos.

---

## Plan de implementación

1. **Configuración y plazo.**
   - Agregar `diasParaCorregir` y `motivosRechazo` al esquema y al mock.
   - Crear `src/lib/pedidos/correccion.ts` con `fechaLimiteCorreccion`, `rechazosVigentes`, `venceLaCorreccion` y `correccionCompleta`.
   - Tests con los ejemplos de los criterios: rechazo un lunes, un viernes antes de un festivo, un sábado y un domingo; zona horaria y cambio de año.
2. **Datos.**
   - `Rechazo` y los campos nuevos en el pedido, más `por: "cliente"`.
   - `orders.json` versión 7: el borrador nace con `rechazos: []` y `correccionEnviadaEn: null`.
   - Ajustar los tests de repositorio y de datos.
3. **Rechazar en el servidor.**
   - `rechazar(id, lineas, configuracion, ahora)` en `src/server/pedidos/panel-demo.ts`: solo desde `enviado`, con historial y `notificar("pedido.rechazado")`.
   - El texto del aviso en `notificaciones.ts`.
   - La ruta `POST /api/demo-panel/pedidos/:id/rechazar` y su esquema zod.
   - `validar` usa `correccionEnviadaEn` como inicio del conteo.
   - La lista del simulador incluye los motivos.
   - Tests de rutas.
4. **Corrección y vencimiento en el servidor.**
   - `src/server/pedidos/correccion.ts`:
     - `corregirArchivos` copia a `pedidos/<folio>/`, borra el anterior y el temporal, y calcula las advertencias;
     - `enviarCorreccion`;
     - `vencerCorreccionesDelUsuario`, que cancela, libera los códigos y se integra donde hoy se vencen los pagos.
   - Las rutas `PUT …/lineas/:lineaId/archivos` y `POST …/correccion`.
   - Tests: reemplazo y borrado de archivos, errores, vencimiento bajo el lock y liberación de códigos.
5. **Cliente HTTP y hooks.**
   - `pedidosApi.corregirArchivos` y `pedidosApi.enviarCorreccion`.
   - `demoPanelApi.rechazar`, más los motivos en la respuesta de la lista.
   - Hooks `useCorregirArchivos`, `useEnviarCorreccion` y la acción de rechazo del simulador, que invalidan las mismas claves que la SPEC 08.
   - Tests.
6. **Vistas del cliente.**
   - **Detalle de un pedido `rechazado`:**
     - el aviso "Tu pedido fue rechazado · Corrige antes del <día>";
     - por línea rechazada, el motivo, el comentario y "Subir archivo corregido" (reutiliza `subida-archivo` y `advertencias-archivo`);
     - el botón "Enviar corrección".
   - **Detalle cancelado por no corregir:** el motivo y "El reembolso lo gestiona la sucursal".
   - **Mis pedidos:** "Rechazado · corrige antes del <día>".
   - Revisar a 375 px.
7. **Simulador.**
   - "Rechazar" en los pedidos `enviado` abre un formulario: casilla por línea, motivo (select del catálogo) y comentario.
   - Muestra los errores de la API.
8. **E2E** (`e2e/correccion.spec.ts`):
   - rechazar dos líneas desde el simulador;
   - que el cliente vea los motivos y el plazo;
   - "Enviar corrección" deshabilitado hasta subir las dos;
   - el archivo anterior borrado;
   - que vuelva a `enviado`;
   - revalidar con el conteo desde la corrección;
   - un plazo vencido (editando `orders.json`): cancelado con su motivo, "El reembolso lo gestiona la sucursal" y el código liberado;
   - `orders.json` v6 descartado;
   - 375 px.
9. **Documentación.** El README suma:
   - el rechazo, la corrección, el plazo (sin domingos, con festivos) y el vencimiento;
   - las rutas nuevas y los errores;
   - "Rechazar" en el simulador;
   - `orders.json` v7;
   - la hoja de ruta (09 en verificación, 10 pendiente).

---

## Criterios de aceptación

- [ ] Desde `/demo/panel`, un pedido `enviado` se rechaza marcando una o varias líneas, cada una con su motivo del catálogo y un comentario. El pedido queda `rechazado` con un elemento en `rechazos` por línea, y el historial registra `por: "panel-demo"` con los motivos.
- [ ] Rechazar un pedido que no está `enviado` (por ejemplo, `recibido`) responde 409 `ESTATUS_INVALIDO`, y el simulador no ofrece "Rechazar" fuera de `enviado`. Un motivo fuera del catálogo o un comentario vacío responden 422.
- [ ] Al rechazar, la consola muestra `[DEMO CORREO] Tu pedido KAR-… fue rechazado: …` con cada línea, su motivo, su comentario y el día límite.
- [ ] **Plazo** (5 días, sin domingos, festivos incluidos, hasta las 23:59 de la tienda):
  - rechazado el lunes 2 nov 2026 a las 3:40 pm → límite el sábado 7 nov a las 23:59;
  - el sábado 7 nov → el viernes 13 nov;
  - el viernes 13 nov → el jueves 19 nov (el lunes 16, festivo, cuenta);
  - el domingo 8 nov → el viernes 13 nov.
- [ ] El detalle de un pedido `rechazado` muestra "Corrige antes del <día>". Cada línea rechazada muestra su motivo y comentario y "Subir archivo corregido"; las demás líneas no permiten cambios.
- [ ] Subir un archivo corregido reemplaza el de la línea con sus advertencias de la SPEC 05. Tras subirlo, el archivo anterior ya no existe ni en `data/archivos.json` ni en `uploads/`, y el temporal tampoco.
- [ ] Corregir una línea no rechazada responde 422 `LINEA_NO_RECHAZADA`. Mandar `reverso` en una línea con reverso de calendario o texto responde 422. Producto, variante, medida, cantidad y totales no cambian.
- [ ] "Enviar corrección" está deshabilitado hasta que cada línea rechazada tiene un archivo nuevo (la API responde 422 `CORRECCION_INCOMPLETA`). Al enviarla, el pedido queda `enviado`, fija `correccionEnviadaEn` y el historial registra `por: "cliente"`.
- [ ] Con la corrección enviada el miércoles 4 nov a las 10:00 y validada el jueves 5, la tarjeta (5 días) queda disponible el martes 10 nov, contando desde el 4.
- [ ] Un pedido `rechazado` con el plazo vencido se cancela al leerlo: `cancelacion` queda con `por: "sistema"` y motivo "No corrigió el archivo en el plazo", el detalle dice "El reembolso lo gestiona la sucursal" y sus códigos de promoción vuelven a estar disponibles. Corregir o enviar la corrección después responde 409 `CORRECCION_VENCIDA`.
- [ ] Mis pedidos muestra "Rechazado · corrige antes del <día>", y el historial del detalle muestra el rechazo, la corrección y, si aplica, la cancelación.
- [ ] Un `orders.json` de versión 6 se reemplaza por uno vacío sin romper la app.
- [ ] A 375 px no hay scroll horizontal en el detalle rechazado ni en el formulario de rechazo del simulador.
- [ ] `pnpm lint`, `pnpm test`, `pnpm test:e2e` y `pnpm build` pasan.

---

## Decisiones

- **Sí:** el rechazo es del pedido completo, con motivo y comentario por línea (decisión del usuario): la traza es del pedido, y `rechazos` con `lineaId` es la forma de KARSO 6.5.
- **No:** rechazar líneas sueltas y dejar el resto en producción. El estatus `rechazado` es del pedido (KARSO 5.8).
- **Sí:** el cliente solo cambia archivos (decisión del usuario). Cambiar variante o medida cambiaría el precio de un pedido ya pagado.
- **Sí:** "Enviar corrección" explícito, y el conteo de entrega desde ese envío (decisión del usuario). Respeta 5.8 ("regresa a `enviado` y se vuelve a validar") y 5.9 ("el conteo empieza cuando el cliente vuelve a subir el archivo").
- **No:** que cada archivo subido corrija el pedido solo. Con varias líneas, el cliente no sabría cuándo quedó enviado.
- **Sí:** el plazo no cuenta domingos y sí cuenta festivos (decisión del usuario: se trabaja en festivos). Resuelve el pendiente de KARSO 8 ("naturales o hábiles"); hay que confirmarlo con el socio.
- **Sí:** el plazo vence al fin del día N (decisión del usuario), para dar un día claro: "Corrige antes del sábado 7 nov".
- **Sí:** solo se rechaza desde `enviado` (decisión del usuario). Un defecto en producción es responsabilidad del taller, que ya validó. KARSO permite rechazar también en armado: hay que comentarlo con el socio.
- **Sí:** vencimiento al leer, como el pago (SPEC 07), con la misma nota para el backend: una tarea periódica además de la revisión al leer.
- **Sí:** al cancelar por no corregir se liberan los códigos de promoción, y el reembolso lo gestiona la sucursal (decisión del usuario). La tienda no registra reembolsos.
- **Sí:** el archivo rechazado se reemplaza y se borra (decisión del usuario). La traza queda en `rechazos` (motivo y comentario), no en el archivo.
- **Sí:** la corrección vive en el detalle del pedido (decisión del usuario), no en el editor de línea, que es del borrador.
- **Sí:** solo `pedido.rechazado` se suma a `notificar()` (decisión del usuario): los tres avisos mínimos de KARSO.
- **Sí:** `orders.json` versión 7 descartando la 6, como en las specs anteriores (decisión del usuario).
- **Sí:** las advertencias del archivo corregido usan el catálogo actual. Si la variante ya no existe, solo se validan formato y peso; la línea sigue congelada.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Festivos: la entrega (SPEC 08) los salta y el plazo de corrección los cuenta | Son dos reglas distintas a propósito (decisión del usuario). Queda anotado para el socio: si se trabaja en festivos, quizá la entrega tampoco deba saltarlos. |
| El archivo anterior se borra antes de que el cliente envíe la corrección | Es lo acordado. El cliente puede subir otro mientras no envíe, y mostrador ve el archivo vigente. |
| Que se borre un archivo que usa otra línea | Cada línea del pedido tiene su propia copia en `pedidos/<folio>/` (SPEC 05): borrar una no toca otra. |
| Que el plazo se corra por la zona horaria | Se calcula en la zona de la tienda, con tests en domingo, en festivo, en sábado y en el cambio de año. |
| Que la corrección y el vencimiento choquen | Las dos revisan el plazo dentro del lock de `pedidoRepository.update`. |
| Que se tome como reembolso automático | La tienda solo dice "El reembolso lo gestiona la sucursal". `cancelacion.reembolso` sigue en `null`. |

---

## Lo que **no** está en este spec

- Rechazo desde `recibido`, `en_proceso` o `listo`.
- Editar algo distinto a los archivos al corregir.
- Reembolsos, cancelación manual y pagos de mostrador (panel).
- Aviso de plazo por vencer y aviso de cancelación.
- Correo y WhatsApp reales (backend).
- Perfil y sesión (SPEC 10).
