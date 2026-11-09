# SPEC 12 — Hoja técnica para el backend

> **Estado:** Approved
> **Depende de:** SPEC 01, SPEC 02, SPEC 03, SPEC 04, SPEC 05, SPEC 06, SPEC 07, SPEC 08, SPEC 09, SPEC 10, SPEC 11
> **Fecha:** 2026-11-08
> **Objetivo:** Escribir `docs/backend/hoja-tecnica.md`, el documento pivote entre el front y el backend. Reúne lo fundamental de las SPEC 01–11 que `KARSO-PROMPT-v1.md` no dice, o dice distinto, para construir el backend NestJS + MongoDB Atlas + R2 en Railway. Va segmentado por módulo de NestJS, para leer solo la parte que se está construyendo, y un test lo mantiene al día con las rutas del demo.

---

## Por qué existe este spec

El demo de la tienda ya está completo (SPEC 01–11) y el siguiente paso es el backend. Lo que el backend necesita saber está repartido en tres lugares:

- `KARSO-PROMPT-v1.md`: el contrato con el socio (colecciones, reglas y stack);
- 11 specs con sus decisiones;
- el código del demo: rutas, validaciones y reglas ya probadas (cotización, días hábiles, plazo de corrección, promociones en cascada).

Releer todo eso cada vez que se construya un módulo es caro y fácil de malinterpretar. La hoja lo concentra en un solo archivo, para que siga sincronizado, pero **segmentado**: quien construya el módulo `pedidos` lee el mapa, la sección transversal y la sección `pedidos`, y nada más (decisión del usuario).

**La hoja complementa a KARSO y no lo repite** (decisión del usuario):

- de las colecciones solo anota lo que la tienda **añadió o cambió**, citando la sección de KARSO;
- el orden de autoridad es KARSO > la hoja > las specs;
- donde la hoja se aparta de KARSO, lo dice y lo lleva a "Pendientes con el socio".

**Decisiones del usuario** (2026-11-08):

1. La hoja complementa a KARSO. Arriba lleva una nota de que es el documento pivote del back y el front, y se divide en secciones independientes.
2. El backend cumple **los mismos contratos** del demo: cuerpos, respuestas y la forma de error `{ error: { code, message, fields? } }`.
3. Una sección **"Emulado → real"** dice qué hace hoy cada pieza simulada y qué debe hacer la real, sin diseñar esas integraciones.
4. Los vencimientos los hace un **job dentro de la API** (`@nestjs/schedule`, cada 5 minutos), además del vencimiento al leer, con índices TTL donde aplique. El candado para cuando haya varias réplicas queda documentado. Con el plan Hobby de Railway cuesta $0 extra; un cron aparte costaría centavos al mes.
5. Un **test de Vitest** comprueba que toda ruta del demo, con su método, aparece en la hoja.
6. **Secciones por módulo de NestJS** con la misma plantilla, más un mapa de lectura y una sección transversal.
7. Cada regla con lógica ya escrita apunta a **su archivo y sus tests** en el demo, para portarla y reusar los casos de prueba.
8. Un **orden sugerido** para construir el backend, con qué parte del front se puede probar en cada paso.
9. Las rutas del backend van bajo **`/tienda`**, como KARSO 2: `/api/x` pasa a `/tienda/x`. La cookie `renovacion` pasa a `path /tienda/auth`, y `/.well-known/jwks.json` sigue en la raíz. El ajuste del front (que `apiFetch` quite `/api` cuando haya `NEXT_PUBLIC_API_BASE_URL`) se hace al conectar el back, no en este spec.
10. Las secciones usan los **nombres de módulo de KARSO 2**:
    - `auth`, `usuarios` y `productos`;
    - `sucursales`, `banners`, `configuracion` y `promociones`;
    - `pedidos`, `pagos` y `archivos`;
    - más `notificaciones`, que KARSO no lista y va como propuesta.

---

## Alcance

**Entra:**

