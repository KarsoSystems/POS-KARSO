# SPEC 01 — Base del proyecto y autenticación (demo)

> **Estado:** Borrador
> **Depende de:** —
> **Fecha:** 2026-10-30
> **Objetivo:** Montar la base Next.js del portal de clientes de la imprenta con registro, login (correo o Google simulado), verificación de WhatsApp simulada y un panel protegido, persistiendo en JSON y embebible en un shell Tauri.

---

## Por qué existe este spec

El producto completo (perfil, pedidos con subpedidos, presupuesto, previsualización a escala, pago y envío) es demasiado grande para un solo spec. Se dividió en cinco:

1. **SPEC 01 (este)** — base del proyecto + autenticación + esqueleto del panel.
2. SPEC 02 — perfil: editar datos, direcciones e información de pago.
3. SPEC 03 — pedidos y subpedidos: imagen, tamaño, cantidad, presupuesto y estados.
4. SPEC 04 — previsualización a escala sobre el tabloide/mesa de impresión.
5. SPEC 05 — cerrar pedido, pago (simulado) y envío.

Este spec fija la arquitectura que heredan los demás. El front habla con el backend **solo vía HTTP** (`/api/*`). En el demo, ese backend son route handlers de Next que guardan en JSON. En preproducción/producción el mismo contrato lo sirve un backend real con MongoDB y un storage tipo S3. Cambiar de uno a otro debe ser cambiar una URL base, no reescribir el front.

---

## Alcance

**Entra:**

- Proyecto Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui, gestionado con pnpm.
- Validación de formularios con zod + react-hook-form, con los mismos esquemas en cliente y servidor.
- Registro con correo y contraseña: nombre, apellido paterno, apellido materno, WhatsApp, correo y contraseña.
- `idCliente` autogenerado y legible (`CLI-000001`).
- Login con correo y contraseña.
- Botón "Continuar con Google" **simulado**: un modal parecido al selector de cuenta de Google donde se escribe nombre y correo.
- Pantalla "Completa tu perfil" para usuarios de Google a los que les faltan datos obligatorios.
- Verificación de WhatsApp con código simulado de 6 dígitos (se muestra en la consola del servidor y en un aviso de demo en pantalla).
- Sesión con cookie httpOnly que contiene un JWT firmado (`jose`) y contraseñas hasheadas con `bcryptjs`.
- Middleware que protege `/panel` y enruta según el estado del usuario.
- Esqueleto de `/panel`: layout con menú lateral (Inicio, Mis pedidos, Mi perfil), saludo con nombre e `idCliente`, secciones "Próximamente" y botón de cerrar sesión.
- Persistencia demo en `data/*.json` detrás de una interfaz de repositorio intercambiable.
- Cliente HTTP del front con URL base configurable (`NEXT_PUBLIC_API_BASE_URL`).
- Shell mínimo de Tauri 2 en `/desktop` que carga la app desde una URL configurable.
- Tests: Vitest (unidad + route handlers) y Playwright (e2e).

**Fuera de alcance (specs futuros):**

- Recuperar contraseña ("olvidé mi contraseña").
- Verificación de correo (solo se verifica WhatsApp; el correo de Google se da por verificado).
- Envío real de códigos por WhatsApp o correo.
- OAuth real de Google (Auth.js o el del backend).
- Editar perfil, direcciones e información de pago → SPEC 02.
- Pedidos, subpedidos, subida de imágenes y presupuesto → SPEC 03.
- Previsualización a escala → SPEC 04.
- Pago y envío → SPEC 05.
- Backend real, MongoDB y storage S3 (preproducción/producción).
- Instaladores firmados (.dmg/.msi) y auto-update de Tauri.
- Roles de administrador o de punto de venta.

---

## Modelo de datos

