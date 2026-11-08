# SPEC 11 — Sesión con tokens de acceso y renovación, y JWKS

> **Estado:** Approved
> **Depende de:** SPEC 01, SPEC 08, SPEC 10
> **Fecha:** 2026-11-07
> **Objetivo:** Cambiar la sesión a lo que pide KARSO 2.1: un token de acceso de 15 minutos y uno de renovación de 7 días (rotado en cada uso y revocable), firmados con llave asimétrica `RS256` y publicados en `/.well-known/jwks.json` con su `kid`, con audiencia `tienda`, un registro de sesiones que permite revocarlas, y que cambiar la contraseña (pidiendo la actual) cierre las demás sesiones.

---

## Por qué existe este spec

KARSO 2.1 a) define la sesión:

- **Firma:** tokens firmados con **llave privada** (`RS256` o `EdDSA`) que solo tiene el backend, verificables con la **llave pública** publicada en `/.well-known/jwks.json`.
- **Rotación de llaves:** cada llave tiene un `kid`, para cambiarla sin cerrar todas las sesiones de golpe.
- **Tokens:** uno de **acceso** de 15 minutos y uno de **renovación** de 7 días, que se rota en cada uso y se puede revocar.
- **Audiencia:** `tienda`, separada de la del panel (`admin`).
- **Cookie:** en la tienda, la renovación va en una cookie `httpOnly`, `secure` y `sameSite`.

Hoy hay un solo JWT HS256 (`AUTH_SECRET`) en la cookie `session`, de 7 días y sin forma de revocarlo. La SPEC 10 dejó dos pendientes que dependen de esto: cerrar las demás sesiones al cambiar la contraseña y pedir la contraseña actual.

El paso siguiente es el backend (NestJS). Por eso este spec **no busca conservar la demo** (decisión del usuario): las sesiones abiertas se cierran y se vuelve a iniciar sesión. Lo que importa es que la forma de los tokens, el JWKS y las reglas de revocación sean las que el backend va a implementar.

La **hoja técnica para el backend**, que reúne todo lo trabajado en las SPEC 01 a 11, es la **SPEC 12** (decisión del usuario).

**Decisiones del usuario** (2026-11-07):

1. **Llave:** `RS256`, en variables de entorno (`AUTH_PRIVATE_KEY`, `AUTH_KEY_ID`), con un script para generarla. Una llave pública anterior opcional, para mostrar la rotación.
2. **Tokens:** los dos en cookies `httpOnly`. El middleware y `apiFetch` renuevan sin que el usuario lo note.
3. **Registro de sesiones:** en `data/sesiones.json`. Las rutas de la API revisan el `sid` en cada petición, así que revocar corta de inmediato. Un token de renovación reusado revoca la sesión.
4. **Qué revoca qué:**
   - "Cerrar sesión" revoca la sesión actual;
   - cambiar la contraseña revoca las demás;
   - "Mi perfil" tiene "Cerrar sesión en los demás dispositivos", sin lista de sesiones.
5. **Despliegue:** la cookie `session` vieja deja de valer y no se migra. Para cambiar la contraseña **se pide la actual**.
6. **Token de renovación:** un **JWT firmado** con `jti`.
7. **Token de acceso:** encabezado `alg`/`kid`; datos `iss`, `aud`, `sub`, `sid`, `idCliente`, `estado`, `iat` y `exp`.

---

## Alcance

**Entra:**