- **`docs/backend/hoja-tecnica.md`**, un solo archivo en español, con:
  - **Nota inicial:** es el documento pivote back ↔ front. Dice cómo leerlo (mapa y luego la sección del módulo), qué specs cubre (01–11), el orden de autoridad (KARSO > hoja > specs) y la fecha de la última revisión.
  - **Mapa de lectura:** una tabla con "si vas a construir…", las secciones que hay que leer y de cuáles depende.
  - **Orden sugerido para construir el backend:**
    1. transversal;
    2. `auth` y `usuarios`;
    3. catálogo: `productos`, `sucursales`, `banners`, `configuracion` y `promociones`;
    4. `archivos`;
    5. `pedidos`;
    6. `pagos`;
    7. `notificaciones`.

    En cada paso, qué pantallas del front ya funcionan contra el back.
  - **Transversal:**
    - prefijo `/tienda` y la regla de equivalencia con `/api`;
    - el dominio común entre la tienda (Vercel) y el backend (Railway), porque las cookies `sameSite` no viajan entre sitios; también CORS con credenciales;
    - forma de los errores y códigos HTTP comunes (400 `JSON_INVALIDO`, 401, 404, 409, 422 `VALIDACION` por campo, 429 con `Retry-After`);
    - la guarda de sesión (`requireSessionUser` y sus 401);
    - validación en el servidor con los mismos mensajes (los esquemas zod del demo);
    - dinero en pesos sin IVA, redondeo a 2 decimales y `Decimal128` o centavos (KARSO 2);
    - zona horaria `America/Monterrey` y fechas en UTC;
    - identificadores: `ObjectId`, `idCliente` `CLI-000001`, folio `KAR-AAAA-NNNNNN` y `contadores`;
    - qué hacían las versiones de los JSON del demo, y que en Mongo no aplican;
    - el job programado con su candado, y los índices TTL.
  - **Una sección por módulo**, cada una con el ancla `<a id="modulo-<nombre>"></a>`, para:
    - `auth`, `usuarios` y `productos`;
    - `sucursales`, `banners`, `configuracion` y `promociones`;
    - `pedidos`, `pagos` y `archivos`;
    - `notificaciones`.

    Todas siguen la **plantilla de módulo** (ver Modelo de datos).
  - **"Emulado → real":**
    - `/api/demo-panel/*`, el simulador del panel;
    - `/api/r2-local` con su URL firmada HMAC, frente a una URL prefirmada de R2;
    - Google simulado (`/api/auth/google-mock`), frente a OAuth;
    - el código de WhatsApp en pantalla y en la consola (`demoCodigo`), frente a un proveedor real;
    - `/api/pedidos/:id/pago-simulado`, frente a Mercado Pago Checkout Pro con webhook;
    - los JSON de `config/mock-panel/`, frente a las colecciones que administra el panel;
    - `sharp` y las miniaturas.

    Para cada pieza: qué hace hoy, qué debe hacer la real y qué contrato del front no cambia.
  - **Pendientes con el socio:** una lista consolidada de las decisiones que se apartan de KARSO o que KARSO deja abiertas. Incluye al menos:
    - el rechazo solo desde `enviado`;
    - el borrador en el servidor, como colección extra;
    - `usosPromociones` en el usuario;
    - "socio" sin beneficios;
    - los 5 días para corregir: sin domingos, con festivos, hasta las 23:59;
    - solo el admin cancela;
    - las 3 notificaciones mínimas;
    - el campo `whatsapp` frente a `telefono`;
    - el prefijo `/tienda`;
    - la cookie `renovacion` con `sameSite: strict`, que no llega al entrar desde enlaces de otros sitios (WhatsApp, correo) con el acceso vencido; se propone una recarga del mismo origen cuando falta la cookie.

    Cada pendiente con su spec de origen.
  - **Lo que no está en la hoja:** lo que es solo del panel (empleados, roles, lotes, mostrador, cifrado por campo, IPs).
- **El test de cobertura** (`src/hoja-tecnica.test.ts`), que falla si:
  - un `src/app/**/route.ts` exporta un método (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) cuya ruta del demo no aparece en la hoja en la forma `` `MÉTODO /api/…` `` (o `` `GET /.well-known/jwks.json` ``), con `[id]` escrito `:id` y `[...key]` escrito `:key*`;
  - falta el ancla de un módulo, de la transversal, del mapa, de "Emulado → real" o de los pendientes;
  - una sección de módulo no tiene los subtítulos de la plantilla;
  - un archivo del demo citado en "Lógica para portar" (una ruta entre comillas invertidas que empieza con `src/`) no existe.