```ts
// src/server/domain/user.ts
type AuthProvider = 'password' | 'google';

type EstadoCuenta =
  | 'perfil_incompleto'       // Google sin WhatsApp/apellidos
  | 'verificacion_pendiente'  // datos completos, WhatsApp sin verificar
  | 'activo';

interface User {
  id: string;                    // UUID v4; será el _id en Mongo
  idCliente: string;             // "CLI-000001", consecutivo, único, inmutable
  nombre: string;
  apellidoPaterno: string | null; // null solo mientras estado = perfil_incompleto
  apellidoMaterno: string | null;
  whatsapp: string | null;       // E.164 México: "+52" + 10 dígitos
  correo: string;                // en minúsculas, único
  passwordHash: string | null;   // null si solo entra con Google
  providers: AuthProvider[];
  whatsappVerificado: boolean;
  correoVerificado: boolean;     // true si entró con Google; false en registro por correo
  estado: EstadoCuenta;
  createdAt: string;             // ISO 8601
  updatedAt: string;
}

// Usuario expuesto al front (GET /api/auth/me): User sin passwordHash.
type PublicUser = Omit<User, 'passwordHash'>;
```

```ts
// src/server/domain/verification.ts
interface WhatsappVerification {
  userId: string;
  codigo: string;          // 6 dígitos
  expiresAt: string;       // creación + 10 min
  intentos: number;        // máx. 5; al llegar a 5 el código se invalida
  ultimoEnvio: string;     // para el cooldown de reenvío de 60 s
}
```

```ts
// Payload del JWT en la cookie "session"
interface SessionPayload {
  sub: string;             // User.id
  idCliente: string;
  estado: EstadoCuenta;    // el middleware enruta con esto sin leer el JSON
}
```

**Archivos de persistencia demo** (fuera de git, creados al arrancar si no existen):

```
data/users.json          // { "version": 1, "users": User[] }
data/counters.json       // { "version": 1, "idCliente": 0 }
data/verifications.json  // { "version": 1, "items": WhatsappVerification[] }
```

**Repositorios** (la interfaz es el contrato; en el futuro se agrega `MongoUserRepository`):

```ts
// src/server/repositories/types.ts
interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByCorreo(correo: string): Promise<User | null>;
  create(input: NewUser): Promise<User>;   // asigna id, idCliente y fechas
  update(id: string, patch: Partial<User>): Promise<User>;
}
interface VerificationRepository {
  upsert(v: WhatsappVerification): Promise<void>;
  findByUserId(userId: string): Promise<WhatsappVerification | null>;
  delete(userId: string): Promise<void>;
}
```

**Validaciones** (`src/lib/validation/auth.ts`, compartidas por cliente y servidor):

| Campo | Regla |
| --- | --- |
| nombre, apellidoPaterno, apellidoMaterno | obligatorios, 1–60 caracteres, recortados |
| whatsapp | obligatorio, 10 dígitos de México; se guarda como `+52XXXXXXXXXX` |
| correo | obligatorio, formato email, se guarda en minúsculas, único |
| password | mínimo 8 caracteres, al menos una letra y un número |

**Contrato de API** (`/api/auth/*`; todas responden JSON; los errores tienen la forma `{ error: { code, message, fields? } }`):

| Método y ruta | Uso | Resultado |
| --- | --- | --- |
| `POST /api/auth/registro` | registro con correo | crea usuario `verificacion_pendiente`, genera código, pone cookie |
| `POST /api/auth/login` | login con correo | pone cookie; 401 genérico si falla |
| `POST /api/auth/google-mock` | `{ nombre, correo }` | crea o vincula usuario `google`, pone cookie |
| `POST /api/auth/completar-perfil` | apellidos + WhatsApp | pasa a `verificacion_pendiente`, genera código |
| `POST /api/auth/verificar-whatsapp` | `{ codigo }` | pasa a `activo`, reemite cookie |
| `POST /api/auth/reenviar-codigo` | — | nuevo código; 429 si no han pasado 60 s |
| `POST /api/auth/logout` | — | borra cookie |
| `GET /api/auth/me` | — | `PublicUser` o 401 |

**Rutas de UI y enrutamiento del middleware:**

| Ruta | Acceso |
| --- | --- |
| `/` | redirige a `/panel` con sesión; a `/login` sin sesión |
| `/login`, `/registro` | sin sesión; con sesión redirige según estado |
| `/registro/completar` | solo `perfil_incompleto` |
| `/registro/verificar` | solo `verificacion_pendiente` |
| `/panel/**` | solo `activo`; los demás estados se mandan a su pantalla |