- **Llaves (`RS256`):**
  - `AUTH_PRIVATE_KEY` (PEM PKCS#8) y `AUTH_KEY_ID` (el `kid`), obligatorias: sin ellas el servidor no arranca, como hoy con `AUTH_SECRET`;
  - `AUTH_PUBLIC_KEY_ANTERIOR` y `AUTH_KEY_ID_ANTERIOR`, opcionales: si están, el JWKS también publica esa llave y los tokens con ese `kid` siguen siendo válidos hasta vencer;
  - `AUTH_ISSUER` (`iss`), por omisión el origen de la tienda;
  - el script `pnpm generar-llaves` imprime las líneas para `.env.local` y `.env.example` lo documenta.
- **`GET /.well-known/jwks.json`:**
  - las llaves públicas (`kty`, `n`, `e`, `kid`, `alg: "RS256"`, `use: "sig"`), sin sesión y con caché corta;
  - nunca publica la parte privada.
- **Token de acceso:**
  - JWT `RS256` con `kid`, `iss`, `aud: "tienda"`, `sub`, `sid`, `idCliente`, `estado`, `iat` y `exp` (15 min);
  - va en la cookie `acceso` (`httpOnly`, `sameSite: lax`, `secure` en producción, `path /`);
  - la cookie dura lo mismo que la sesión, así el middleware distingue "vencido" de "sin sesión".
- **Token de renovación:**
  - JWT `RS256` con `kid`, `iss`, `aud: "tienda-renovacion"`, `sub`, `sid`, `jti` e `exp` (7 días);
  - va en la cookie `renovacion` (`httpOnly`, `sameSite: strict`, `secure` en producción, **`path /api/auth`**).
- **Registro de sesiones (`data/sesiones.json`, versión 1):**
  - una sesión por inicio de sesión, con el `jti` vigente, el agente (navegador), las fechas y la revocación;
  - se crea al iniciar sesión (correo, Google, registro);
  - las sesiones vencidas o revocadas hace más de 7 días se limpian al escribir.
- **Renovar (`/api/auth/renovar`):**
  - verifica el token de renovación, que la sesión siga activa y que el `jti` sea el vigente;
  - **rota**: un `jti` nuevo y 7 días más, y emite un token de acceso nuevo;
  - `GET ?siguiente=` (lo usa el middleware): renueva y redirige a la página; si no puede, borra las cookies y manda a `/login?siguiente=`;
  - `POST` (lo usa `apiFetch`): responde `{ user }` o 401.
- **Reúso:** un token de renovación con firma válida pero un `jti` que ya no es el vigente **revoca la sesión** (motivo `reuso`) y responde 401.
- **Middleware (edge):**
  - verifica el token de acceso con la llave pública y el `kid`;
  - **vencido** con firma válida: redirige a `/api/auth/renovar?siguiente=<la página>`;
  - **ausente o inválido**: como hoy, "sin sesión";
  - la cookie `session` vieja se borra.
- **Rutas de la API:**
  - `requireSessionUser` verifica el token de acceso y que el `sid` **no esté revocado ni vencido** en `sesiones.json`;
  - errores: 401 `TOKEN_EXPIRADO` (acceso vencido), 401 `SESION_REVOCADA` (borra las cookies) o 401 `NO_AUTENTICADO`.
- **`apiFetch`:** ante un 401 `TOKEN_EXPIRADO`, hace **una** renovación (`POST /api/auth/renovar`) y reintenta la petición una vez. Las renovaciones simultáneas se juntan en una sola.
- **Cambios de estado de la cuenta** (completar perfil, verificar WhatsApp): emiten un token de acceso nuevo de la **misma** sesión, con el estado nuevo.
- **Revocación:**
  - "Cerrar sesión" (`POST /api/auth/logout`) revoca la sesión actual (`logout`) y borra las cookies;
  - cambiar la contraseña revoca **las demás** sesiones del usuario (`cambio_contrasena`) y conserva la actual;
  - **`DELETE /api/perfil/sesiones`**, el botón "Cerrar sesión en los demás dispositivos" de "Mi perfil", revoca las demás (`otras_sesiones`) y responde cuántas cerró.
- **Contraseña actual (SPEC 10):**
  - `PUT /api/perfil/contrasena` pide `contrasenaActual` si la cuenta ya tiene contraseña; si no coincide, 422 "La contraseña actual no es correcta";
  - una cuenta de Google sin contraseña la crea sin ella;
  - la tarjeta muestra "Contraseña actual" solo cuando aplica, y al guardar dice "Cerramos tus otras sesiones".
- **`AUTH_SECRET`** se queda solo para firmar las URLs de subida (SPEC 05) y se actualiza su descripción.
- Tests unitarios, de rutas y E2E (incluido verificar un token con el JWKS), y el README.

**No entra:**

- La audiencia `admin`, los empleados y su `rol`/`sucursalId` (panel).
- La API para socios con llave pública registrada (KARSO 2.1 c).
- El cifrado por campo (KARSO 2.1 b) y la restricción por IP del panel.
- Una lista de sesiones activas para cerrar una por una.
- Migrar las sesiones abiertas: se cierran.
- Rotar llaves automáticamente: se rotan cambiando las variables.
- La hoja técnica para el backend (SPEC 12).

---

## Modelo de datos

### Llaves (`src/server/auth/llaves.ts`, compatible con edge)

- `llaveDeFirma()`: importa `AUTH_PRIVATE_KEY` (RS256) y la deja en caché. Lanza si falta o no es RSA, y entonces el servidor no arranca.
- `llavesPublicas()`: la pública de la actual, derivada de la privada, más la anterior si está configurada, cada una con su `kid`. Sirven para verificar y para el JWKS.
- `jwks()`: `{ keys: [{ kty, n, e, kid, alg: "RS256", use: "sig" }] }`.

### Tokens (`src/server/auth/tokens.ts`, compatible con edge)

```ts
export const ACCESO_SEGUNDOS = 15 * 60; // AUTH_ACCESO_SEGUNDOS lo acorta solo en e2e
export const RENOVACION_SEGUNDOS = 7 * 24 * 60 * 60;

export interface Acceso { sub: string; sid: string; idCliente: string; estado: EstadoCuenta }
export interface Renovacion { sub: string; sid: string; jti: string }

export type Verificacion<T> = { ok: true; datos: T } | { ok: false; motivo: "vencido" | "invalido" };

firmarAcceso(datos: Acceso): Promise<string>          // aud "tienda"
verificarAcceso(token?: string): Promise<Verificacion<Acceso>>
firmarRenovacion(datos: Renovacion): Promise<string>  // aud "tienda-renovacion"
verificarRenovacion(token?: string): Promise<Verificacion<Renovacion>>
```

`verificarAcceso` revisa la firma (por `kid`), `alg`, `iss`, `aud` y la forma de los datos. Distingue "vencido" (firma válida, `exp` pasado) de "inválido".

### Sesión (`src/server/domain/sesion.ts`)

```ts
export type MotivoRevocacion = "logout" | "cambio_contrasena" | "otras_sesiones" | "reuso";

export interface Sesion {
  id: string; // sid (UUID)
  userId: string;
  jtiVigente: string; // el del último token de renovación emitido
  agente: string; // User-Agent, recortado a 200 caracteres
  creadaEn: string; // ISO
  renovadaEn: string;
  expiraEn: string; // renovadaEn + 7 días
  revocadaEn: string | null;
  motivoRevocacion: MotivoRevocacion | null;
}
```

`data/sesiones.json` versión 1: `{ version: 1, sesiones: Sesion[] }`. El repositorio `SesionRepository` tiene `create`, `findById`, `update`, `revocarDelUsuario(userId, { excepto?, motivo })` y la limpieza.

### Servicio (`src/server/auth/sesiones.ts`, solo Node)

- `iniciarSesion(user, agente)`: crea la sesión y pone las dos cookies.
- `renovarSesion(tokenRenovacion)`: devuelve el usuario y pone cookies nuevas, o falla con `"sin_sesion" | "revocada" | "vencida" | "reuso"`. El reúso revoca.
- `reemitirAcceso(user, sid)`: un token de acceso nuevo de la misma sesión, para los cambios de estado.
- `cerrarSesion(sid)` y `cerrarOtrasSesiones(userId, sidActual, motivo)`.
- `sesionActual()`: el `{ user, sesion }` de la petición, o el motivo por el que no hay.

### API

| Método y ruta | Uso |
| --- | --- |
| `GET /.well-known/jwks.json` | Las llaves públicas (sin sesión) |
| `GET /api/auth/renovar?siguiente=` | Renueva y redirige a `siguiente` (solo `/panel/…` o la pantalla del estado); si falla, borra las cookies y va a `/login?siguiente=` |
| `POST /api/auth/renovar` | Renueva → `{ user }`; 401 `NO_AUTENTICADO`, `SESION_REVOCADA` o `SESION_VENCIDA` |
| `POST /api/auth/logout` | Revoca la sesión actual y borra las cookies |
| `DELETE /api/perfil/sesiones` | Revoca las demás sesiones → `{ cerradas: n }` |
| `PUT /api/perfil/contrasena` | Suma `contrasenaActual` (obligatoria si la cuenta tiene contraseña): 422 si no coincide. Revoca las demás sesiones → `{ user, sesionesCerradas }` |

Todas las rutas con sesión pueden responder 401 `TOKEN_EXPIRADO`, que `apiFetch` maneja solo.

---

## Plan de implementación

1. **Llaves, tokens y JWKS.**
   - `llaves.ts` y `tokens.ts`, compatibles con edge.
   - `GET /.well-known/jwks.json`.
   - El script `pnpm generar-llaves` y `.env.example`.
   - Las llaves de prueba para Vitest y Playwright, generadas al configurar, no guardadas en git.
   - Tests: firmar y verificar, vencido o inválido, otro `kid`, la llave anterior, `aud` equivocada, y que el JWKS no tiene la parte privada.
2. **Registro de sesiones.**
   - `Sesion`, `sesiones.json` v1 y su repositorio.
   - `src/server/auth/sesiones.ts`: iniciar, renovar con rotación y detección de reúso, revocar, revocar las demás y la limpieza.
   - Tests.
3. **Emisión y guardas.**
   - Login, Google, registro, completar perfil y verificar WhatsApp usan `iniciarSesion` o `reemitirAcceso`.
   - `requireSessionUser` revisa el `sid`.
   - `/api/auth/me`, `/api/auth/logout`, `GET` y `POST /api/auth/renovar`.
   - El middleware: redirección a renovar y borrado de la cookie `session`.
   - Se quitan el HS256 y `SESSION_COOKIE`.
   - Ajustar los tests de auth y de rutas, más los nuevos de renovación y revocación.
4. **Cliente.**
   - `apiFetch` renueva una vez ante `TOKEN_EXPIRADO` y reintenta, juntando las renovaciones simultáneas.
   - Si la renovación falla, el error llega como hoy (401), y las pantallas ya mandan a `/login`.
   - Tests.
5. **Revocación en el perfil.**
   - `PUT /api/perfil/contrasena` con la contraseña actual, y que revoque las demás sesiones.
   - `DELETE /api/perfil/sesiones`.
   - La tarjeta de contraseña: "Contraseña actual" cuando aplica y "Cerramos tus otras sesiones".
   - "Cerrar sesión en los demás dispositivos", con su confirmación.
   - Tests de rutas y de hooks.
6. **E2E** (`e2e/sesion-tokens.spec.ts`; el servidor de e2e corre con `AUTH_ACCESO_SEGUNDOS` corto):
   - las cookies `acceso` y `renovacion` con sus banderas y su `path`;
   - el token de acceso se verifica con `/.well-known/jwks.json`;
   - al vencer el acceso, navegar y llamar a la API siguen funcionando, y la renovación rota el `jti`;
   - reusar un token de renovación ya rotado cierra la sesión;
   - cambiar la contraseña (con la actual) cierra la sesión del otro navegador y conserva la propia;
   - "Cerrar sesión en los demás dispositivos";
   - "Cerrar sesión" revoca;
   - una cookie `session` vieja manda a `/login`;
   - 375 px.

   También ajustar las suites existentes, como `sesion-y-panel` (la cookie se llama `acceso`).
7. **Documentación.** El README suma:
   - la sesión, las variables nuevas y cómo generar y rotar llaves;
   - el JWKS, la renovación y la revocación;
   - `sesiones.json`;
   - la hoja de ruta: 11 en verificación y 12 (hoja técnica) pendiente.

---

## Criterios de aceptación

- [ ] Sin `AUTH_PRIVATE_KEY` o `AUTH_KEY_ID` válidas, el servidor no arranca y el error dice qué variable falta. `pnpm generar-llaves` imprime unas que funcionan.
- [ ] `GET /.well-known/jwks.json` responde sin sesión con la llave actual (`kid`, `alg: "RS256"`, `use: "sig"`, `n`, `e`), sin `d`, `p`, `q` ni otra parte privada. Con `AUTH_PUBLIC_KEY_ANTERIOR`, publica también la anterior con su `kid`.
- [ ] Al iniciar sesión (correo, Google o registro) quedan dos cookies:
  - `acceso`: `httpOnly`, `sameSite: lax`, `path /`;
  - `renovacion`: `httpOnly`, `sameSite: strict`, `path /api/auth`.

  Ninguna se lee desde `document.cookie`. La sesión queda en `sesiones.json`.
- [ ] El token de acceso trae `alg: RS256`, el `kid`, `aud: "tienda"`, `iss`, `sub`, `sid`, `idCliente`, `estado` y vence en 15 minutos. Se verifica con `jose` usando solo `/.well-known/jwks.json`.
- [ ] Un token firmado con otra llave, con otro `kid` desconocido, con `aud` distinta o con `alg: HS256` se rechaza.
- [ ] Con el token de acceso vencido:
  - navegar a una página del panel la muestra sin pedir login, porque el middleware renueva y regresa;
  - una llamada a la API responde bien tras una sola renovación.

  En los dos casos el `jti` de la sesión cambió.
- [ ] Presentar un token de renovación ya rotado responde 401, la sesión queda revocada con motivo `reuso` y ese navegador tiene que iniciar sesión otra vez.
- [ ] "Cerrar sesión" revoca la sesión (`logout`). Reusar ese token de acceso contra la API responde 401 `SESION_REVOCADA`, aunque no hayan pasado 15 minutos.
- [ ] Para cambiar la contraseña de una cuenta que ya tiene una se pide la actual; si es incorrecta, responde 422 en su campo y no cambia. Una cuenta de Google sin contraseña la crea sin pedirla.
- [ ] Al cambiar la contraseña, la sesión de otro navegador del mismo usuario deja de funcionar (401 / `/login`) y la actual sigue. La tarjeta dice "Cerramos tus otras sesiones".
- [ ] "Cerrar sesión en los demás dispositivos" cierra las demás sesiones, conserva la actual y dice cuántas cerró.
- [ ] Completar el perfil y verificar el WhatsApp siguen llevando al estado siguiente sin volver a iniciar sesión; el token de acceso nuevo es de la misma sesión.
- [ ] Una cookie `session` (HS256) de antes se borra y manda a `/login`, conservando `siguiente`.
- [ ] Las URLs firmadas de subida de archivos (SPEC 05) siguen funcionando con `AUTH_SECRET`.
- [ ] A 375 px no hay scroll horizontal en "Mi perfil" con la tarjeta de contraseña y el botón de sesiones.
- [ ] `pnpm lint`, `pnpm test`, `pnpm test:e2e` y `pnpm build` pasan.

---

## Decisiones

- **Sí:** `RS256` (decisión del usuario). Es el primero que menciona KARSO y funciona en el runtime edge del middleware sin depender del soporte de Ed25519.
- **Sí:** la llave en variables de entorno, con un script para generarla (decisión del usuario). El middleware corre en edge y no puede leer archivos. En el backend vivirá en el gestor de secretos de Railway.
- **Sí:** una llave pública anterior opcional en el JWKS, para mostrar la rotación por `kid` sin cerrar sesiones de golpe.
- **Sí:** los dos tokens en cookies `httpOnly` (decisión del usuario). El de renovación, con `path /api/auth` y `sameSite: strict`, solo viaja a renovar o cerrar sesión.
- **No:** el token de acceso en memoria con el encabezado `Authorization`. El middleware y las páginas del servidor no lo verían.
- **Sí:** el registro de sesiones y la revisión del `sid` en cada ruta de la API (decisión del usuario). Revocar corta de inmediato; el middleware, que no puede leer el registro, solo enruta, y los datos los piden rutas que sí revisan.
- **Sí:** detectar el reúso del token de renovación y revocar la sesión (decisión del usuario), como recomienda OWASP para la rotación.
- **Sí:** el token de renovación es un JWT firmado con `jti` (decisión del usuario). El registro guarda el `jti` vigente.
- **Sí:** "Cerrar sesión" revoca la actual; cambiar la contraseña y "Cerrar sesión en los demás dispositivos" revocan las demás (decisión del usuario).
- **No:** una lista de sesiones activas por ahora.
- **Sí:** pedir la contraseña actual para cambiarla (decisión del usuario; cierra el riesgo anotado en la SPEC 10). Una cuenta de Google sin contraseña la crea sin ella.
- **Sí:** no conservar las sesiones abiertas ni migrar el HS256 (decisión del usuario). El siguiente paso es el backend, no la demo.
- **Sí:** `AUTH_ACCESO_SEGUNDOS` solo para acortar el token de acceso en e2e. Por omisión, 15 minutos.
- **Sí:** `AUTH_SECRET` se queda solo para las URLs de subida, que son otra cosa (las hará R2 con su propia firma).
- **Sí:** la hoja técnica para el backend es la SPEC 12, solo de documentación (decisión del usuario).

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Bucle de redirección entre el middleware y la renovación | El middleware solo manda a renovar si la cookie `acceso` existe con la firma válida y vencida. Si renovar falla, se borran las dos cookies y ya no hay a dónde volver. |
| Dos pestañas renuevan a la vez y la segunda parece reúso | `apiFetch` junta las renovaciones de la misma pestaña. Entre pestañas, se acepta el `jti` anterior durante 10 segundos tras rotar (periodo de gracia) sin revocar. Queda en un test. |
| La llave privada se filtra en el JWKS o en un log | El JWKS se arma con una lista blanca de campos públicos, con un test que lo revisa, y la llave nunca se imprime. |
| Sesiones abiertas se cierran al desplegar | Aceptado (decisión del usuario): la cookie vieja manda a `/login` con `siguiente`. |
| `sesiones.json` crece sin límite | Se limpian las vencidas o revocadas hace más de 7 días al escribir. En el backend será una colección con índice TTL. |
| El middleware deja ver una página del panel hasta 15 minutos después de revocar | Las páginas no tienen datos propios: los piden a la API, que responde 401 `SESION_REVOCADA` y manda a `/login`. |

---

## Lo que **no** está en este spec

- La audiencia `admin`, los empleados y el panel.
- La API para socios (KARSO 2.1 c), el cifrado por campo y la restricción por IP.
- La lista de sesiones activas.
- La rotación automática de llaves.
- La hoja técnica para el backend (SPEC 12).