- **README:**
  - un enlace a la hoja ("Para construir el backend");
  - la SPEC 12 en la tabla de specs;
  - `docs/` en la estructura.

**No entra:**

- Escribir código del backend, de NestJS o de Mongoose, ni esquemas de Mongo completos: los modelos son los de KARSO 6.
- Diseñar las integraciones reales (Mercado Pago, OAuth de Google, el proveedor de WhatsApp, R2): solo qué deben cumplir.
- Cambiar el front: el ajuste de `apiFetch` al prefijo `/tienda` y el arreglo de la cookie `strict` van cuando se conecte el back.
- Las rutas `/admin` del panel y sus módulos: `empleados`, `lotes`, `cifrado` y la restricción por IP.
- Un OpenAPI o Swagger generado: lo hará el backend a partir de sus controladores.
- Traducir la hoja o hacer una versión para el socio: la lista de pendientes sirve para hablarlo con él.

---

## Modelo de datos

Este spec **no introduce datos nuevos**: no cambia ningún JSON del demo, tipo ni ruta. Lo que define es la forma del documento.

### Estructura de `docs/backend/hoja-tecnica.md`

```text
# Hoja técnica del backend (tienda)
> Nota: documento pivote back ↔ front · cómo leerlo · specs 01–11 · KARSO > hoja > specs · revisada <fecha>

<a id="mapa"></a>             ## Mapa de lectura          (tabla: construyes → lee → depende de)
<a id="orden"></a>            ## Orden sugerido           (pasos y qué pantallas prueban cada uno)
<a id="transversal"></a>      ## Transversal
<a id="modulo-auth"></a>      ## Módulo `auth`
<a id="modulo-usuarios"></a>  ## Módulo `usuarios`
<a id="modulo-productos"></a> ## Módulo `productos`
… sucursales, banners, configuracion, promociones, pedidos, pagos, archivos, notificaciones
<a id="emulado"></a>          ## Emulado → real
<a id="pendientes"></a>       ## Pendientes con el socio
<a id="fuera"></a>            ## Lo que no está en la hoja
```

### Plantilla de módulo

Cada sección de módulo lleva estos subtítulos, en este orden. Si uno no aplica, dice "No aplica" en una línea:

| Subtítulo | Contenido |
| --- | --- |
| `### Qué cubre` | Dos o tres líneas, las specs de origen y la sección de KARSO |
| `### Colección y campos` | Solo lo que la tienda **añadió o cambió** respecto a KARSO 6 (p. ej. `usuarios.tipo`, `pedidos.rechazos`, `sesiones`), con tipos e índices sugeridos (únicos y TTL) |
| `### Endpoints` | Una tabla: ruta del demo (`` `MÉTODO /api/…` ``), ruta del backend (`/tienda/…`), entrada, respuesta y errores (`código HTTP` + `code`) |
| `### Reglas` | Las reglas de negocio en viñetas cortas: plazos, estados, cálculos, quién puede qué |
| `### Lógica para portar` | Archivos del demo (`src/…`) con la lógica y sus tests, para reusar los casos |
| `### Emulado en el demo` | Lo que en este módulo es simulado, con enlace a la sección "Emulado → real" |
| `### Pendientes` | Lo abierto de este módulo, con enlace a "Pendientes con el socio" |

### Test de cobertura (`src/hoja-tecnica.test.ts`)

- Recorre `src/app/**/route.ts` y lee los métodos exportados (`export async function GET`, `export function POST`…).
- Convierte la carpeta a la ruta del demo: `src/app/api/pedidos/[id]/route.ts` → `/api/pedidos/:id`, y `[...key]` → `:key*`.
- Busca cada `` `MÉTODO /ruta` `` en la hoja, más las anclas y los subtítulos de la plantilla en cada módulo.
- Comprueba que existe cada archivo `src/…` que se cita.
- No lee el contenido de las respuestas: eso lo cubren los tests de rutas de cada spec.

---

## Plan de implementación

1. **Esqueleto, mapa, orden y transversal.**
   - `docs/backend/hoja-tecnica.md` con la nota inicial y todas las anclas y títulos.
   - El mapa de lectura y el orden sugerido.
   - La sección transversal completa, incluida la regla de equivalencia `/api/x` → `/tienda/x`, con la excepción de `/.well-known/jwks.json`.
   - Los módulos, por ahora, solo con su plantilla vacía.