---

## Plan de implementación

1. **Andamiaje.** `pnpm create next-app` (App Router, TS, Tailwind, ESLint, `src/`), inicializar shadcn/ui y agregar `.gitignore` con `data/` y `.env.local`. Crear `.env.example` con `AUTH_SECRET` y `NEXT_PUBLIC_API_BASE_URL`. Verificación: `pnpm dev` muestra la página por defecto.
2. **Tests listos.** Configurar Vitest y Playwright con un test trivial cada uno. Scripts `test`, `test:e2e`. Verificación: ambos pasan.
3. **Esquemas de validación.** `src/lib/validation/auth.ts` con zod (registro, login, google-mock, completar-perfil, verificar) y normalización de WhatsApp/correo. Tests unitarios de cada regla de la tabla.
4. **Almacén JSON.** `src/server/storage/json-store.ts`: lee y escribe un archivo con escritura atómica (tmp + rename) y un mutex en proceso por archivo. Crea el archivo con su estructura `version: 1` si falta. Tests con un directorio temporal.
5. **Repositorios JSON.** `src/server/repositories/json-user-repository.ts` y `json-verification-repository.ts` implementan las interfaces. `create` asigna `idCliente` incrementando `counters.json`. `src/server/repositories/index.ts` exporta las instancias. Tests: dos `create` producen `CLI-000001` y `CLI-000002`; un correo duplicado falla.
6. **Sesión.** `src/server/auth/session.ts`: firmar/verificar JWT HS256 con `jose` y `AUTH_SECRET`. Cookie `session` httpOnly, `sameSite=lax`, 7 días, `secure` solo en producción. Helpers `setSession`, `clearSession`, `getSession`. `src/server/auth/password.ts` con bcryptjs (coste 10). Tests unitarios.
7. **Registro, login, logout y me.** Route handlers bajo `src/app/api/auth/*`. El registro genera el código de verificación (paso 9 lo consume) y lo escribe en consola con el prefijo `[DEMO WHATSAPP]`. Tests de los route handlers: éxito, correo duplicado (409), validación (422), login incorrecto (401 con mensaje genérico).
8. **Cliente HTTP del front.** `src/lib/api-client.ts`: `fetch` con `credentials: 'include'`, base `NEXT_PUBLIC_API_BASE_URL` (vacía = mismo origen) y errores tipados según la forma `{ error }`. `src/lib/auth-api.ts` con una función por endpoint.
9. **Pantallas de login y registro.** `src/app/(auth)/login/page.tsx` y `registro/page.tsx` con react-hook-form + zod, errores por campo y estado de carga en el botón. Al registrarse redirige a `/registro/verificar`.
10. **Verificación de WhatsApp.** Endpoints `verificar-whatsapp` y `reenviar-codigo` (10 min de vigencia, 5 intentos, 60 s de cooldown). Página `/registro/verificar` con input de 6 dígitos, botón de reenvío con cuenta regresiva y un aviso amarillo "Modo demo: tu código es 123456". El código llega en la respuesta solo si `NODE_ENV !== 'production'`. Al verificar se reemite la cookie con `estado: 'activo'` y se redirige a `/panel`.
11. **Google simulado.** Endpoint `google-mock`. Si el correo no existe, crea el usuario (`providers: ['google']`, `correoVerificado: true`, `estado: 'perfil_incompleto'`). Si existe, inicia sesión y agrega `'google'` a `providers` cuando falte. Componente `GoogleMockDialog` con aviso "Simulación de Google" en el login y el registro. Página `/registro/completar` con nombre precargado, apellidos y WhatsApp. Al enviar pasa a verificación.
12. **Middleware.** `src/middleware.ts` lee el JWT de la cookie y aplica la tabla de enrutamiento. Una cookie inválida o expirada se trata como "sin sesión".
13. **Esqueleto del panel.** `src/app/panel/layout.tsx` con menú lateral (Inicio, Mis pedidos, Mi perfil; los dos últimos con la insignia "Próximamente" y deshabilitados) y una barra superior con el nombre y el botón "Cerrar sesión". `src/app/panel/page.tsx` saluda "Hola, {nombre}" y muestra "Tu número de cliente: {idCliente}". Responsive: el menú se colapsa en un drawer por debajo de 768 px.
14. **E2E.** Tests de Playwright para los flujos de los criterios de aceptación, con `data/` apuntando a un directorio temporal vía `DATA_DIR`.
15. **Shell Tauri.** `desktop/` con Tauri 2 (`pnpm create tauri-app`, sin front propio). La ventana principal carga `APP_URL` (por defecto `http://localhost:3000`). `desktop/README.md` documenta los prerrequisitos (Rust, toolchain del SO) y el comando `pnpm tauri dev`. Verificación manual: login y navegación al panel dentro de la ventana.
16. **README raíz.** Cómo arrancar el demo, las variables de entorno, dónde quedan los datos (`data/`), cómo reiniciarlos (borrar `data/`) y la tabla de specs futuros.

