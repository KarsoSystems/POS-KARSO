# Hoja técnica del backend (tienda)

> **Para el backend.** Este es el **documento pivote entre el front (este repo) y el backend** (NestJS + MongoDB Atlas + Cloudflare R2 en Railway). Dice qué contratos espera la tienda y qué reglas ya están decididas y probadas en el demo.
>
> - **Cómo leerla:** no la leas entera. Ve al [mapa](#mapa), lee la sección [transversal](#transversal) y luego **solo** la sección del módulo que vas a construir. Cada módulo se lee solo y sigue la misma plantilla.
> - **Qué cubre:** lo trabajado en las SPEC 01–11 (`specs/`). **Complementa a `KARSO-PROMPT-v1.md`, no lo repite**: de las colecciones solo anota lo que la tienda añadió o cambió, citando la sección de KARSO.
> - **Autoridad:** `KARSO-PROMPT-v1.md` > esta hoja > las specs. Donde la hoja se aparta de KARSO lo dice, y queda en [Pendientes con el socio](#pendientes).
> - **Al día:** `src/hoja-tecnica.test.ts` falla si una ruta del demo, un ancla o un archivo citado falta aquí.
> - **Revisada:** 2026-11-08 (SPEC 12).

<a id="mapa"></a>

## Mapa de lectura

Lee siempre la [transversal](#transversal) primero.

| Si vas a construir… | Lee | Depende de |
| --- | --- | --- |
| `auth` | [`auth`](#modulo-auth) | — |
| `usuarios` | [`usuarios`](#modulo-usuarios) | `auth` |
| `productos` | [`productos`](#modulo-productos) | `configuracion` (redondeos y unidades) |
| `sucursales` | [`sucursales`](#modulo-sucursales) | — |
| `banners` | [`banners`](#modulo-banners) | `productos` (el banner abre un producto) |
| `configuracion` | [`configuracion`](#modulo-configuracion) | — |
| `promociones` | [`promociones`](#modulo-promociones) | `configuracion`, `usuarios` (usos por cliente) |
| `archivos` | [`archivos`](#modulo-archivos) | `auth`, `productos` (medidas y reglas de la variante) |
| `pedidos` | [`pedidos`](#modulo-pedidos) | `auth`, `productos`, `sucursales`, `configuracion`, `promociones`, `archivos` |
| `pagos` | [`pagos`](#modulo-pagos) | `pedidos` |
| `notificaciones` | [`notificaciones`](#modulo-notificaciones) | `pedidos` |
| Una pieza simulada del demo | [Emulado → real](#emulado) | la sección de su módulo |
| Hablar con el socio | [Pendientes con el socio](#pendientes) | — |

<a id="orden"></a>

## Orden sugerido para construir el backend

Cada paso deja algo del front funcionando contra el back. Para conectarlo: `NEXT_PUBLIC_API_BASE_URL` apunta al back y `apiFetch` quita `/api` de la ruta. Ese ajuste del front se hace al conectar, no está en el demo.

| Paso | Módulos | Qué pantallas del front se prueban |
| --- | --- | --- |
| 1 | Transversal: errores, validación, guarda, CORS, dominio común, `GET /.well-known/jwks.json` | Ninguna todavía. El JWKS se verifica con `jose` (ver `e2e/sesion-tokens.spec.ts`) |
| 2 | `auth`, `usuarios` | `/login`, `/registro`, `/registro/verificar`, `/registro/completar`, el saludo del panel, `/panel/perfil` y "Cerrar sesión" |
| 3 | `configuracion`, `productos`, `sucursales`, `banners`, `promociones` | El carrusel del inicio del panel, el editor de ítem con la cotización en vivo y el selector de sucursal |
| 4 | `archivos` | La subida en el editor: frente y reverso, avance, miniatura y advertencias de la validación 5.7 |
| 5 | `pedidos` | El borrador con checkout y códigos, "Hacer pedido", Mis pedidos, el detalle con estatus e historial, el QR y la corrección |
| 6 | `pagos` | `/panel/pedidos/[id]/pago` y "Pagar" en el detalle (con Mercado Pago real, el regreso desde su checkout) |
| 7 | `notificaciones` | Sin pantalla: los avisos salen por el proveedor (correo o WhatsApp) |

<a id="transversal"></a>

## Transversal

Lo que comparten todos los módulos. KARSO de referencia: sección 2 (stack, consideraciones técnicas y 2.1 seguridad).

### Prefijo de las rutas

- **Regla:** la ruta del demo `/api/<resto>` es `/tienda/<resto>` en el backend (KARSO 2: la tienda bajo `/tienda`, el panel bajo `/admin`). Ejemplo: `GET /api/pedidos/:id` → `GET /tienda/pedidos/:id`.
- **Excepción:** `GET /.well-known/jwks.json` sigue en la raíz del dominio del backend.
- **Cookie de renovación:** su `path` pasa de `/api/auth` a `/tienda/auth`.
- **Mismos contratos:** cuerpos, respuestas, códigos HTTP y `code` de error iguales a los del demo. El front solo cambia la base URL y el prefijo.
- Las tablas de endpoints de cada módulo traen las dos rutas.

### Dominio común, cookies y CORS

- La tienda va en Vercel y el backend en Railway. La sesión vive en cookies `httpOnly` con `sameSite` (`lax` y `strict`), que **no viajan entre sitios distintos**. Por eso los dos necesitan **el mismo dominio registrable**, p. ej. `tienda.karso.mx` y `api.karso.mx`. Con `*.vercel.app` y `*.up.railway.app` la sesión no funciona.
- Las cookies se ponen desde el backend con `Domain` y `Secure`, y `httpOnly` siempre.
- **CORS:** solo el origen de la tienda, con `credentials: true` (el front manda `credentials: "include"`, ver `src/lib/api-client.ts`). No usar `*`.

### Forma de los errores

Todas las respuestas de error tienen esta forma (`src/server/http/responses.ts`):

```json
{ "error": { "code": "VALIDACION", "message": "Revisa los datos marcados", "fields": { "correo": "El correo no es válido" } } }
```

- `code`: constante en MAYÚSCULAS. El front decide con ella, no con el `message`.
- `message`: texto en español para mostrar.
- `fields`: opcional. Es el primer mensaje por campo, y la llave es la ruta con puntos (`direccion.calle`, `datosFiscales.rfc`, `lineas.0.motivo`).

| HTTP | `code` | Cuándo |
| --- | --- | --- |
| 400 | `JSON_INVALIDO` | El cuerpo no es JSON |
| 401 | `NO_AUTENTICADO`, `TOKEN_EXPIRADO`, `SESION_REVOCADA` | Ver [Guarda de sesión](#guarda-de-sesion) |
| 404 | `NO_ENCONTRADO` | No existe, **o no es del cliente**: nunca 403, para no revelar que existe |
| 409 | `ESTADO_INVALIDO` | El estado de la cuenta no corresponde a la acción |
| 409 | `ESTATUS_INVALIDO` | El estatus del pedido no permite la acción |
| 422 | `VALIDACION` | No pasa la validación; trae `fields` |
| 429 | `REENVIO_PRONTO` | Demasiado pronto; con el encabezado `Retry-After` en segundos |
| 500 | `*_INVALIDO(S)` | Datos del panel mal formados (en el demo, los JSON del mock) |

Los demás códigos están en la sección de su módulo.

<a id="guarda-de-sesion"></a>

### Guarda de sesión

En el demo es `requireSessionUser(estado?)` (`src/server/auth/guards.ts`). En el backend: un guard de NestJS para todas las rutas con sesión.

1. Verifica el token de la cookie `acceso`: RS256, `kid` conocido, `iss` y `aud: "tienda"`.
2. Busca la sesión por `sid` en `sesiones` y revisa que no esté revocada ni vencida (ver [`auth`](#modulo-auth)).
3. Carga el usuario. Opcionalmente, exige un `estado` de cuenta.

| Resultado | Respuesta |
| --- | --- |
| Token vencido con firma válida | 401 `TOKEN_EXPIRADO`. **No borra cookies**: el front renueva y repite |
| Sesión revocada | 401 `SESION_REVOCADA` y borra las cookies |
| Sin token, inválido, sesión o usuario inexistente | 401 `NO_AUTENTICADO`; borra las cookies si el token apuntaba a una sesión |
| Estado de cuenta distinto al exigido | 409 `ESTADO_INVALIDO` |

### Validación

- **Toda validación y todo cálculo se repiten en el backend** (KARSO 2). El front valida para mostrar errores, nunca para decidir.
- Los esquemas zod del demo son la referencia de reglas y **mensajes**: `src/lib/validation/` (`auth`, `perfil`, `fiscal`, `checkout`, `pedidos`, `panel-demo`). Conviene usar los mismos mensajes, porque el front los muestra en el campo tal como llegan en `fields`.
- Normalizaciones que el front da por hechas:
  - correo en minúsculas y sin espacios;
  - WhatsApp de México guardado como `+52` y 10 dígitos (`src/lib/telefono.ts`);
  - RFC en mayúsculas.

### Dinero

- Precios del catálogo **sin IVA**, en pesos. El IVA se suma solo con "Requiero factura" (ver [`pedidos`](#modulo-pedidos)).
- El demo calcula en **centavos enteros** y redondea por línea (`src/lib/pedidos/cotizacion.ts`, `centavos`). La API responde en pesos con 2 decimales.
- En Mongo: `Decimal128` o centavos enteros (KARSO 2). La API sigue en pesos.

### Zona horaria y fechas

- Las reglas de horario (corte de las 4 pm, sábado, fin del día del plazo de corrección, año del folio) se calculan en la zona de `configuracion.zonaHoraria`. Las fechas se guardan y viajan en **UTC, ISO 8601**.
- KARSO 2 dice `America/Monterrey`; el mock del panel trae `America/Mexico_City`. Las dos son UTC-6 sin horario de verano, pero conviene fijar una (ver [pendientes](#pendientes)).
- Las fechas "de día", como los festivos o "disponible a partir del", van como `AAAA-MM-DD`, sin hora.

### Identificadores

- `_id`: `ObjectId` en Mongo. El demo usa UUID para usuarios, pedidos y sesiones, y IDs de 24 hex en el mock del panel. **El front los trata como cadenas opacas**, así que el cambio no lo afecta.
- `idCliente`: `CLI-000001`, consecutivo en `contadores` (KARSO 6.1 y 6.10).
- `folio`: `KAR-AAAA-NNNNNN`, consecutivo por año en `contadores` (`pedidos-2026`), con el año en la zona horaria de la tienda (`src/lib/pedidos/pago.ts`, `anioEn`). Se asigna al confirmar, no al crear el borrador.
- `lineaId`: un ID por línea del pedido, estable. Se usa en las rutas de los archivos y del panel.

### Versiones de datos del demo

Los JSON del demo (`data/*.json`) llevan `version`, y se descartan o migran al cambiar: `users.json` v3, `orders.json` v7, `verifications.json` v2, `archivos.json` v2 y `sesiones.json` v1. **En Mongo no aplica.** Los campos nuevos se agregan con valor por defecto, y una migración solo hace falta si cambia el significado de un campo. Las versiones solo dicen qué campos sumó cada spec, y cada módulo los lista.

<a id="job"></a>

### Job programado e índices TTL

- **Vencimientos:** un job **dentro de la API** con `@nestjs/schedule`, cada 5 minutos, cancela:
  - los pedidos en `pago_pendiente` cuya hora límite pasó (ver [`pagos`](#modulo-pagos));
  - los `rechazado` cuyo plazo de corrección venció (ver [`pedidos`](#modulo-pedidos)).
- **También al leer:** se conserva el vencimiento que hace el demo al consultar (lista, detalle, folio y pagar) para no depender del horario del job. El demo solo vence al leer: `src/server/pedidos/vencimiento.ts` y `src/server/pedidos/correccion.ts`.
- **Candado:** con más de una réplica, el job toma un candado en Mongo antes de correr, p. ej. un documento `{ _id: "job-vencimientos", bloqueadoHasta }` que se toma con `findOneAndUpdate` si `bloqueadoHasta < ahora`. Con una réplica no hace falta, pero conviene dejarlo.
- **Costo:** con la API siempre encendida, el job no cuesta nada extra. Un cron de Railway como servicio aparte costaría centavos al mes (precios del 2026-11-08); queda como alternativa si la API se apaga sola.
- **Índices TTL:**
  - `sesiones.expiraEn`: Mongo borra las sesiones vencidas;
  - `verificaciones` (los códigos de WhatsApp, 10 minutos).

  Las revocadas se pueden borrar a los 7 días con un segundo campo TTL. Los archivos `temporal/` de R2 los borra la regla de ciclo de vida de 48 h (KARSO 2), no un TTL.

---

<a id="modulo-auth"></a>

## Módulo `auth`

### Qué cubre

Registro con correo, login, "Continuar con Google", verificación del WhatsApp por código, estados de la cuenta y la sesión: tokens de acceso y renovación RS256, JWKS, renovación con rotación, reúso y revocación. Specs: [01](../../specs/01-base-y-autenticacion-demo.md) y [11](../../specs/11-sesion-con-tokens-y-jwks.md). KARSO: 2.1 a) y 5.1.

### Colección y campos

**`usuarios`** (KARSO 6.1). La tienda **añade** estos campos a los de KARSO; los de perfil están en [`usuarios`](#modulo-usuarios):

| Campo | Tipo | Notas |
| --- | --- | --- |
| `idCliente` | `string` | `CLI-000001`, consecutivo en `contadores` (p. ej. `_id: "clientes"`; en el demo, `counters.json`), único e inmutable. KARSO no lo tiene: es el número de cliente que se muestra |
| `providers` | `("password" \| "google")[]` | Cómo puede entrar. `"password"` se suma al crear la contraseña desde el perfil |
| `estado` | `"perfil_incompleto" \| "verificacion_pendiente" \| "activo"` | Ver [Reglas](#auth-reglas). Va dentro del token de acceso |
| `whatsappVerificado` | `boolean` | `true` al verificar el código |
| `correoVerificado` | `boolean` | `true` si entró con Google; en el registro por correo queda `false`, porque no hay verificación de correo |
| `passwordHash` | `string \| null` | bcrypt de coste 10 en el demo (KARSO: argon2 o bcrypt). `null` en cuentas solo de Google |

Diferencias de nombre con KARSO 6.1. La API del demo usa los de la derecha, y el front los lee así:
- `nombres` → `nombre`;
- `telefono` → `whatsapp`, en E.164 `+52` + 10 dígitos;
- `creadoEn` / `actualizadoEn` → `createdAt` / `updatedAt`.

KARSO `activo` no se usa en la tienda. Ver [pendientes](#pendientes).

Índices: `correo` único (en claro o como índice ciego si se cifra, KARSO 2.1 b) e `idCliente` único.

**`sesiones`** (nueva, no está en KARSO; ver [pendientes](#pendientes)). Una por inicio de sesión:

| Campo | Tipo | Notas |
| --- | --- | --- |
| `_id` | `string` | El `sid` que va en los dos tokens |
| `userId` | `ObjectId` | Dueño |
| `jtiVigente` | `string` | El `jti` del token de renovación válido |
| `jtiAnterior` | `string \| null` | El rotado justo antes, aceptado 10 s (dos pestañas) |
| `agente` | `string` | `User-Agent`, recortado a 200 caracteres |
| `creadaEn`, `renovadaEn`, `expiraEn` | `Date` | `expiraEn` = renovación + 7 días |
| `revocadaEn` | `Date \| null` | |
| `motivoRevocacion` | `"logout" \| "cambio_contrasena" \| "otras_sesiones" \| "reuso" \| null` | |

Índices: `userId`, y TTL sobre `expiraEn`. Las revocadas se pueden quitar a los 7 días; el demo las limpia al escribir.

**`verificaciones`** (nueva). El código de WhatsApp vigente, uno por usuario:
- campos `userId` (único), `whatsapp` (el número al que se envió: el del registro o el nuevo del perfil), `codigo`, `expiresAt`, `intentos` y `ultimoEnvio`;
- TTL sobre `expiresAt`.

### Endpoints

Todas las rutas con sesión pueden responder los 401 de la [guarda de sesión](#guarda-de-sesion). "Usuario" es el `PublicUser`: todo el usuario sin `passwordHash` ni `usosPromociones`.

| Demo | Backend | Entrada | Respuesta | Errores |
| --- | --- | --- | --- | --- |
| `POST /api/auth/registro` | `POST /tienda/auth/registro` | `{ nombre, apellidoPaterno, apellidoMaterno, whatsapp, correo, password }` | 201 `{ user, demoCodigo? }`; crea la sesión y envía el código | 422 `VALIDACION`; 409 `CORREO_DUPLICADO` (en `fields.correo`) |
| `POST /api/auth/login` | `POST /tienda/auth/login` | `{ correo, password }` | `{ user }`; crea la sesión | 401 `CREDENCIALES_INVALIDAS`, el mismo para correo inexistente, contraseña mala o cuenta solo de Google; 422 |
| `POST /api/auth/google-mock` | `GET /tienda/auth/google` + callback (ver [Emulado](#emulado)) | Demo: `{ nombre, correo }` | 201 si crea la cuenta, 200 si ya existía; `{ user }`; crea la sesión | 422 |
| `POST /api/auth/completar-perfil` | `POST /tienda/auth/completar-perfil` | `{ nombre, apellidoPaterno, apellidoMaterno, whatsapp }` | `{ user, demoCodigo? }`; pasa a `verificacion_pendiente`, envía el código y **reemite el acceso** de la misma sesión | 409 `ESTADO_INVALIDO` si no está en `perfil_incompleto`; 422 |
| `POST /api/auth/verificar-whatsapp` | `POST /tienda/auth/verificar-whatsapp` | `{ codigo }` (6 dígitos) | `{ user }`; pasa a `activo` y **reemite el acceso** | 409 `ESTADO_INVALIDO`; 422 `CODIGO_INCORRECTO` (con los intentos restantes en `fields.codigo`); 410 `CODIGO_EXPIRADO`, `CODIGO_AGOTADO` o `SIN_CODIGO` |
| `POST /api/auth/reenviar-codigo` | `POST /tienda/auth/reenviar-codigo` | — | `{ reenviarEn: 60, demoCodigo? }` | 409 `ESTADO_INVALIDO`; 429 `REENVIO_PRONTO` con `Retry-After` |
| `GET /api/auth/me` | `GET /tienda/auth/me` | — | `{ user }` | 401 |
| `GET /api/auth/renovar` | `GET /tienda/auth/renovar?siguiente=` | Cookie `renovacion` | 307 a `siguiente` (solo `/panel/…` o la pantalla del estado); si falla, borra las cookies y 307 a `/login?siguiente=` | — |
| `POST /api/auth/renovar` | `POST /tienda/auth/renovar` | Cookie `renovacion` | `{ user }` y cookies nuevas | 401 `NO_AUTENTICADO`, `SESION_REVOCADA` (también por reúso) o `SESION_VENCIDA`; siempre borra las cookies |
| `POST /api/auth/logout` | `POST /tienda/auth/logout` | Cookie `renovacion` (o `acceso`) | `{ ok: true }`; revoca la sesión (`logout`) y borra las cookies | — |
| `GET /.well-known/jwks.json` | `GET /.well-known/jwks.json` | — | `{ keys: [{ kty, n, e, kid, alg: "RS256", use: "sig" }] }`, con `Cache-Control: public, max-age=300` | — |

**Ojo:** el `GET /tienda/auth/renovar` lo usa el middleware de Next en una navegación. Si el backend está en otro subdominio, la redirección cruza al dominio del back y vuelve a la tienda, y por eso `siguiente` debe ser una ruta de la tienda (ver [pendientes](#pendientes), cookie `strict`).

<a id="auth-reglas"></a>

### Reglas

- **Estados de la cuenta:**
  - el registro por correo crea `verificacion_pendiente`;
  - Google con un correo nuevo crea `perfil_incompleto`, sin apellidos ni WhatsApp;
  - completar el perfil lleva a `verificacion_pendiente` y verificar el código, a `activo`;
  - solo `activo` usa el panel, los pedidos y el perfil;
  - el front enruta con el `estado` del token: `/registro/completar`, `/registro/verificar` o `/panel` (`src/lib/auth-routes.ts`).
- **Google con un correo ya registrado** entra a **esa misma cuenta**: mismo `idCliente`. Suma `"google"` a `providers` y marca `correoVerificado: true`.
- **Código de WhatsApp:**
  - 6 dígitos, válido 10 min, hasta 5 intentos; al 5.º fallo se invalida (`CODIGO_AGOTADO`);
  - reenvío cada 60 s; un acierto lo borra;
  - se compara en tiempo constante;
  - el código solo viaja en la respuesta (`demoCodigo`) **fuera de producción**.
- **Login sin enumeración:** el mismo 401 para correo inexistente, contraseña incorrecta o cuenta solo de Google. Además se compara contra un hash de relleno, para que el tiempo no delate qué correos existen.
- **Contraseña:** al menos 8 caracteres, con una letra y un número. En el login solo se exige que no venga vacía.
- **Llaves:**
  - RS256 con `kid`, desde variables de entorno o secretos de Railway: `AUTH_PRIVATE_KEY` (PKCS#8) y `AUTH_KEY_ID`;
  - **rotación:** la pública anterior (`AUTH_PUBLIC_KEY_ANTERIOR`, `AUTH_KEY_ID_ANTERIOR`) sigue verificando y se publica en el JWKS hasta quitarla;
  - sin llave válida, el servidor no arranca;
  - el JWKS se arma con una lista blanca de campos públicos y nunca publica la parte privada.
- **Token de acceso:**
  - JWT RS256 con `kid`, `iss` (el origen de la tienda, `AUTH_ISSUER`), `aud: "tienda"`, `sub` (id del usuario), `sid`, `idCliente`, `estado`, `iat` y `exp` (**15 min**);
  - va en la cookie `acceso`: `httpOnly`, `sameSite: lax`, `path /`, `secure`;
  - **la cookie dura 7 días**, aunque el token dure 15 min, para que el middleware distinga "vencido" de "sin sesión".
- **Token de renovación:**
  - JWT RS256 con `kid`, `iss`, `aud: "tienda-renovacion"`, `sub`, `sid`, `jti` y `exp` (**7 días**);
  - va en la cookie `renovacion`: `httpOnly`, `sameSite: strict`, `path /tienda/auth`, `secure`;
  - un token de una audiencia no sirve en la otra.
- **Renovar:** con el `jti` vigente, **rota**: `jti` nuevo, el anterior a `jtiAnterior`, `renovadaEn = ahora`, `expiraEn = ahora + 7 días` y tokens nuevos. El acceso nuevo lleva el estado **actual** del usuario.
- **Reúso:**
  - con el `jti` anterior dentro de 10 s de `renovadaEn`, se entrega el vigente sin rotar otra vez (dos pestañas a la vez);
  - con cualquier otro `jti` de firma válida, se **revoca toda la sesión** (`reuso`) y responde 401. El dueño también queda fuera.
- **Revocación:**
  - la guarda revisa `sesiones` en **cada** petición, así que revocar corta de inmediato aunque el acceso no haya vencido;
  - motivos: `logout` (la actual), `cambio_contrasena` y `otras_sesiones` (las demás del usuario) y `reuso` (la sesión);
  - el middleware de Next solo verifica la firma; no lee `sesiones`.
- **Cambios de estado** (completar perfil, verificar WhatsApp) **no abren otra sesión**: reemiten el token de acceso con el mismo `sid`.
- **Despliegue:** la cookie `session` HS256 del demo anterior a la SPEC 11 se borra y no se migra.

### Lógica para portar

| Qué | Archivo | Tests |
| --- | --- | --- |
| Llaves, JWKS y rotación por `kid` | `src/server/auth/llaves.ts` | `src/server/auth/tokens.test.ts` |
| Firmar y verificar los dos tokens; "vencido" frente a "inválido" | `src/server/auth/tokens.ts` | `src/server/auth/tokens.test.ts` |
| Sesiones: iniciar, renovar con rotación, gracia y reúso, revocar | `src/server/auth/sesiones.ts` | `src/server/auth/sesiones.test.ts`, `src/app/api/auth/sesion-routes.test.ts` |
| Guarda y respuestas 401 | `src/server/auth/guards.ts` | `src/app/api/auth/sesion-routes.test.ts` |
| Código de WhatsApp: intentos, vigencia y reenvío | `src/server/auth/whatsapp-verification.ts`, `src/server/http/verificacion.ts` | `src/app/api/auth/verificacion-routes.test.ts` |
| Registro, login y Google | `src/app/api/auth/registro/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/google-mock/route.ts` | `src/app/api/auth/auth-routes.test.ts`, `src/app/api/auth/google-routes.test.ts` |
| Esquemas y mensajes | `src/lib/validation/auth.ts` | `src/lib/validation/auth.test.ts` |
| Enrutamiento por estado y `siguiente` seguro | `src/lib/auth-routes.ts`, `src/middleware.ts` | `src/lib/auth-routes.test.ts`, `src/middleware.test.ts` |
| Renovar una vez y repetir (front) | `src/lib/api-client.ts` | `src/lib/api-client.test.ts` |
| Extremo a extremo | — | `e2e/sesion-tokens.spec.ts`, `e2e/registro-y-login.spec.ts`, `e2e/google.spec.ts` |

### Emulado en el demo

- Google: un modal pide nombre y correo, sin OAuth.
- El código de WhatsApp aparece en pantalla y en la consola.

Ver [Emulado → real](#emulado).

### Pendientes

- Las colecciones `sesiones` y `verificaciones`, y los campos `idCliente`, `providers`, `estado`, `whatsappVerificado` y `correoVerificado`.
- Los nombres de campo distintos de KARSO.
- La cookie `strict` al entrar desde otros sitios.

Ver [Pendientes con el socio](#pendientes).

---

<a id="modulo-usuarios"></a>

## Módulo `usuarios`

### Qué cubre

"Mi perfil": datos de solo lectura, tipo de cliente (ocasional o socio), dirección y nombre del negocio, datos fiscales, cambio de teléfono verificado por código, contraseña y "cerrar sesión en los demás dispositivos". Specs: [06](../../specs/06-checkout-sucursal-factura-y-promociones.md) (datos fiscales), [10](../../specs/10-perfil-del-cliente.md) y [11](../../specs/11-sesion-con-tokens-y-jwks.md). KARSO: 5.1 y 6.1.

### Colección y campos

**`usuarios`** (KARSO 6.1). Los campos de perfil siguen a KARSO; estas son las precisiones de la tienda:

| Campo | Notas |
| --- | --- |
| `tipo` | `"ocasional"` al registrarse; el cliente lo cambia en su perfil |
| `direccion` | Forma de KARSO 6.1, la misma de las sucursales: `{ calle, colonia, ciudad, estado, codigoPostal }`, con el código postal de 5 dígitos. `null` si no hay. Obligatoria para socio y opcional para ocasional |
| `nombreNegocio` | Obligatorio para socio; `null` para ocasional. Pasar a ocasional lo borra y deja la dirección como venga |
| `datosFiscales` | `{ rfc, razonSocial, regimenFiscal, codigoPostal, usoCfdi, correoFactura }` o `null`, con los catálogos del SAT de la SPEC 06. Se precargan en el checkout. Borrarlos no toca los pedidos hechos, que guardan su copia |
| `usosPromociones` | **Provisional** (SPEC 06): `[{ promocionId, codigo, pedidoId, fecha }]`. Se suma al hacer el pedido y se quita al cancelarlo. **No sale en la API**. Ver [`promociones`](#modulo-promociones) |

El cambio de teléfono en curso vive en `verificaciones.whatsapp` (ver [`auth`](#modulo-auth)). El número del usuario no cambia hasta verificar.

### Endpoints

Todas exigen sesión con la cuenta `activo` (409 `ESTADO_INVALIDO` si no) y responden con el usuario actualizado, salvo donde se indica.

| Demo | Backend | Entrada | Respuesta | Errores |
| --- | --- | --- | --- | --- |
| `PUT /api/perfil/direccion` | `PUT /tienda/perfil/direccion` | `{ tipo, nombreNegocio, direccion }` | `{ user }` | 422 por campo (`nombreNegocio`, `direccion`, `direccion.calle`…) |
| `PUT /api/perfil/datos-fiscales` | `PUT /tienda/perfil/datos-fiscales` | `{ datosFiscales }` | `{ user }` | 422 por campo (`datosFiscales.rfc`…) |
| `DELETE /api/perfil/datos-fiscales` | `DELETE /tienda/perfil/datos-fiscales` | — | `{ user }` | — |
| `PUT /api/perfil/contrasena` | `PUT /tienda/perfil/contrasena` | `{ contrasenaActual?, password, confirmacion }` | `{ user, sesionesCerradas }` | 422 `VALIDACION` (`fields.contrasenaActual` "Escribe tu contraseña actual", `confirmacion`, `password`); 422 `CONTRASENA_INCORRECTA` |
| `DELETE /api/perfil/sesiones` | `DELETE /tienda/perfil/sesiones` | — | `{ cerradas }` | — |
| `GET /api/perfil/telefono` | `GET /tienda/perfil/telefono` | — | `{ whatsappNuevo }` o `{ whatsappNuevo: null }` | — |
| `POST /api/perfil/telefono` | `POST /tienda/perfil/telefono` | `{ whatsapp }` | `{ whatsappNuevo, reenviarEn: 60, demoCodigo? }` | 422 (inválido, o "Ese ya es tu número"); 429 `REENVIO_PRONTO` |
| `POST /api/perfil/telefono/verificar` | `POST /tienda/perfil/telefono/verificar` | `{ codigo }` | `{ user }` con el número nuevo | 422 `CODIGO_INCORRECTO`; 410 `CODIGO_EXPIRADO`, `CODIGO_AGOTADO` o `SIN_CODIGO` |
| `POST /api/perfil/telefono/reenviar` | `POST /tienda/perfil/telefono/reenviar` | — | `{ whatsappNuevo, reenviarEn: 60, demoCodigo? }` | 410 `SIN_CODIGO`; 429 |
| `DELETE /api/perfil/telefono` | `DELETE /tienda/perfil/telefono` | — | `{ whatsappNuevo: null }` | — |

### Reglas

- **Solo lectura:** `idCliente`, `nombre`, apellidos y `correo` (KARSO 5.1: el nombre y el correo no se editan).
- **Socio:** exige `nombreNegocio` y `direccion` completa. Por ahora no da beneficios: solo se guarda el tipo (KARSO 8 lo deja pendiente).
- **Cada tarjeta guarda por separado:** el error de una no bloquea a las otras.
- **Teléfono:**
  - el número nuevo recibe un código, con las mismas reglas que el registro (10 min, 5 intentos y 60 s);
  - hasta verificarlo, sigue el anterior;
  - pedir otro número reemplaza el cambio en curso;
  - un código agotado cierra el cambio.
- **Contraseña:**
  - si la cuenta ya tiene una, **se pide la actual** y se compara con el hash;
  - una cuenta solo de Google la **crea** sin la actual y suma `"password"` a `providers`;
  - al guardar, **se revocan las demás sesiones** (`cambio_contrasena`) y la actual sigue.
- **"Cerrar sesión en los demás dispositivos":** revoca las demás sesiones del usuario (`otras_sesiones`) y responde cuántas cerró.

### Lógica para portar

| Qué | Archivo | Tests |
| --- | --- | --- |
| Esquemas del perfil (socio, dirección, teléfono, contraseña) | `src/lib/validation/perfil.ts` | `src/lib/validation/perfil.test.ts` |
| Datos fiscales del SAT (RFC, régimen, uso de CFDI) | `src/lib/validation/fiscal.ts` | `src/lib/validation/fiscal.test.ts` |
| Dirección (la de las sucursales) | `src/lib/sucursales/schema.ts` | `src/lib/validation/perfil.test.ts` |
| Cambio de teléfono en curso | `src/server/perfil/telefono.ts` | `src/app/api/perfil/perfil-routes.test.ts` |
| Rutas del perfil | `src/app/api/perfil/contrasena/route.ts`, `src/app/api/perfil/sesiones/route.ts` | `src/app/api/perfil/perfil-routes.test.ts` |
| Extremo a extremo | — | `e2e/perfil.spec.ts`, `e2e/sesion-tokens.spec.ts` |

### Emulado en el demo

El código del teléfono nuevo se muestra en pantalla y en la consola, como en el registro. Ver [Emulado → real](#emulado).

### Pendientes

- El "socio" sin beneficios.
- `usosPromociones` en el usuario.
- El campo `whatsapp` frente a `telefono`.
- El cifrado por campo de KARSO 2.1 b): teléfono, dirección y datos fiscales. Lo hace el backend; el contrato de la API no cambia.

Ver [Pendientes con el socio](#pendientes).

---

<a id="modulo-productos"></a>

## Módulo `productos`

### Qué cubre

El catálogo que ve la tienda y la **cotización** de una línea: variante por atributos, medida variable, volumen, especificaciones (acabados), cobro mínimo y redondeo. Specs: [04](../../specs/04-catalogo-y-cotizacion-karso.md) y la parte de archivos de la [05](../../specs/05-archivos-frente-reverso-y-validacion.md). KARSO: 5.2–5.4, 5.13 y 6.4.

### Colección y campos

**Sin cambios respecto a KARSO 6.4.** El mock `config/mock-panel/productos.json` usa sus mismos campos (`variantes[].atributos`, `canales`, `precio`, `precioPor`, `medida`, `archivo`, `caras`, `especificaciones`, `grupoArmado`…). Las únicas diferencias son de demo:
- `supuestos`: notas de los datos que KARSO no fija, solo como documentación;
- `ejemplo: true`: marca que los precios son de ejemplo, y el front muestra un aviso.

Ninguna de las dos va en la colección.

### Endpoints

| Demo | Backend | Entrada | Respuesta | Errores |
| --- | --- | --- | --- | --- |
| `GET /api/tienda/productos` | `GET /tienda/productos` | — (**público**, sin sesión) | `{ ejemplo, productos }` | 500 `CATALOGO_INVALIDO` |

No hay endpoint de cotización: el front cotiza en vivo con la misma lógica para mostrar el precio, y **el servidor recalcula** al guardar la línea en el borrador y al confirmar (ver [`pedidos`](#modulo-pedidos)).

### Reglas

- **Filtra el servidor**, no el front. Salen:
  - los productos `activo`;
  - con sus variantes `activa` y con `"en_linea"` en `canales`;
  - con sus especificaciones `activa`, limitadas a las variantes visibles;
  - ordenados por `orden`.

  Un producto sin variantes en línea no aparece.
- **Variante por atributos:** las combinaciones inexistentes no se pueden elegir; el front las muestra deshabilitadas con "No disponible para …".
- **Cotización** (KARSO 5.4), en centavos enteros:
  - el importe se calcula según `precioPor`: `volumen` (por millar, pieza o paquete, según el `volumen` de la variante), `m2` o `metro_lineal`;
  - una variante con `precioPor: "cotizacion"` no se vende en línea: la línea responde "Este producto se cotiza en mostrador";
  - en m² y metro lineal la medida va en metros con 2 decimales; en metro lineal solo se captura el largo;
  - se aplica el **cobro mínimo**;
  - las especificaciones se suman según su `tipoCobro`, y los ojillos son `ceil(perímetro ÷ cadaMetros)` (KARSO no lo fija; con esta regla su ejemplo da 14);
  - se redondea a centavos por importe unitario y por subtotal de línea.
- **Cantidad:** desde `cantidadMinima` de la variante hasta un máximo técnico de 100,000 unidades de volumen por línea. Es solo contra errores de captura: no hay tope de negocio.
- **Precios sin IVA.** El IVA se suma en el pedido solo con factura.
- **Ejemplos de control:**
  - tarjeta couché × 2 millares con suaje: $310.00;
  - lona 720 dpi de 2.00 × 1.50 m × 2 con ojillos: $414.00.

### Lógica para portar

| Qué | Archivo | Tests |
| --- | --- | --- |
| Cotización de la línea y totales | `src/lib/pedidos/cotizacion.ts` | `src/lib/pedidos/cotizacion.test.ts` |
| Evaluar una línea contra el catálogo (variante, medida, especificaciones y cantidad) | `src/lib/pedidos/linea.ts` | `src/lib/pedidos/linea.test.ts` |
| Atributos y combinaciones disponibles | `src/lib/catalogo/atributos.ts` | `src/lib/catalogo/atributos.test.ts` |
| Esquema del producto (forma de KARSO 6.4) | `src/lib/catalogo/schema.ts` | `src/server/mock-panel.test.ts` |
| Filtro de lo que se vende en línea | `src/server/tienda.ts` | `src/app/api/tienda/tienda-routes.test.ts` |

### Emulado en el demo

El catálogo es `config/mock-panel/productos.json`. En el backend es la colección `productos`, que administra el panel. Ver [Emulado → real](#emulado).

### Pendientes

- Precios reales, especificaciones, rebases, tolerancias y días de entrega (KARSO 8).
- Qué categorías entran en línea: el mock tiene Volantes, Tarjetas, Imán, Adhesivo y Lona.
- Si la API devuelve pesos o centavos.

Ver [Pendientes con el socio](#pendientes).

---

<a id="modulo-sucursales"></a>

## Módulo `sucursales`

### Qué cubre

Las sucursales donde el cliente recoge su pedido. No hay entrega a domicilio. Spec: [06](../../specs/06-checkout-sucursal-factura-y-promociones.md). KARSO: 6.3.

### Colección y campos

**Sin cambios respecto a KARSO 6.3**: `clave`, `nombre`, `direccion`, `telefono`, `horario` y `activa`. La forma de `direccion` es la misma que la de `usuarios.direccion`.

### Endpoints

| Demo | Backend | Entrada | Respuesta | Errores |
| --- | --- | --- | --- | --- |
| `GET /api/tienda/sucursales` | `GET /tienda/sucursales` | — (**público**) | `{ ejemplo, sucursales }` | 500 `SUCURSALES_INVALIDAS` |

### Reglas

- Salen solo las `activa`, ordenadas por `clave`.
- La sucursal de entrega es **obligatoria** para hacer el pedido. El pedido **copia** sus datos, así que si el panel la edita no cambia lo que vio el cliente (ver [`pedidos`](#modulo-pedidos)).
- Una sucursal que deja de estar activa invalida la elección del borrador: se quita y se avisa.

### Lógica para portar

| Qué | Archivo | Tests |
| --- | --- | --- |
| Esquema y dirección | `src/lib/sucursales/schema.ts` | `src/server/mock-panel.test.ts` |
| Filtro de activas | `src/server/tienda.ts` | `src/app/api/tienda/tienda-routes.test.ts` |

### Emulado en el demo

`config/mock-panel/sucursales.json`. Ver [Emulado → real](#emulado).

### Pendientes

No aplica.

---

<a id="modulo-banners"></a>

## Módulo `banners`

### Qué cubre

El carrusel del inicio del panel del cliente. Spec: [04](../../specs/04-catalogo-y-cotizacion-karso.md). KARSO: 5.12 y 6.8.

### Colección y campos

**Sin cambios respecto a KARSO 6.8**: `titulo`, `imagen`, `imagenMovil`, `liga`, `orden`, `vigencia` y `activo`.

### Endpoints

| Demo | Backend | Entrada | Respuesta | Errores |
| --- | --- | --- | --- | --- |
| `GET /api/tienda/banners` | `GET /tienda/banners` | — (**público**) | `{ banners }` | 500 `BANNERS_INVALIDOS` |

### Reglas

- Salen los `activo` y vigentes en este momento (`vigencia: null` = siempre), ordenados por `orden`.
- `liga` abre el editor con el producto ya elegido (`/panel/pedidos/nuevo/item?producto=<_id>`). Un producto inexistente abre el editor sin producto.
- Las imágenes son de `karso-publico` en R2 (KARSO 2); en el demo, SVG en `public/mock/`.

### Lógica para portar

| Qué | Archivo | Tests |
| --- | --- | --- |
| Vigencia y orden | `src/server/tienda.ts` | `src/app/api/tienda/tienda-routes.test.ts` |
| Esquema | `src/lib/banners/schema.ts` | `src/server/mock-panel.test.ts` |

### Emulado en el demo

`config/mock-panel/banners.json` y las imágenes en `public/mock/`. Ver [Emulado → real](#emulado).

### Pendientes

No aplica.

---

<a id="modulo-configuracion"></a>

## Módulo `configuracion`

### Qué cubre

Los parámetros que la tienda lee del panel: IVA, promociones, plazo de pago, plazo y motivos de corrección, días hábiles, corte, sábado y festivos, y la zona horaria. Specs: [06](../../specs/06-checkout-sucursal-factura-y-promociones.md), [07](../../specs/07-pago-mercado-pago-emulado-y-folio-kar.md), [08](../../specs/08-seguimiento-estatus-por-linea-recoger-y-qr.md) y [09](../../specs/09-rechazo-y-correccion-de-archivos.md). KARSO: 5.5, 5.6, 5.8, 5.9 y 6.9.

### Colección y campos

**Sin cambios respecto a KARSO 6.9.** La tienda usa `zonaHoraria`, `iva.tasa`, `promociones.*`, `pedidos.horasExpiracionPagoPendiente`, `pedidos.diasParaCorregir`, `pedidos.motivosRechazo` y `entregas.diasHabiles` y `entregas.festivos`. No usa `mostrador`.

### Endpoints

No aplica: no hay ruta pública de configuración. El backend la lee por dentro. Lo que el front necesita viaja en la respuesta del pedido, p. ej. `motivosRechazo`, la hora límite de pago o la fecha límite de corrección (ver [`pedidos`](#modulo-pedidos)).

### Reglas

- Un solo documento (`_id: "general"`), que administra el panel. La tienda **nunca** lo escribe.
- Si está mal formado, las rutas que lo usan responden 500 `CONFIGURACION_INVALIDA` y el detalle va al log, no al cliente.
- Los cambios aplican al leer: p. ej. cambiar `modoCombinacion` recalcula los borradores en su siguiente lectura. Los pedidos hechos conservan lo que se congeló.
- Las horas `corte` y `cierre` están en la zona `zonaHoraria`, y los festivos son fechas `AAAA-MM-DD`.

### Lógica para portar

| Qué | Archivo | Tests |
| --- | --- | --- |
| Esquema y validaciones (días repetidos, horas `HH:MM`, motivos únicos) | `src/lib/configuracion/schema.ts` | `src/server/mock-panel.test.ts` |
| Días hábiles, corte y festivos: "disponible a partir del" | `src/lib/pedidos/entrega.ts` | `src/lib/pedidos/entrega.test.ts` |
| Plazo de corrección (sin domingos, con festivos) | `src/lib/pedidos/correccion.ts` | `src/lib/pedidos/correccion.test.ts` |

### Emulado en el demo

`config/mock-panel/configuracion.json`. Ver [Emulado → real](#emulado).

### Pendientes

- `zonaHoraria`: KARSO dice `America/Monterrey` y el mock trae `America/Mexico_City`.
- Los 5 días para corregir: hábiles sin domingos, pero **contando** los festivos.

Ver [Pendientes con el socio](#pendientes).

---

<a id="modulo-promociones"></a>

## Módulo `promociones`

### Qué cubre

Los códigos de promoción en el borrador: si valen, cuánto descuentan (suma o cascada, con tope), los usos por cliente y en total, y qué pasa si un código deja de valer. Spec: [06](../../specs/06-checkout-sucursal-factura-y-promociones.md). KARSO: 5.5 y 6.6.

### Colección y campos

**`promociones`: sin cambios respecto a KARSO 6.6.** La tienda **no escribe** `usosActuales`.

El demo cuenta los usos con `usuarios.usosPromociones` (provisional, ver [`usuarios`](#modulo-usuarios)): un registro por código usado en un pedido hecho, que se quita al cancelarlo. **En el backend**, como dice KARSO 6.6:
- `usosActuales` se incrementa con `$inc` al confirmar y se decrementa al cancelar;
- los usos por cliente se cuentan en `pedidos` (`usuarioId` + `promociones.codigo`, sin cancelados), con un índice para eso.

Con eso, `usosPromociones` sobra.

### Endpoints

Viven bajo el borrador del pedido y responden el borrador recalculado, igual que el resto de las rutas del borrador (ver [`pedidos`](#modulo-pedidos)).

| Demo | Backend | Entrada | Respuesta | Errores |
| --- | --- | --- | --- | --- |
| `POST /api/pedidos/borrador/promociones` | `POST /tienda/pedidos/borrador/promociones` | `{ codigo }` | El borrador, como `GET /api/pedidos/borrador` | 422 `VALIDACION` con `fields.codigo` |
| `DELETE /api/pedidos/borrador/promociones/:codigo` | `DELETE /tienda/pedidos/borrador/promociones/:codigo` | — | El borrador | 404 `NO_ENCONTRADO` si no estaba aplicado |

Mensajes de `fields.codigo`:
- "Este código no es válido" (no existe o está inactivo);
- "Este código aún no está vigente";
- "Este código venció";
- "Este código solo es válido en sucursal";
- "Este código se agotó";
- "Ya usaste este código";
- "Ya aplicaste este código";
- "Solo se aceptan N códigos por pedido".

### Reglas

- **Código sin importar mayúsculas:** se normaliza con `trim` y mayúsculas.
- **Vale si:**
  - existe y está `activa`;
  - estamos dentro de su `vigencia`;
  - tiene `"en_linea"` en `canales`;
  - no pasó `usosMaximos` (todos los clientes, sin cancelados);
  - no pasó `usosPorCliente`.

  `null` = sin límite.
- **Máximo** `maxCodigosPorPedido` por pedido. Se revisa bajo el candado del borrador, para que dos pestañas no lo rebasen.
- **Descuento** sobre el subtotal, antes del IVA, en el orden en que se aplicaron:
  - en `suma`, cada código descuenta su porcentaje del subtotal;
  - en `cascada`, de lo que queda después de los anteriores;
  - **tope** `descuentoMaximoPorcentaje`: el código que lo rebasa aplica solo lo que falta, y los siguientes quedan en 0.

  Cada código guarda su `descuento`, y sumados dan el total exacto.
- **Un código que deja de valer en el borrador** se quita solo al recalcular y deja un aviso en `avisos` (p. ej. "El código VERANO15 ya no es válido: venció").
- **Al confirmar**, si algún código dejó de valer, responde 409 `PROMOCION_INVALIDA` y no confirma: el total cambió y el cliente debe verlo.
- **Cancelar** un pedido libera sus códigos.

### Lógica para portar

| Qué | Archivo | Tests |
| --- | --- | --- |
| Evaluar un código, mensajes y descuentos en suma o cascada con tope | `src/lib/pedidos/promociones.ts` | `src/lib/pedidos/promociones.test.ts` |
| Aplicar y quitar en el borrador | `src/server/pedidos/checkout.ts` | `src/app/api/pedidos/checkout-routes.test.ts` |
| Esquema | `src/lib/promociones/schema.ts` | `src/server/mock-panel.test.ts` |

### Emulado en el demo

`config/mock-panel/promociones.json` y los usos en `usuarios.usosPromociones`. Ver [Emulado → real](#emulado).

### Pendientes

- Dónde se cuentan los usos: `usosActuales` más `pedidos` en el backend, en lugar de `usuarios.usosPromociones`.

Ver [Pendientes con el socio](#pendientes).

---

<a id="modulo-pedidos"></a>

## Módulo `pedidos`

### Qué cubre

- **El borrador** (el carrito), guardado en el servidor. Ver [Pendientes con el socio](#pendientes).
- **El checkout:** sucursal, factura con datos fiscales, y los códigos (las reglas están en [`promociones`](#modulo-promociones)).
- **"Hacer pedido":** precios congelados, folio KAR y `pago_pendiente`.
- **Mis pedidos:** el detalle con estatus por línea, el historial, "disponible para recoger a partir del…" y el QR de seguimiento.
- **Rechazo y corrección de archivos.**
- **Los vencimientos:** del pago (las reglas están en [`pagos`](#modulo-pagos)) y de la corrección.

Specs: [04](../../specs/04-catalogo-y-cotizacion-karso.md) (líneas y cotización), [06](../../specs/06-checkout-sucursal-factura-y-promociones.md), [07](../../specs/07-pago-mercado-pago-emulado-y-folio-kar.md), [08](../../specs/08-seguimiento-estatus-por-linea-recoger-y-qr.md) y [09](../../specs/09-rechazo-y-correccion-de-archivos.md). KARSO: 5.4, 5.8, 5.9, 6.5 y 6.10.

### Colección y campos

**`pedidos`** (KARSO 6.5). Las líneas, los totales, `promociones`, `historialEstatus`, `pagos`, `rechazos` y `cancelacion` siguen la forma de KARSO, con estas diferencias:

| Campo | En el demo | Notas |
| --- | --- | --- |
| `usuarioId` | `userId` | Mismo significado. El front no lo lee |
| `creadoEn`, `actualizadoEn` | `createdAt`, `updatedAt` | El front no los lee. Los pedidos salen ordenados por `confirmadoAt` |
| `estatus` | Suma `"borrador"` | El carrito es un pedido en `borrador`, **uno por usuario**. No tiene folio, historial ni pagos. Alternativa: una colección `borradores` aparte (ver [pendientes](#pendientes)) |
| `sucursalEntrega` | Nuevo | Copia de `{ nombre, direccion, telefono, horario }`: el detalle muestra lo que eligió el cliente aunque el panel cambie la sucursal |
| `avisos` | Nuevo, solo en el borrador | `string[]`: lo que el recálculo quitó, p. ej. "La sucursal Centro ya no está disponible; elige otra". Al confirmar queda `[]` |
| `productos[].problema` | Nuevo, solo en el borrador | `string \| null`: la línea dejó de valer con el catálogo actual ("El acabado Suaje ya no está disponible"). Bloquea la confirmación |
| `productos[].archivos` | `archivoId` y `advertencias` | Ver [`archivos`](#modulo-archivos) |
| `productos[].estatus` | Igual | `null` hasta que mostrador valida, y luego `recibido` → `en_proceso` → `listo` |
| `confirmadoAt` | Nuevo | Cuando se hizo el pedido. De aquí se cuenta el plazo para pagar |
| `vencimientoPago` | Nuevo | `confirmadoAt` + `horasExpiracionPagoPendiente`, fijado al confirmar. Ver [`pagos`](#modulo-pagos) |
| `correccionEnviadaEn` | Nuevo | El último "Enviar corrección". De aquí cuenta la entrega al revalidar (KARSO 5.9) |
| `rechazos[].fechaLimiteCorreccion` | Distinta regla | El fin del día límite en la hora de la tienda, no la hora del rechazo más 5 días (ver [Reglas](#pedidos-rechazo)) |
| `datosFiscales` | Igual | En el borrador se conservan aunque se quite la factura. Al confirmar sin factura quedan `null` |
| `qr` | Igual | El folio. El enlace lo arma el front: `<origen>/panel/seguimiento/<folio>` |

**Lo que el demo no llena** y el backend sí, al confirmar: `canal: "en_linea"`, la copia de `usuario`, `clienteMostrador: null`, `origen`, `creadoPor: null` y `factura` (KARSO 6.5). La tienda no los lee.

**`contadores`** (KARSO 6.10): `pedidos-AAAA`, por año en la zona horaria de la tienda.

**Índices:**
- `folio`, único y disperso: el borrador no tiene folio;
- `{ usuarioId, estatus }`;
- uno único parcial `{ usuarioId }` donde `estatus: "borrador"`;
- `{ estatus, vencimientoPago }` y `{ estatus, "rechazos.fechaLimiteCorreccion" }` para el [job](#job);
- `{ usuarioId, "promociones.promocionId", estatus }` para los usos por cliente.

### Endpoints

Todas exigen sesión con la cuenta `activo`. Las que devuelven un pedido responden con la misma forma:

```json
{ "pedido": { … }, "archivos": { "<archivoId>": { …archivo público } }, "motivosRechazo": { "<clave>": "<nombre>" } }
```

- `archivos` trae las caras de las líneas, para las miniaturas y los nombres.
- `motivosRechazo` trae los nombres del catálogo de la configuración para los motivos que use el pedido. Si la clave ya no está en el catálogo, el nombre es la clave.

Un pedido de otro cliente, o el borrador pedido por id, responde 404 `NO_ENCONTRADO`, igual que uno que no existe.

| Demo | Backend | Entrada | Respuesta | Errores |
| --- | --- | --- | --- | --- |
| `GET /api/pedidos` | `GET /tienda/pedidos` | — | `{ pedidos }` sin el borrador, los recientes primero. Los vencidos ya salen cancelados | — |
| `GET /api/pedidos/borrador` | `GET /tienda/pedidos/borrador` | — | El pedido: lo crea si no hay y lo recalcula | 500 si los datos del panel están mal formados |
| `PATCH /api/pedidos/borrador` | `PATCH /tienda/pedidos/borrador` | `{ sucursalEntregaId?, requiereFactura?, datosFiscales?, guardarDatosFiscales? }`, parcial | El pedido | 422 `VALIDACION`: `fields.sucursalEntregaId` "Elige una sucursal disponible", `datosFiscales.rfc`… |
| `POST /api/pedidos/borrador/items` | `POST /tienda/pedidos/borrador/items` | La línea: `{ productoId, varianteId, medida, especificaciones, cantidad, descripcion, archivos: { frente, reverso } }` | 201, el pedido | 422 `VALIDACION`, con el campo que falla (`varianteId`, `medida.ancho`, `cantidad`, `archivos.frente`…); 409 `MAXIMO_ITEMS` (20) |
| `PUT /api/pedidos/borrador/items/:itemId` | `PUT /tienda/pedidos/borrador/items/:itemId` | La línea completa | El pedido | 404 `NO_ENCONTRADO` "El ítem no existe"; 422 `VALIDACION` |
| `DELETE /api/pedidos/borrador/items/:itemId` | `DELETE /tienda/pedidos/borrador/items/:itemId` | — | El pedido | 404 `NO_ENCONTRADO` |
| `POST /api/pedidos/borrador/confirmar` | `POST /tienda/pedidos/borrador/confirmar` | — | 201: el pedido en `pago_pendiente`, con folio | 422 `PEDIDO_VACIO`; 409 `ITEMS_CON_PROBLEMAS`; 409 `PROMOCION_INVALIDA`; 422 `CHECKOUT_INCOMPLETO` con `fields.sucursalEntregaId` o `fields.datosFiscales`; 409 `ESTADO_INVALIDO` "Este pedido ya se confirmó" (otra pestaña) |
| `GET /api/pedidos/:id` | `GET /tienda/pedidos/:id` | — | El pedido | 404 `NO_ENCONTRADO` |
| `GET /api/pedidos/folio/:folio` | `GET /tienda/pedidos/folio/:folio` | — | El pedido del cliente con ese folio (lo abre el QR) | 404 `NO_ENCONTRADO` |
| `PUT /api/pedidos/:id/lineas/:lineaId/archivos` | `PUT /tienda/pedidos/:id/lineas/:lineaId/archivos` | `{ frente?, reverso? }`: ids de archivos ya subidos, al menos uno | El pedido, con la línea corregida | 404; 409 `CORRECCION_VENCIDA`; 409 `ESTATUS_INVALIDO` (no está `rechazado`); 422 `LINEA_NO_RECHAZADA`; 422 `VALIDACION` con `fields.frente` o `fields.reverso` ("Esta línea no lleva archivo", "El archivo no existe") |
| `POST /api/pedidos/:id/correccion` | `POST /tienda/pedidos/:id/correccion` | — | El pedido en `enviado` | 404; 422 `CORRECCION_INCOMPLETA`; 409 `CORRECCION_VENCIDA`; 409 `ESTATUS_INVALIDO` |

Los códigos del borrador están en [`promociones`](#modulo-promociones) y el pago en [`pagos`](#modulo-pagos). Las acciones del panel (validar, rechazar, mover líneas y entregar) son del backend del panel bajo `/admin`. Aquí van sus reglas, porque cambian lo que ve la tienda; el demo las simula (ver [Emulado → real](#emulado)).

### Reglas

**Borrador y checkout**

- **Un borrador por cliente, en el servidor**, para que sea el mismo en todos sus dispositivos. `GET` lo crea si no hay.
- **Cada cambio va bajo candado y recalcula** el borrador con lo vigente del panel. Si entre leer y escribir otra pestaña lo confirmó, reintenta una vez sobre un borrador nuevo. En Mongo: `findOneAndUpdate` con condición `estatus: "borrador"`, o una transacción.
- **El recálculo**, en cada lectura y en cada cambio:
  - **líneas:** se vuelven a evaluar contra el catálogo y las reglas de archivo. Si una ya no vale (variante inactiva, medida fuera de rango, acabado retirado, calendario de un año pasado…), conserva su último importe y se marca `problema`;
  - **sucursal:** si sigue activa, se actualiza su copia. Si no, se quita con un aviso;
  - **códigos:** ver [`promociones`](#modulo-promociones);
  - **totales** (KARSO 5.4): `tasaIva` es `configuracion.iva.tasa` solo con "Requiero factura"; si no, 0.
- **Cada cambio exitoso vacía `avisos`**, y el recálculo vuelve a poner los que sigan aplicando.
- **Máximo 20 líneas.** Se revisa bajo el candado, para que dos pestañas no lo rebasen.
- **La línea copia** los datos de la variante al guardarse (KARSO 5.4). Las reglas de cotización y validación están en [`productos`](#modulo-productos) y [`archivos`](#modulo-archivos).
- **Factura:**
  - al marcar "Requiero factura" sin datos en el borrador, se precargan los del perfil;
  - con `guardarDatosFiscales`, los datos también se guardan en el perfil;
  - quitar la factura no borra los datos del borrador, pero al confirmar sin factura quedan `null`.
- **La sucursal elegida tiene que estar activa** al elegirla (422) y al confirmar.

**Hacer pedido**

- **Bajo un solo candado:**
  1. recalcula con lo vigente: lo que quede son los **precios congelados**;
  2. valida, en este orden: vacío → líneas con `problema` → un código que dejó de valer → sucursal y, con factura, datos fiscales;
  3. copia los archivos a `pedidos/<folio>/` (ver [`archivos`](#modulo-archivos));
  4. asigna el folio;
  5. pasa a `pago_pendiente` con `confirmadoAt`, `vencimientoPago` y el primer registro del historial (`por: "sistema"`).
- **Si falla, no se guarda nada** salvo el recálculo, para que el cliente vea los avisos y el total nuevo.
- **El folio no se consume** si falla la confirmación. En Mongo: el `$inc` del contador dentro de la misma transacción que el pedido. Sin transacción quedan huecos en la numeración (KARSO no dice si se permiten).
- Las **advertencias de archivo no bloquean** (KARSO 5.7 en la tienda: mostrador decide).
- Al confirmar se registran los usos de los códigos.

**Estatus e historial**

- **Flujo** (KARSO 5.8): `pago_pendiente` → `enviado` → `recibido` → `en_proceso` → `listo` → `entregado`, más `rechazado` y `cancelado`.
- **La tienda solo produce:**
  - `pago_pendiente`, al confirmar;
  - `enviado`, con el pago aprobado o al enviar una corrección;
  - `cancelado`, cuando el sistema vence el pago o la corrección.

  Lo demás lo pone el panel.
- **El cliente no cancela**: no hay ruta. Cancela solo el admin, desde el panel (KARSO 5.8), y el sistema por vencimiento.
- **Estatus por línea:**
  - al validar, cada línea queda en `recibido`;
  - producción mueve cada línea hacia adelante (`en_proceso`, `listo`) y nunca hacia atrás (409 `ESTATUS_INVALIDO`);
  - el estatus del pedido **se calcula** con sus líneas: todas `listo` → `listo`; alguna `en_proceso` o `listo` → `en_proceso`.
- **El historial** (`{ estatus, fecha, por, comentario }`) se escribe cuando cambia el estatus del pedido; el avance de una línea va en el comentario. `por` es `"sistema"`, `"cliente"` (al enviar una corrección) o el id del empleado.
- **Entregar** solo desde `listo` y con `saldo` 0 (409 `SALDO_PENDIENTE`, KARSO 5.6).

**Fecha para recoger** (KARSO 5.9)

- Al pasar a `recibido`:
  - `fechaInicioConteo` es ese momento o, si viene de una corrección, `correccionEnviadaEn`;
  - cada línea recibe `fechaEntregaEstimada` = día de recepción + `diasEntrega` días hábiles;
  - el pedido toma la más tardía.
- **Día de recepción:** el mismo día si es hábil y llega antes del corte de ese día (`entregas.diasHabiles[].corte`). Después del corte, en domingo o en festivo, el siguiente día hábil.
- Los días van como `AAAA-MM-DD` en la zona horaria de la tienda. La tienda muestra "Disponible para recoger a partir del …", no una fecha de entrega.

**Seguimiento y QR**

- `qr` es el folio. El front arma el enlace `<origen>/panel/seguimiento/<folio>`, así sirve en cualquier ambiente.
- `GET …/folio/:folio` **exige la sesión del dueño**: el QR no es público y uno ajeno responde 404.

<a id="pedidos-rechazo"></a>

**Rechazo y corrección**

- **El rechazo solo sale de `enviado`**, es decir, en mostrador al validar. KARSO 5.8 permite también rechazar en armado; la tienda lo dejó fuera, porque un defecto en producción es del taller, que ya validó (ver [pendientes](#pendientes)).
- **Se rechaza el pedido completo**, con un motivo del catálogo `configuracion.pedidos.motivosRechazo` (422 si la clave no está) y un comentario de 1 a 500 caracteres por cada línea marcada.
- **Rondas:** las líneas de una ronda comparten `fecha` y `fechaLimiteCorreccion`. Las rondas anteriores se conservan; la vigente es la de la `fecha` más reciente. Rechazar vacía `correccionEnviadaEn`.
- **Plazo para corregir:** `diasParaCorregir` días contados después del día del rechazo.
  - no cuentan los días fuera de `entregas.diasHabiles` (el domingo);
  - **los festivos sí cuentan**, porque el taller trabaja en festivos;
  - vence al **fin del último día** (23:59:59.999) en la zona de la tienda.

  Ejemplo: rechazado el lunes 2 nov 2026 con 5 días → vence el sábado 7 nov a las 23:59:59.999.
- Se notifica al cliente con los motivos y la fecha límite (ver [`notificaciones`](#modulo-notificaciones)).
- **La corrección cambia solo archivos**, de las líneas de la ronda vigente: lo demás está pagado y congelado.
  - el frente solo si la línea lleva frente;
  - el reverso solo si es de tipo archivo;
  - el archivo nuevo se evalúa con las reglas del catálogo actual (y solo formato y peso si la variante ya no existe), y solo advierte;
  - se copia a `pedidos/<folio>/<lineaId>_<cara>.<ext>`, reemplaza al anterior, que se borra, y marca `corregidoEn`.
- **"Enviar corrección"** exige todas las líneas de la ronda corregidas (422 `CORRECCION_INCOMPLETA`). Pasa a `enviado` con `correccionEnviadaEn` y el historial `por: "cliente"`, y mostrador vuelve a validar.
- **Si vence el plazo** sin enviar, el pedido pasa a `cancelado`:
  - `cancelacion: { fecha: <el límite>, por: "sistema", motivo: "No corrigió el archivo en el plazo", reembolso: null }`;
  - se liberan sus códigos.

  El detalle dice "El reembolso lo gestiona la sucursal". El reembolso lo registra el admin.

**Vencimientos**

- Los cancela el [job](#job) y también la lectura: lista, detalle, folio, pago y corrección.
- **La fecha de la cancelación es el límite**, no el momento en que se detectó.
- Se revisa otra vez bajo el candado, porque el pago o la corrección pudieron llegar entre la lectura y la cancelación.

### Lógica para portar

| Qué | Archivo | Tests |
| --- | --- | --- |
| Cotización de la línea y totales de KARSO 5.4, en centavos | `src/lib/pedidos/cotizacion.ts` | `src/lib/pedidos/cotizacion.test.ts` |
| Evaluar una línea contra el catálogo | `src/lib/pedidos/linea.ts` | `src/lib/pedidos/linea.test.ts` |
| Esquemas de la línea y de la corrección | `src/lib/validation/pedidos.ts` | `src/lib/validation/pedidos.test.ts` |
| Esquemas del checkout y datos fiscales | `src/lib/validation/checkout.ts`, `src/lib/validation/fiscal.ts` | `src/lib/validation/fiscal.test.ts`, `src/app/api/pedidos/checkout-routes.test.ts` |
| Recálculo, candado, líneas y confirmación | `src/server/pedidos/borrador.ts` | `src/server/pedidos/borrador.test.ts`, `src/app/api/pedidos/borrador-routes.test.ts` |
| Sucursal y factura en el borrador | `src/server/pedidos/checkout.ts` | `src/app/api/pedidos/checkout-routes.test.ts` |
| Folio por año y contador | `src/server/repositories/json-pedido-repository.ts`, `src/lib/pedidos/pago.ts` | `src/server/repositories/json-pedido-repository.test.ts`, `src/lib/pedidos/pago.test.ts` |
| Días hábiles, corte, fecha para recoger y estatus calculado | `src/lib/pedidos/entrega.ts` | `src/lib/pedidos/entrega.test.ts` |
| Validar, rechazar, mover líneas y entregar (lo que hará el panel) | `src/server/pedidos/panel-demo.ts` | `src/app/api/demo-panel/demo-panel-routes.test.ts` |
| Plazo para corregir y ronda vigente | `src/lib/pedidos/correccion.ts` | `src/lib/pedidos/correccion.test.ts` |
| Corregir archivos, enviar y vencer la corrección | `src/server/pedidos/correccion.ts`, `src/server/http/correccion.ts` | `src/app/api/pedidos/correccion-routes.test.ts` |
| Vencimientos al leer | `src/server/pedidos/vencimiento.ts` | `src/app/api/pedidos/pedidos-routes.test.ts`, `src/app/api/pedidos/pago-routes.test.ts` |
| Rutas | `src/app/api/pedidos/borrador/confirmar/route.ts`, `src/app/api/pedidos/borrador/items/route.ts` | `src/app/api/pedidos/borrador-routes.test.ts` |
| Extremo a extremo | — | `e2e/pedidos.spec.ts`, `e2e/checkout.spec.ts`, `e2e/seguimiento.spec.ts`, `e2e/correccion.spec.ts` |

### Emulado en el demo

- `data/orders.json` con candado de archivo, y el contador de folios en el mismo archivo.
- Los vencimientos, solo al leer.
- El simulador del panel: `/api/demo-panel/*`, solo con `DEMO_PANEL=1`.
- Los avisos al cliente, en la consola.
- Sucursales, configuración y catálogo, de `config/mock-panel/`.

Ver [Emulado → real](#emulado).

### Pendientes

- El borrador como estatus del pedido o como colección aparte.
- Los campos nuevos: `sucursalEntrega`, `avisos`, `problema`, `confirmadoAt`, `vencimientoPago` y `correccionEnviadaEn`.
- El rechazo solo desde `enviado`.
- El plazo de corrección: sin domingos, con festivos, hasta las 23:59.
- Que solo el admin cancele.
- Si se permiten huecos en los folios.

Ver [Pendientes con el socio](#pendientes).

---

<a id="modulo-pagos"></a>

## Módulo `pagos`

### Qué cubre

- **El pago en línea del total** con Mercado Pago Checkout Pro. En el demo se emula con una página que aprueba, rechaza o deja pendiente.
- **El paso de `pago_pendiente` a `enviado`**, cuando Mercado Pago confirma.
- **La cancelación automática** si no se paga en `horasExpiracionPagoPendiente`.

Spec: [07](../../specs/07-pago-mercado-pago-emulado-y-folio-kar.md). KARSO: 5.6, 6.5 (`pagos`, `pagado` y `saldo`) y 6.9.

### Colección y campos

**Sin colección propia: `pedidos.pagos[]`** (KARSO 6.5). En línea siempre es un solo tipo de pago:

| Campo | Valor en la tienda |
| --- | --- |
| `tipo` | `"total"`. Anticipo y liquidación son de mostrador |
| `metodo` | `"mercadopago"` |
| `monto` | El `total` del pedido, en pesos |
| `referencia` | El id de pago de Mercado Pago. En el demo, 10 dígitos al azar |
| `estatus` | `"aprobado"`, `"rechazado"` o `"pendiente"` |
| `fecha` | ISO 8601 |
| `recibidoPor` | `null`: solo se usa en mostrador |

- `pagado` es la suma de los pagos `aprobado`, y `saldo` = `total` − `pagado`. Se calculan en centavos.
- Cada intento queda en `pagos`, también los rechazados.
- Del pedido se usan `confirmadoAt` y `vencimientoPago` (ver [`pedidos`](#modulo-pedidos)).

### Endpoints

| Demo | Backend | Entrada | Respuesta | Errores |
| --- | --- | --- | --- | --- |
| `POST /api/pedidos/:id/pago-simulado` | **Propuesta:** `POST /tienda/pedidos/:id/pago` crea la preferencia de Mercado Pago y responde su `init_point`, y `POST /tienda/pagos/webhook` recibe la notificación de Mercado Pago (ver [Emulado → real](#emulado)) | `{ resultado: "aprobado" \| "rechazado" \| "pendiente" }` | El pedido, como en [`pedidos`](#modulo-pedidos). Aprobado: en `enviado` | 404 `NO_ENCONTRADO`; 409 `PAGO_VENCIDO`; 409 `ESTATUS_INVALIDO` "Este pedido ya no está esperando su pago"; 422 `VALIDACION` |

El regreso desde el checkout de Mercado Pago lleva al detalle del pedido, que vuelve a leer el estatus. El front espera el mismo pedido, sin importar de qué ruta venga.

### Reglas

- **Solo se paga en `pago_pendiente`.**
- **Aprobado:**
  - registra el pago, recalcula `pagado` y `saldo` y pasa el pedido a `enviado`;
  - el historial queda `por: "sistema"`, con "Pago aprobado por Mercado Pago";
  - se avisa al cliente: pedido confirmado (ver [`notificaciones`](#modulo-notificaciones)).
- **Rechazado o pendiente:** registra el intento y el pedido sigue en `pago_pendiente`. El cliente puede reintentar hasta la hora límite.
- **Hora límite:** `vencimientoPago` = `confirmadoAt` + `horasExpiracionPagoPendiente` (24 h, KARSO 6.9). **Se fija al confirmar**: si el panel cambia la configuración después, ese pedido no cambia. El front la muestra en la zona horaria de la tienda.
- **Vencimiento:** cuando `ahora ≥ vencimientoPago` y el pedido sigue en `pago_pendiente`, se cancela con:
  - `cancelacion: { fecha: vencimientoPago, por: "sistema", motivo: "Pago no recibido en N h", reembolso: null }`, donde N son las horas que tuvo ese pedido;
  - el historial;
  - los códigos de promoción liberados.

  Lo hacen el [job](#job) y la lectura.
- **Un pago que llega después del límite** responde 409 `PAGO_VENCIDO`, y el pedido queda cancelado aunque nadie lo hubiera leído.
- **Con Mercado Pago real:**
  - conviene darle a la preferencia `expiration_date_to` = `vencimientoPago`, para que no se pueda pagar tarde;
  - el webhook se verifica con su firma (`x-signature`) y consulta el pago a la API de Mercado Pago antes de registrarlo;
  - debe ser **idempotente** por `referencia`, porque Mercado Pago reintenta.
- **Entregar exige `saldo` 0** (KARSO 5.6). En línea, con el pago aprobado siempre es 0.

### Lógica para portar

| Qué | Archivo | Tests |
| --- | --- | --- |
| Folio, hora límite, vencimiento y `pagado`/`saldo` | `src/lib/pedidos/pago.ts` | `src/lib/pedidos/pago.test.ts` |
| Registrar el pago (lo que hará el webhook) y cancelar por vencimiento | `src/server/pedidos/pago.ts` | `src/app/api/pedidos/pago-routes.test.ts` |
| Esquema del resultado | `src/lib/validation/checkout.ts` | `src/app/api/pedidos/pago-routes.test.ts` |
| Ruta | `src/app/api/pedidos/[id]/pago-simulado/route.ts` | `src/app/api/pedidos/pago-routes.test.ts` |
| Extremo a extremo | — | `e2e/pago.spec.ts` |

### Emulado en el demo

- La página `/panel/pedidos/[id]/pago`, con "Aprobar", "Rechazar" y "Dejarlo pendiente", en lugar del checkout de Mercado Pago.
- El resultado lo manda el dueño del pedido, con su sesión, en lugar del webhook firmado.
- La referencia de 10 dígitos al azar.

Ver [Emulado → real](#emulado).

### Pendientes

- El contrato real: la preferencia, el webhook y sus credenciales.
- Dónde guardar el id de la preferencia, que KARSO 6.5 no tiene.
- El campo `vencimientoPago`.

Ver [Pendientes con el socio](#pendientes).

---

<a id="modulo-archivos"></a>

## Módulo `archivos`

### Qué cubre

Los archivos del cliente para cada línea:
- la subida **directa a R2** con URL firmada, en tres pasos, sin que el binario pase por el backend;
- la lectura de metadatos y la miniatura con `sharp`;
- frente y reverso (archivo, calendario o texto);
- la validación de KARSO 5.7, que **solo advierte**;
- el acceso solo del dueño;
- la copia a `pedidos/<folio>/` al hacer el pedido.

Spec: [05](../../specs/05-archivos-frente-reverso-y-validacion.md). La corrección de un archivo rechazado está en la [09](../../specs/09-rechazo-y-correccion-de-archivos.md) y aquí en [`pedidos`](#modulo-pedidos). KARSO: 2 (subida y buckets), 5.7 y 6.5 (`productos[].archivos`).

### Colección y campos

**`archivos`** (nueva, no está en KARSO; ver [pendientes](#pendientes)). Un documento por binario subido; es lo que permite subir antes de guardar la línea:

| Campo | Tipo | Notas |
| --- | --- | --- |
| `userId` | `ObjectId` | Dueño; solo él lo lee. No sale en la API |
| `nombreOriginal` | `string` | `cartel.jpg` |
| `extension` | `"jpg" \| "jpeg" \| "tiff" \| "pdf" \| "ai" \| "eps" \| "svg"` | La unión de los formatos del catálogo |
| `mime` | `string` | **Fijo por extensión**, nunca el que manda el navegador |
| `bytes` | `number` | Los declarados al pedir la URL; los reales al confirmar |
| `key` | `string` | `temporal/<id>.<ext>`, o `pedidos/<folio>/<lineaId>_<cara>.<ext>` ya en un pedido. No sale en la API |
| `estado` | `"pendiente" \| "subido"` | `pendiente`: hay URL pero falta confirmar |
| `metadatos` | `{ tipo: "imagen" \| "vector", legible, anchoPx, altoPx, color: "CMYK" \| "RGB" \| "otro" \| null } \| null` | Se llena al confirmar |
| `miniatura` | `boolean` | Si existe `<key>.miniatura.jpg` |
| `createdAt`, `subidoEn` | `Date` | |

Índices: `userId`. Los `pendiente` viejos se pueden limpiar con un TTL; los binarios de `temporal/` los borra la regla de R2 de 48 h.

**`pedidos.productos[].archivos`** (KARSO 6.5), con dos diferencias:
- cada cara guarda **`archivoId`** en lugar de `url`: el binario se sirve con verificación de dueño, y en R2 con una URL firmada de lectura de corta duración;
- cada cara suma `advertencias: [{ codigo, mensaje }]`, donde `codigo` es `formato`, `peso`, `ilegible`, `color`, `resolucion` o `medida`.

`reverso` es una de tres formas:
- `{ tipo: "archivo", …la cara }`;
- `{ tipo: "calendario", anio }`;
- `{ tipo: "texto", texto }`.

### Endpoints

| Demo | Backend | Entrada | Respuesta | Errores |
| --- | --- | --- | --- | --- |
| `POST /api/archivos/subidas` | `POST /tienda/archivos/subidas` | `{ nombre, bytes }` | 201 `{ archivo, subida: { url, metodo: "PUT", expiraEn } }`; el archivo queda `pendiente` | 415 `FORMATO_NO_PERMITIDO`; 413 `ARCHIVO_MUY_GRANDE` (más de 40 MB); 422 |
| `PUT /api/r2-local/:key*` | PUT directo a **R2** con la URL prefirmada (ver [Emulado](#emulado)) | El binario, sin sesión | 200 | 403 `FIRMA_INVALIDA` (alterada o vencida); 413 si pasa de los bytes declarados |
| `POST /api/archivos/:id/confirmar` | `POST /tienda/archivos/:id/confirmar` | — | `{ archivo }` `subido`, con `metadatos` y `miniatura`. Si ya estaba subido, lo devuelve igual | 404 `NO_ENCONTRADO` (también si es de otro cliente); 409 `ARCHIVO_NO_SUBIDO` si el binario no llegó |
| `GET /api/archivos/:id` | `GET /tienda/archivos/:id` (en R2: redirección a una URL firmada de lectura) | — | El binario: `content-type` fijo, `inline` solo para JPG y `attachment` para el resto, `nosniff`, `private, max-age=3600` | 404 (inexistente, ajeno o pendiente) |
| `GET /api/archivos/:id/miniatura` | `GET /tienda/archivos/:id/miniatura` | — | JPG sRGB de hasta 400 px | 404 |

`archivo` en la API es el documento sin `userId` ni `key`.

### Reglas

- **Tres pasos:** pedir la URL, PUT del binario a R2 y confirmar. El front reporta el avance del PUT con `XMLHttpRequest`, sin cookies: la firma autoriza.
- **La URL firmada** vale **15 min** y cubre el método, la llave, el vencimiento y los **bytes declarados**. El PUT no deja pasar más de lo declarado: en R2, con `Content-Length` firmado.
- **Al pedir la URL solo se rechaza lo que nunca sirve:** una extensión fuera de la unión del catálogo (PNG, PSD…) o más de 40 MB.
- **Al confirmar**, el backend lee el binario desde R2 y saca los metadatos:
  - de JPG y TIFF: píxeles, espacio de color y si el contenido es de verdad ese formato; un PNG renombrado queda "ilegible";
  - genera una **miniatura JPG sRGB** de 400 px, que no toca el original. Sin miniatura, el archivo sigue sirviendo;
  - de los vectores no se lee nada: solo cuentan el formato y el peso.
- **La validación contra la variante se hace al evaluar la línea, no al subir.** Así cambiar de variante o de medida revalida sin volver a subir. **Todo solo advierte** ("podría ser rechazado"), incluidos formato, peso e ilegible: mostrador decide al validar.
- **Resolución efectiva:** se calcula con los píxeles y la medida física, no con los dpi de los metadatos. Se exige **al menos** la mínima y la proporción con la tolerancia del producto; con medida fija se suma el rebase y se acepta girada si `permiteGirar`. Ejemplos de KARSO: tarjeta → 1098 × 661 px; lona de 2.00 × 1.50 m a 100 dpi → 7874 × 5906 px.
- **Reverso según `caras.reverso`** (`obligatorio`, `opcional` o `no_aplica`):
  - puede ser el archivo del cliente, un **calendario** (solo el año: el actual o el siguiente) o un **texto** de hasta 500 caracteres;
  - calendario y texto valen también para `obligatorio`, y no cambian el precio;
  - un reverso en una variante `no_aplica` responde 422.
- **Solo el dueño** lee el archivo y su miniatura. Uno ajeno responde 404, igual que uno inexistente.
- **Al hacer el pedido** se copia cada cara a `pedidos/<folio>/<lineaId>_<cara>.<ext>` (KARSO 2), aunque el mismo archivo se use en dos líneas, y se borran los temporales que se usaron.
- **Quitar una línea o cambiar su archivo** borra el anterior si ninguna otra línea lo usa.

### Lógica para portar

| Qué | Archivo | Tests |
| --- | --- | --- |
| Validación 5.7 (formato, peso, color, resolución efectiva, medida, giro) y frente y reverso de la línea | `src/lib/pedidos/archivo-linea.ts` | `src/lib/pedidos/archivo-linea.test.ts` |
| Formatos, 40 MB, MIME por extensión y esquema del reverso | `src/lib/validation/pedidos.ts` | `src/lib/validation/pedidos.test.ts` |
| Metadatos y miniatura con `sharp` | `src/server/archivos/procesar.ts` | `src/app/api/archivos/archivos-routes.test.ts` |
| URL firmada (en R2 la da su SDK) | `src/server/storage/url-firmada.ts` | `src/app/api/archivos/archivos-routes.test.ts` |
| Copia al pedido, borrado y corrección | `src/server/pedidos/archivos-pedido.ts` | `src/app/api/pedidos/borrador-routes.test.ts`, `src/app/api/pedidos/correccion-routes.test.ts` |
| Rutas | `src/app/api/archivos/subidas/route.ts`, `src/app/api/archivos/[id]/confirmar/route.ts` | `src/app/api/archivos/archivos-routes.test.ts` |
| Extremo a extremo | — | `e2e/archivos.spec.ts` |

### Emulado en el demo

- El "R2 local" (`/api/r2-local`) con su firma HMAC de `AUTH_SECRET`.
- `uploads/` como bucket privado.
- Ninguna limpieza automática de `temporal/`.

Ver [Emulado → real](#emulado).

### Pendientes

- La colección `archivos`.
- `archivoId` y `advertencias` en las caras del pedido.
- El reverso con calendario o texto, también para `obligatorio`.
- Que todo solo advierta.

Ver [Pendientes con el socio](#pendientes).

---

<a id="modulo-notificaciones"></a>

## Módulo `notificaciones`

### Qué cubre

Los avisos mínimos al cliente de KARSO 5.8: pedido **confirmado**, **rechazado** (con el motivo) y **listo**. **Es una propuesta:** KARSO 2 no lista este módulo, y las tres notificaciones las emiten otros módulos (`pagos` y el panel). Specs: [08](../../specs/08-seguimiento-estatus-por-linea-recoger-y-qr.md) (su "Nota para el backend: notificaciones") y [09](../../specs/09-rechazo-y-correccion-de-archivos.md).

### Colección y campos

**`notificaciones`** (nueva, propuesta; no está en KARSO). Es un *outbox*: un documento por aviso, que se escribe en la misma transacción que el cambio de estatus.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `evento` | `"pedido.enviado" \| "pedido.rechazado" \| "pedido.listo"` | `pedido.enviado` es el "pedido confirmado" de KARSO: el pago aprobado |
| `pedidoId`, `usuarioId` | `ObjectId` | |
| `canal` | `"correo" \| "whatsapp"` | Uno por canal |
| `estado` | `"pendiente" \| "enviada" \| "fallida"` | |
| `intentos`, `ultimoError` | `number`, `string \| null` | Para los reintentos |
| `creadoEn`, `enviadoEn` | `Date` | |

Índice: `{ estado, creadoEn }`, para que el worker tome los pendientes.

### Endpoints

No aplica: la tienda no tiene rutas de avisos. Los avisos salen del backend hacia el proveedor.

### Reglas

- **Dónde se emite cada uno:**

  | Evento | Cuándo | Texto del demo |
  | --- | --- | --- |
  | `pedido.enviado` | Mercado Pago aprueba el pago (`pago_pendiente` → `enviado`) | "Tu pedido KAR-… está confirmado: recibimos tu pago y la sucursal revisará tus archivos" |
  | `pedido.rechazado` | Mostrador rechaza (`enviado` → `rechazado`) | "Tu pedido KAR-… fue rechazado: <línea>: <motivo> — <comentario>; …. Corrige antes del <día>." |
  | `pedido.listo` | La última línea pasa a `listo` | "Tu pedido KAR-… está listo para recoger en <sucursal>" |

- **Solo esos tres** (decisión de la SPEC 09). El envío de una corrección y las cancelaciones automáticas no avisan.
- **Un aviso que falla nunca revierte el cambio de estatus.** El outbox lo reintenta.
- **Un worker** lee los pendientes y envía:
  - por **correo**, con un proveedor como Resend o Amazon SES y una plantilla por evento;
  - y por **WhatsApp**, porque el número ya está verificado, con plantillas aprobadas de la Cloud API de Meta.

  Puede vivir en la API, con el mismo `@nestjs/schedule` y candado del [job](#job).
- **El rechazo** lista solo las líneas de la ronda vigente, con el `nombre` del motivo del catálogo, y da el día límite en la zona horaria de la tienda.

### Lógica para portar

| Qué | Archivo | Tests |
| --- | --- | --- |
| Textos de los tres avisos | `src/server/notificaciones.ts` | `src/app/api/demo-panel/demo-panel-routes.test.ts` |
| Dónde se emiten | `src/server/pedidos/pago.ts`, `src/server/pedidos/panel-demo.ts` | `src/app/api/pedidos/pago-routes.test.ts`, `src/app/api/demo-panel/demo-panel-routes.test.ts` |

### Emulado en el demo

`notificar()` solo escribe `[DEMO CORREO] …` en la consola del servidor. Ver [Emulado → real](#emulado).

### Pendientes

- Las 3 notificaciones mínimas, y por qué canal: correo, WhatsApp o los dos.
- El módulo y la colección `notificaciones`, que son propuesta.

Ver [Pendientes con el socio](#pendientes).

---

<a id="emulado"></a>

## Emulado → real

**Las piezas de esta sección no son contrato del backend.** Lo que sí es contrato es lo que el front recibe, que dice la última columna. Esta sección no diseña las integraciones; solo dice qué hace hoy cada pieza y qué debe hacer la real.

| Pieza | Hoy en el demo | Real | Lo que el front sigue esperando |
| --- | --- | --- | --- |
| **Simulador del panel** (`/api/demo-panel/*`) | Rutas sin sesión, solo con `DEMO_PANEL=1` (404 sin la variable). Validan, rechazan, mueven líneas y entregan; el historial queda `por: "panel-demo"` | Los endpoints del **panel** bajo `/admin`, con sesión de empleado (audiencia `admin`, `rol` y `sucursalId`) y el filtro de IPs de KARSO 2. Los define el proyecto del panel | Las reglas y los estatus de [`pedidos`](#modulo-pedidos), que la tienda lee |
| **R2 local** (`PUT /api/r2-local/:key*`) | Firma HMAC con `AUTH_SECRET` sobre método, llave, vencimiento y bytes; guarda en `uploads/` | URL prefirmada de R2 (API compatible con S3) para el PUT, con `Content-Length` firmado, en el bucket privado `karso-pedidos`. CORS del bucket: solo el origen de la tienda, con `PUT`. Lectura con una URL firmada de 15 min | `subida: { url, metodo: "PUT", expiraEn }`: el front hace el PUT a la `url` que reciba, sin cookies |
| **Bucket local** (`uploads/`) | `src/server/storage/local-file-storage.ts` | R2 con la regla de ciclo de vida de 48 h sobre `temporal/` | Nada: el front nunca ve las llaves |
| **Google simulado** (`POST /api/auth/google-mock`) | Un modal con nombre y correo, en los que se confía | OAuth 2.0 / OpenID Connect: `GET /tienda/auth/google` → Google → callback que verifica el `id_token`, vincula por correo verificado y crea la sesión. Ver [`auth`](#modulo-auth) | Las mismas cookies y el mismo `user`, con `perfil_incompleto` si es nuevo. **Cambia el front:** el botón navega en lugar de abrir el modal |
| **Código de WhatsApp** | `[DEMO WHATSAPP] Código para …` en la consola, y `demoCodigo` en la respuesta fuera de producción | Plantilla de autenticación de la WhatsApp Cloud API. **Nunca** `demoCodigo` | Las mismas respuestas, sin `demoCodigo`. El front solo lo muestra si llega |
| **Pago simulado** (`POST /api/pedidos/:id/pago-simulado`) | Una página con "Aprobar", "Rechazar" y "Dejarlo pendiente"; el resultado lo manda el cliente con su sesión | Mercado Pago Checkout Pro: una preferencia con `expiration_date_to` y un webhook firmado e idempotente. Ver [`pagos`](#modulo-pagos) | El pedido en `enviado` al aprobarse; el detalle relee el estatus al volver |
| **Datos del panel** (`config/mock-panel/*.json`) | `productos`, `sucursales`, `banners`, `configuracion` y `promociones`, validados con zod en cada petición (500 si están mal formados; rutas cambiables con `PRODUCTOS_PATH` y las demás). Las imágenes de los banners, en `public/mock/` | Las colecciones de KARSO 6.3, 6.4, 6.6, 6.8 y 6.9, que administra el panel. La tienda **solo lee**, con los mismos filtros (`src/server/tienda.ts`). Las imágenes, en `karso-publico` | Las respuestas de `/tienda/productos`, `/tienda/sucursales` y `/tienda/banners`, ya filtradas |
| **`sharp`** | Se corre dentro de la petición de confirmar la subida, sobre el archivo local | Igual en NestJS, leyendo el binario desde R2. Con archivos de 40 MB conviene vigilar la memoria, o pasarlo a un worker | `metadatos` y `miniatura` en la respuesta de confirmar |
| **Persistencia** (`data/*.json`) | Un archivo por colección, con candado de proceso y `version` (`src/server/storage/json-store.ts`) | MongoDB Atlas: actualizaciones atómicas (`findOneAndUpdate`) o transacciones en lugar del candado. Ver [Versiones de datos](#transversal) | Nada |
| **Vencimientos** | Solo al leer | Al leer y con el [job](#job) cada 5 minutos | Los pedidos vencidos ya salen cancelados |
| **Avisos al cliente** | `[DEMO CORREO] …` en la consola | El outbox y el worker de [`notificaciones`](#modulo-notificaciones) | Nada: no hay pantalla |
| **Firma de la sesión** | La tienda firma y verifica con `AUTH_PRIVATE_KEY`, y el middleware verifica con las llaves del entorno | El backend firma. El middleware del front verifica con el JWKS del backend (`createRemoteJWKSet` de `jose`) | Las cookies `acceso` y `renovacion` y los códigos 401 de la [guarda](#guarda-de-sesion) |

### Rutas del simulador del panel

Ninguna pide sesión. Sin `DEMO_PANEL=1` todas responden 404 `NO_ENCONTRADO`. Las que cambian un pedido responden `{ pedido }`.

| Demo | Real | Entrada | Respuesta | Errores |
| --- | --- | --- | --- | --- |
| `GET /api/demo-panel/pedidos` | Lista de pedidos del panel (`/admin`) | — | `{ pedidos, motivosRechazo }`: todos sin el borrador, con `cliente` (nombre), y antes cancela los vencidos de todos | 500 si la configuración está mal formada |
| `POST /api/demo-panel/pedidos/:id/validar` | Validar en mostrador | — | `enviado` → `recibido`, con las fechas para recoger | 404; 409 `ESTATUS_INVALIDO` |
| `POST /api/demo-panel/pedidos/:id/rechazar` | Rechazar en mostrador | `{ lineas: [{ lineaId, motivo, comentario }] }`, al menos una y sin repetir | `enviado` → `rechazado`, con el plazo; avisa al cliente | 404 (pedido o línea); 409 `ESTATUS_INVALIDO`; 422 `VALIDACION` (`lineas.0.motivo` si la clave no está en el catálogo) |
| `POST /api/demo-panel/pedidos/:id/lineas/:lineaId` | Producción mueve una línea | `{ estatus: "en_proceso" \| "listo" }` | El pedido con su estatus calculado; avisa al quedar listo | 404; 409 `ESTATUS_INVALIDO` (pedido fuera de producción, o la línea retrocede) |
| `POST /api/demo-panel/pedidos/:id/entregar` | Entregar en mostrador | — | `listo` → `entregado` | 404; 409 `ESTATUS_INVALIDO`; 409 `SALDO_PENDIENTE` |

Lógica: `src/server/pedidos/panel-demo.ts` y `src/lib/validation/panel-demo.ts`. Tests: `src/app/api/demo-panel/demo-panel-routes.test.ts` y `e2e/seguimiento.spec.ts`.

---

<a id="pendientes"></a>

## Pendientes con el socio

Lo que se aparta de KARSO o lo que KARSO deja abierto. Cada punto dice su spec de origen. **Hasta que el socio lo confirme**, el backend sigue lo que dice la hoja, porque es lo que el front espera.

**Contrato y nombres**

1. **Prefijo `/tienda`** para todas las rutas del demo, y `path` `/tienda/auth` para la cookie `renovacion`. Lo pide KARSO 2; el front todavía llama a `/api` (SPEC 12).
2. **El campo `whatsapp`** en lugar de `telefono`, porque es el número verificado por WhatsApp (SPEC 01 y [10](../../specs/10-perfil-del-cliente.md)).
3. **Nombres de campo distintos de KARSO:** `userId` (`usuarioId`), `nombre` (`nombres`), `createdAt` y `updatedAt` (`creadoEn` y `actualizadoEn`). Hay que decidir si el backend usa los de KARSO y traduce en la API, o los del demo (SPEC 12).
4. **Montos:** `Decimal128` o centavos enteros en Mongo; la API sigue en pesos con 2 decimales (KARSO 2; [04](../../specs/04-catalogo-y-cotizacion-karso.md)).
5. **Zona horaria:** KARSO dice `America/Monterrey` y el mock del panel trae `America/Mexico_City` ([07](../../specs/07-pago-mercado-pago-emulado-y-folio-kar.md)). El resultado es el mismo, pero hay que fijar una. Además, el demo tiene `ZONA_HORARIA_TIENDA` escrita en `src/lib/configuracion/schema.ts` (formato de fechas y año del calendario). El backend siempre debe leer `configuracion.zonaHoraria` (SPEC 12).

**Colecciones y campos nuevos**

6. **El borrador en el servidor**, para que sea el mismo en todos los dispositivos. Hoy es un pedido en `borrador`; la alternativa es una colección aparte. No está en las 10 colecciones de KARSO ([04](../../specs/04-catalogo-y-cotizacion-karso.md) y [06](../../specs/06-checkout-sucursal-factura-y-promociones.md)).
7. **`usosPromociones` en el usuario**, provisional. Se propone `usosActuales` con `$inc` más el conteo en `pedidos` ([06](../../specs/06-checkout-sucursal-factura-y-promociones.md)).
8. **Colecciones nuevas:**
   - `sesiones`, la sesión revocable ([11](../../specs/11-sesion-con-tokens-y-jwks.md));
   - `verificaciones`, los códigos de WhatsApp ([01](../../specs/01-base-y-autenticacion-demo.md) y 10);
   - `archivos`, la subida antes de la línea ([05](../../specs/05-archivos-frente-reverso-y-validacion.md));
   - `notificaciones`, el outbox propuesto ([08](../../specs/08-seguimiento-estatus-por-linea-recoger-y-qr.md)).
9. **Las caras del pedido** guardan `archivoId` y `advertencias` en lugar de `url` ([05](../../specs/05-archivos-frente-reverso-y-validacion.md)).
10. **Campos nuevos del pedido:** `sucursalEntrega`, `avisos`, `problema`, `confirmadoAt`, `vencimientoPago` y `correccionEnviadaEn` (06–09).

**Reglas**

11. **Los archivos solo advierten**, también por formato, peso o ilegible: mostrador decide. El reverso puede ser un calendario o un texto, también cuando es `obligatorio` ([05](../../specs/05-archivos-frente-reverso-y-validacion.md)).
12. **Solo el admin cancela**, como dice KARSO 5.8, y el sistema por vencimiento. El cliente no cancela ([07](../../specs/07-pago-mercado-pago-emulado-y-folio-kar.md)).
13. **El rechazo solo desde `enviado`.** KARSO 5.8 permite también rechazar en armado; la tienda lo dejó fuera porque un defecto en producción es del taller, que ya validó ([09](../../specs/09-rechazo-y-correccion-de-archivos.md)).
14. **Los 5 días para corregir:** no cuentan los domingos, los festivos sí, y el plazo vence a las 23:59 del último día, en la hora de la tienda. KARSO 8 lo dejó abierto: "naturales o hábiles" ([09](../../specs/09-rechazo-y-correccion-de-archivos.md)) Ojo: la fecha para recoger salta los festivos (KARSO 5.9) y el plazo de corrección los cuenta. Son dos reglas distintas a propósito; falta confirmar si en festivos también se entrega.
15. **Las 3 notificaciones mínimas:** confirmado, rechazado y listo, y nada más. Falta decidir el canal: correo, WhatsApp o los dos ([08](../../specs/08-seguimiento-estatus-por-linea-recoger-y-qr.md) y 09).
16. **"Socio" sin beneficios:** solo guarda el nombre del negocio y la dirección (KARSO 8; [10](../../specs/10-perfil-del-cliente.md)).
17. **Huecos en los folios:** si un folio consumido por una confirmación que falló puede quedar sin usar, o si se exige la transacción (SPEC 12).

**Integraciones**

18. **Mercado Pago:** las credenciales, la preferencia, el webhook y dónde guardar el id de la preferencia, que KARSO 6.5 no tiene ([07](../../specs/07-pago-mercado-pago-emulado-y-folio-kar.md)).
19. **La cookie `renovacion` con `sameSite: strict`.** Al entrar a `/panel/…` desde un enlace de otro sitio (WhatsApp, correo) con el acceso vencido, el navegador no la manda en la redirección a renovar, y el cliente tiene que volver a iniciar sesión. Escanear el QR con la cámara sí funciona. Se propone que, si falta la cookie, la página se recargue una vez desde el mismo origen (por ejemplo, con un `meta refresh`), para que la cookie sí viaje ([11](../../specs/11-sesion-con-tokens-y-jwks.md)).
20. **El cifrado por campo** de KARSO 2.1 b): teléfono, dirección y datos fiscales. Lo hace el backend y el contrato de la API no cambia ([10](../../specs/10-perfil-del-cliente.md)).

---

<a id="fuera"></a>

## Lo que no está en la hoja

Lo que **no** usa la tienda y se diseña con el panel, con KARSO de referencia:

- **Empleados, roles y su sesión** (audiencia `admin`): KARSO 4 y 6.2.
- **Lotes, planillas y descarga para armado:** KARSO 5.10 y 6.7.
- **Pedidos y pagos de mostrador:** anticipo, liquidación y el saldo al escanear el QR (KARSO 5.6 y 5.11).
- **Los endpoints `/admin`** que reemplazan al [simulador del panel](#emulado), y la vista pública editable (KARSO 5.12).
- **El acceso al panel por IPs** de las sucursales: KARSO 2 y 8.
- **El módulo `cifrado`:** cifrado de sobre, índices ciegos y llaves (KARSO 2.1 b). Solo se anota que no cambia la API.
- **La facturación** (timbrado CFDI) y los **reembolsos**: KARSO 3 los deja fuera del MVP. La tienda solo guarda `requiereFactura` y `datosFiscales`.
- **Los socios por API:** KARSO 2.1 c) y el `canal: "socio"` futuro.
- **Las precisiones del catálogo:** precios, tolerancias y días de entrega. Son datos del panel (KARSO 8).