2. **`auth` y `usuarios`** (SPEC 01, 10 y 11).
   - Sesiones RS256/JWKS, cookies y rotación, reúso y gracia, revocación y la colección `sesiones` con TTL.
   - Registro, login y Google, verificación de WhatsApp, perfil (socio, dirección, datos fiscales, teléfono y contraseña) y los campos añadidos a `usuarios`.
3. **Catálogo: `productos`, `sucursales`, `banners`, `configuracion` y `promociones`** (SPEC 04 y 06, más las partes de 08 y 09 que tocan `configuracion`).
   - La cotización KARSO 5.4 y los endpoints públicos `/api/tienda/*`.
   - Las promociones (suma o cascada, tope y usos), los días hábiles, el corte y los festivos.
   - Los motivos de rechazo y `diasParaCorregir`.
4. **`archivos`** (SPEC 05).
   - La subida en tres pasos.
   - Frente y reverso (archivo, calendario o texto).
   - La validación 5.7 que solo advierte.
   - Las rutas en R2 (`temporal/` y `pedidos/<folio>/…`) y las miniaturas.
5. **`pedidos` y `pagos`** (SPEC 02, 06, 07, 08 y 09).
   - El borrador en el servidor y el checkout.
   - Confirmar, con el folio y precios congelados.
   - Los estatus y el historial, el estatus por línea, "disponible para recoger" y el QR.
   - El rechazo y la corrección.
   - Los vencimientos del pago y de la corrección, con el job.
   - El pago emulado frente a Mercado Pago real.
6. **`notificaciones`, "Emulado → real", pendientes y lo que no está.**
   - La notificación por evento (`pedido.confirmado`, `pedido.rechazado`, `pedido.listo`).
   - La tabla completa de "Emulado → real".
   - La lista consolidada de pendientes, con su spec de origen.
7. **Test de cobertura y README.**
   - `src/hoja-tecnica.test.ts`.
   - Completar la hoja hasta que pase: todas las rutas y sus métodos.
   - El enlace en el README, la fila de la SPEC 12 en la tabla y `docs/` en la estructura.
   - `pnpm lint` y `pnpm test`.

---

## Criterios de aceptación

- [ ] Existe `docs/backend/hoja-tecnica.md`. Empieza con la nota de documento pivote back ↔ front, cómo leerlo, las specs que cubre, el orden de autoridad (KARSO > hoja > specs) y la fecha de revisión.
- [ ] El mapa de lectura dice, para cada uno de los 11 módulos, qué secciones leer y de cuáles depende. Con el mapa, la transversal y la sección del módulo basta para construirlo, sin abrir las specs.
- [ ] El orden sugerido lista los pasos para construir el backend y, en cada uno, qué pantallas del front se pueden probar contra el back.
- [ ] La sección transversal cubre:
  - el prefijo `/tienda` y su equivalencia (con `jwks.json` en la raíz);
  - el dominio común, cookies y CORS;
  - la forma de los errores y los códigos comunes;
  - la guarda de sesión y sus 401;
  - la validación con los mismos mensajes;
  - el dinero, la zona horaria, las fechas y los identificadores;
  - el job programado con su candado, y los índices TTL.
- [ ] Hay una sección, con su ancla y los 7 subtítulos de la plantilla, para cada módulo:
  - `auth`, `usuarios` y `productos`;
  - `sucursales`, `banners`, `configuracion` y `promociones`;
  - `pedidos`, `pagos` y `archivos`;
  - `notificaciones`.

  Los subtítulos que no aplican dicen "No aplica".
- [ ] Ninguna sección copia un modelo completo de KARSO 6. "Colección y campos" solo trae lo añadido o cambiado, citando la sección de KARSO.
- [ ] Toda ruta del demo con cada método que exporta aparece en la tabla de endpoints de su módulo, o en "Emulado → real", con su ruta `/tienda/…`, entrada, respuesta y errores.
- [ ] "Emulado → real" cubre el simulador del panel, `r2-local`, Google simulado, el código de WhatsApp, el pago simulado, los JSON del mock del panel y `sharp`, cada uno con qué hace hoy y qué debe hacer el real.
- [ ] "Pendientes con el socio" incluye al menos los 10 puntos del alcance, cada uno con su spec de origen.
- [ ] Cada regla con lógica en el demo apunta a su archivo `src/…` y a sus tests, y todos esos archivos existen.
- [ ] `src/hoja-tecnica.test.ts` pasa. Falla si se agrega una ruta o un método sin documentarlo, si falta un ancla o un subtítulo de la plantilla, o si se cita un archivo `src/…` que no existe.
- [ ] El README enlaza la hoja y la SPEC 12 aparece en la tabla de specs.
- [ ] No cambia ningún archivo de `src/` salvo el test nuevo.
- [ ] `pnpm lint` y `pnpm test` pasan.