---

## Criterios de aceptación

- [ ] `pnpm install && pnpm dev` arranca sin errores con solo copiar `.env.example` a `.env.local`.
- [ ] `pnpm test` y `pnpm test:e2e` pasan.
- [ ] Al registrar un usuario válido se crea una entrada en `data/users.json` con `idCliente` `CLI-000001` (primer usuario) y `estado: "verificacion_pendiente"`.
- [ ] `passwordHash` empieza con `$2` y en ningún archivo de `data/` aparece la contraseña en texto plano.
- [ ] Registrar un correo existente (aunque cambien las mayúsculas) muestra "Este correo ya está registrado" en el campo correo.
- [ ] Un WhatsApp con distinto de 10 dígitos o una contraseña sin número muestran error en su campo y no llaman a la API.
- [ ] Tras el registro se llega a `/registro/verificar` y el código aparece en la consola del servidor con el prefijo `[DEMO WHATSAPP]` y en el aviso de demo.
- [ ] Un código incorrecto muestra "Código incorrecto"; el 5.º intento fallido invalida el código y obliga a reenviar.
- [ ] Reenviar antes de 60 s está deshabilitado en la UI y la API responde 429.
- [ ] Un código correcto lleva a `/panel`, que muestra "Hola, {nombre}" y el `idCliente`.
- [ ] Un login con contraseña incorrecta o un correo inexistente muestra el mismo mensaje: "Correo o contraseña incorrectos".
- [ ] "Continuar con Google" con un correo nuevo lleva a `/registro/completar` con el nombre precargado; al completar y verificar se llega a `/panel`.
- [ ] "Continuar con Google" con el correo de una cuenta ya registrada por contraseña inicia sesión en esa misma cuenta (mismo `idCliente`) y agrega `google` a `providers`.
- [ ] Visitar `/panel` sin sesión redirige a `/login`.
- [ ] Visitar `/panel` con estado `perfil_incompleto` o `verificacion_pendiente` redirige a `/registro/completar` o `/registro/verificar` respectivamente.
- [ ] Con sesión activa, visitar `/login` redirige a `/panel`.
- [ ] La cookie `session` es `HttpOnly` y no es legible desde `document.cookie`.
- [ ] "Cerrar sesión" borra la cookie y redirige a `/login`; volver atrás no muestra el panel.
- [ ] "Mis pedidos" y "Mi perfil" aparecen en el menú, deshabilitados, con la insignia "Próximamente".
- [ ] A 375 px de ancho no hay scroll horizontal en login, registro, verificación ni panel.
- [ ] `pnpm tauri dev` en `desktop/` abre una ventana que carga la app y permite hacer login y llegar al panel.
- [ ] Ningún componente de `src/app` ni de `src/components` importa de `src/server` (solo usan `src/lib/api-client.ts`).

---

## Decisiones