---

## Decisiones

- **Sí:** un solo archivo segmentado, no varios (decisión del usuario). Uno se mantiene sincronizado; las anclas y el mapa permiten leer solo una parte.
- **No:** dividir la hoja por tema (modelos, API, reglas). Para construir un módulo habría que saltar entre secciones.
- **Sí:** complementar a KARSO y no copiarlo (decisión del usuario). Duplicar los modelos haría que la hoja y el contrato se separen.
- **Sí:** los mismos contratos del demo (cuerpos, respuestas y errores) y el prefijo `/tienda` de KARSO 2 (decisiones del usuario). Así el front solo cambia la base URL y quita `/api`. Las rutas `/api/...` tal cual se descartan porque se apartan de KARSO.
- **Sí:** los nombres de módulo de KARSO 2, más `notificaciones` como propuesta (decisión del usuario).
- **Sí:** el job de vencimientos dentro de la API con `@nestjs/schedule` (decisión del usuario). Cuesta $0 extra porque la API ya está encendida. El cron de Railway (servicio aparte, centavos al mes según su página de precios del 2026-11-08) queda como alternativa si la API llega a apagarse sola. Se conserva el vencimiento al leer, para no depender del horario del job.
- **Sí:** índices TTL para `sesiones` y la limpieza de `temporal/` (en R2, con su regla de ciclo de vida de 48 h, KARSO 2).
- **Sí:** un test de cobertura de rutas, anclas y archivos citados (decisión del usuario). No revisa la prosa: solo que no falte nada que el front usa.
- **Sí:** apuntar a los archivos y tests del demo en lugar de reescribir la lógica en prosa (decisión del usuario). Los tests del demo son los casos de prueba del back.
- **Sí:** un orden sugerido con qué pantallas del front se prueban en cada paso (decisión del usuario).
- **No:** generar un OpenAPI desde el demo. Lo generará el backend con sus controladores.
- **No:** cambiar el front en este spec. El ajuste de `apiFetch` al prefijo y el arreglo de la cookie `strict` van cuando se conecte el back.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La hoja se desincroniza del demo al cambiar una ruta | El test de cobertura falla con la ruta o el método que falta. La prosa se revisa en el spec que cambie la ruta. |
| La hoja crece tanto que vuelve a hacer falta leerla toda | El mapa y la plantilla fija por módulo. "Colección y campos" solo trae lo distinto de KARSO, y la lógica se cita por archivo, no se copia. |
| La tienda (Vercel) y el backend (Railway) en dominios distintos rompen las cookies `sameSite` | La transversal lo marca como requisito: un dominio común (p. ej. `tienda.karso.mx` y `api.karso.mx`) y CORS con credenciales. |
| KARSO cambia después de escribir la hoja | La nota inicial pone la autoridad de KARSO y la fecha de revisión. Cada sección cita su sección de KARSO, para comparar. |
| El job corre dos veces con varias réplicas | La transversal documenta un candado en Mongo (un documento con `bloqueadoHasta`) antes de escalar. |
| Una pieza emulada se toma como el diseño real | "Emulado → real" separa lo que hace el demo de lo que debe hacer la real. Las rutas emuladas no se marcan como contrato del backend. |

---

## Lo que **no** está en este spec

- El código del backend: NestJS, Mongoose y los despliegues en Railway.
- El diseño de las integraciones reales: Mercado Pago, OAuth de Google, WhatsApp y R2.
- Los cambios al front para conectarlo al back: el prefijo `/tienda` en `apiFetch` y el arreglo de la cookie `strict`.
- Las rutas `/admin`, `empleados`, `lotes`, `cifrado` y la restricción por IP (panel).
- El OpenAPI o Swagger y una versión de la hoja para el socio.