- **Sí:** dividir el producto en 5 specs. Uno solo tocaba más de tres áreas y no cabía en una oración.
- **Sí:** route handlers de Next como backend del demo. El front solo habla HTTP, así que preproducción solo cambia `NEXT_PUBLIC_API_BASE_URL`.
- **No:** backend Express separado desde ya. Más trabajo sin beneficio para validar el concepto.
- **No:** persistencia solo en el navegador. No cumple "datos en JSON e imágenes en el directorio" y rompe el contrato HTTP.
- **Sí:** Tauri cargando una URL. Permite el servidor completo de Next (API, middleware, cookies).
- **No:** export estático de Next dentro de Tauri. Elimina las rutas de API y el middleware.
- **Sí:** repositorios detrás de interfaces. Agregar `MongoUserRepository` no toca los route handlers.
- **Sí:** `id` UUID interno + `idCliente` legible `CLI-000001`. El UUID será el `_id`; el `idCliente` se puede dictar en mostrador o por WhatsApp.
- **No:** que el usuario capture su `idCliente`. Evita colisiones y errores de captura.
- **Sí:** bcryptjs + JWT en una cookie httpOnly, incluso en el demo. Cuesta lo mismo que hacerlo mal y no hay que reescribirlo.
- **No:** contraseña en texto plano o sesión en localStorage. Se tendría que tirar.
- **Sí:** `estado` dentro del JWT. El middleware (edge) enruta sin leer el JSON; se reemite la cookie en cada cambio de estado.
- **Sí:** todos los campos obligatorios, WhatsApp solo de México (10 dígitos → `+52`).
- **No:** selector de lada internacional. La clientela es local; se reconsidera si aparece la necesidad.
- **Sí:** Google simulado con un modal que pide nombre y correo. Prueba los caminos "usuario nuevo" y "usuario existente".
- **Sí:** vincular automáticamente Google a una cuenta existente con el mismo correo. En el demo no hay riesgo; en producción el OAuth real garantiza la propiedad del correo.
- **Sí:** pantalla "Completa tu perfil" bloqueante. El panel siempre tiene WhatsApp y apellidos, que pedidos y envíos van a necesitar.
- **Sí:** verificar solo WhatsApp, con código simulado. Es el canal principal del negocio; el correo de Google ya viene verificado.
- **No:** verificar el correo en este spec. Agrega pasos sin valor para el concepto.
- **Sí:** WhatsApp **no** único entre cuentas. Un mismo número puede atender varias cuentas (p. ej. un negocio familiar). Se revisa si genera problemas.
- **Sí:** shadcn/ui + Tailwind. Componentes accesibles sin un sistema de diseño pesado.
- **Sí:** Vitest + Playwright desde el primer spec. Los flujos de auth son la puerta de todo lo demás.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Escrituras concurrentes corrompen `data/*.json` | Escritura atómica (tmp + rename) y mutex en proceso por archivo. Suficiente para un solo proceso de demo. |
| Cookies dentro del webview de Tauri (WKWebView en macOS) | La cookie es first-party del origen cargado y `secure` está apagado en desarrollo. El criterio de Tauri lo verifica. |
| El código demo visible llega a producción | El código solo se incluye en la respuesta si `NODE_ENV !== 'production'`; un test lo cubre. |
| El esquema JSON cambia en specs siguientes | Cada archivo lleva `version: 1`; los repositorios fallan explícitamente ante una versión desconocida. |
| `AUTH_SECRET` vacío o débil | El servidor no arranca si falta o tiene menos de 32 caracteres. |
| Diferencias al migrar a Mongo | El modelo ya usa `id` string + `idCliente` único y correo en minúsculas, mapeables a índices únicos de Mongo. |

---

## Lo que **no** está en este spec

- Recuperar contraseña.
- Verificación de correo y envío real de códigos.
- OAuth real de Google.
- Editar perfil, direcciones y pago (SPEC 02).
- Pedidos, subpedidos, imágenes y presupuesto (SPEC 03).
- Previsualización a escala (SPEC 04).
- Pago y envío (SPEC 05).
- Backend real, MongoDB y S3.
- Instaladores y auto-update de Tauri.

Cada uno de estos, si llega, va en su propio spec.
