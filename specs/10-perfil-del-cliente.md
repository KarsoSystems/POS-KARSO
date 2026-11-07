# SPEC 10 — Perfil del cliente

> **Estado:** Approved
> **Depende de:** SPEC 01, SPEC 06
> **Fecha:** 2026-11-07
> **Objetivo:** Que el cliente, en "Mi perfil", vea sus datos y edite por separado su teléfono (verificado por WhatsApp), su dirección y, si es socio, el nombre de su negocio, sus datos fiscales y su contraseña, sin poder cambiar su nombre ni su correo (KARSO 5.1 y 6.1).

---

## Por qué existe este spec

KARSO 5.1 define dos tipos de cliente en línea:

- **Ocasional:** nombres, apellidos, teléfono, correo y contraseña; dirección opcional.
- **Socio:** lo mismo, más dirección y nombre del negocio, obligatorios.

En el perfil se editan teléfono, dirección, nombre del negocio (socios), datos fiscales y contraseña. **Nombre y correo no se editan.** KARSO 6.1 da la forma del usuario: `tipo`, `direccion` y `nombreNegocio`.

Hoy el usuario no tiene tipo, dirección ni nombre de negocio. Los datos fiscales solo se guardan desde el checkout (SPEC 06), y "Mi perfil" dice "Próximamente".

La descripción original incluía también la sesión con tokens de acceso y de renovación, llave asimétrica y JWKS (KARSO 2.1). **Se dividió** (decisión del usuario):

- **10 · Perfil del cliente** (este spec).
- **11 · Sesión con tokens y JWKS.**

**Decisiones del usuario** (2026-11-07):

1. El cliente elige si es **socio** en "Mi perfil" ("Soy socio, tengo un negocio"). Al marcarlo, la dirección y el nombre del negocio son obligatorios. Sin beneficios por ahora: solo se guarda `tipo: "socio"`.
2. Un **teléfono nuevo se verifica con código** por WhatsApp, como en el registro. El anterior sigue vigente hasta verificar el nuevo.
3. **Contraseña:** solo la nueva y su confirmación, sin pedir la actual. Una cuenta que solo entra con Google puede crear una.
4. **Dirección:** la forma de KARSO 6.1, la misma de las sucursales.
5. **Datos fiscales:** el formulario de la SPEC 06, con la opción de **borrarlos**. Los pedidos hechos conservan su copia.
6. **Página:** `/panel/perfil` con **tarjetas que se guardan por separado**.

---

## Alcance

**Entra:**

- **Datos:**
  - el usuario suma `tipo` (`"ocasional"` | `"socio"`), `direccion` y `nombreNegocio` (KARSO 6.1);
  - `users.json` pasa a la **versión 3** y **migra** las versiones 1 y 2, sin perder usuarios;
  - `verifications.json` pasa a la **versión 2**: cada código guarda el número al que se envió.
- **Página `/panel/perfil`**, con estas tarjetas:
  - **Datos personales** (solo lectura): número de cliente, nombre completo y correo, con la nota "El nombre y el correo no se pueden cambiar".
  - **Teléfono (WhatsApp):**
    - el número actual y "Cambiar";
    - al pedir el cambio se envía un código al número nuevo (aviso de demo y `[DEMO WHATSAPP]` en la consola);
    - el cliente lo escribe para confirmar; puede reenviarlo (cada 60 s) o cancelar;
    - mientras no lo confirme, el número actual sigue vigente.
  - **Dirección y negocio:**
    - la casilla "Soy socio (tengo un negocio)", el nombre del negocio y la dirección;
    - un socio debe llenar el nombre del negocio y la dirección completa;
    - un ocasional puede dejar la dirección vacía o llenarla completa.
  - **Datos fiscales:** el formulario de la SPEC 06 (RFC, razón social, régimen, uso del CFDI, código postal y correo, con las validaciones del SAT), con "Guardar" y "Borrar datos fiscales".
  - **Contraseña:**
    - nueva contraseña y confirmación, con las reglas del registro;
    - sin contraseña (cuenta de Google), la tarjeta dice "Crear contraseña" y, al guardarla, la cuenta también entra con correo y contraseña.
- **Interacción:**
  - cada tarjeta muestra su propio error y "Guardado" al terminar;
  - el resto de la app (nombre en el encabezado, datos precargados en el checkout) se actualiza sin recargar.
- **Navegación:** "Mi perfil" en el menú deja de decir "Próximamente".
- **Datos fiscales en el checkout:** sigue igual que en la SPEC 06 (precarga del perfil y "Guardar en mi perfil").
- Tests unitarios, de rutas y E2E, y el README.

**No entra:**

- Editar nombre, apellidos o correo.
- Beneficios de socio (precios, crédito) y la API para socios (KARSO 2.1 c).
- Sesión con tokens de acceso y renovación, llave asimétrica, JWKS, y cerrar las otras sesiones al cambiar la contraseña (SPEC 11).
- Recuperar la contraseña olvidada y verificar el correo.
- Borrar la cuenta.
- Cifrar por campo los datos personales y fiscales (KARSO 2.1 b: lo hará el backend).

---

## Modelo de datos

### Usuario (`src/server/domain/user.ts`, KARSO 6.1)

```ts
export type TipoCliente = "ocasional" | "socio";

export interface User {
  // … lo de antes
  tipo: TipoCliente; // "ocasional" al registrarse; el cliente lo cambia en su perfil
  direccion: Direccion | null; // obligatoria para socio; opcional para ocasional
  nombreNegocio: string | null; // obligatorio para socio; null para ocasional
}
```

- `Direccion` es la de `src/lib/sucursales/schema.ts`: `{ calle, colonia, ciudad, estado, codigoPostal }`. La calle lleva el número ("Av. Juárez 123"), como KARSO 6.1.
- El campo se sigue llamando `whatsapp` (KARSO lo llama `telefono`), porque es el número verificado por WhatsApp.
- Pasar de socio a ocasional deja `nombreNegocio: null` y conserva la dirección, que ya es opcional.
- **`users.json` versión 3:** las versiones 1 y 2 se migran al leer, con `tipo: "ocasional"`, `direccion: null` y `nombreNegocio: null`, con aviso en la consola. Lo que la versión 2 ya migraba de la 1 se conserva.

### Verificación del teléfono (`verifications.json` versión 2)

`WhatsappVerification` suma `whatsapp: string`, el número al que se envió el código. En el registro es el del usuario; en el perfil, el nuevo. Un archivo de la versión 1 se descarta: los códigos duran 10 minutos.

### Validación (`src/lib/validation/perfil.ts`)

- `direccionNegocioSchema`:
  - `{ tipo, nombreNegocio, direccion }`;
  - con `tipo: "socio"`, `nombreNegocio` (1–120 caracteres) y `direccion` son obligatorios;
  - la dirección pide todos sus campos y un código postal de 5 dígitos;
  - los errores van por campo (`nombreNegocio`, `direccion.calle`, …).
- `cambioTelefonoSchema`: `{ whatsapp }`, con el `whatsappSchema` del registro; debe ser distinto del actual.
- `contrasenaSchema`: `{ password, confirmacion }`, con el `passwordSchema` del registro; deben coincidir.
- Datos fiscales: el `datosFiscalesSchema` de la SPEC 06.

### API (sesión activa; errores `{ error: { code, message, fields? } }`)

| Método y ruta | Uso |
| --- | --- |
| `GET /api/auth/me` | Ya existe; ahora trae también `tipo`, `direccion` y `nombreNegocio` |
| `PUT /api/perfil/direccion` | `{ tipo, nombreNegocio, direccion }` → `{ user }`. 422 por campo |
| `PUT /api/perfil/datos-fiscales` | `{ datosFiscales }` → `{ user }`. 422 por campo (`datosFiscales.rfc`, …) |
| `DELETE /api/perfil/datos-fiscales` | Borra los datos fiscales → `{ user }` |
| `PUT /api/perfil/contrasena` | `{ password, confirmacion }` → `{ user }`. 422 por campo; sin contraseña previa, agrega `"password"` a `providers` |
| `POST /api/perfil/telefono` | `{ whatsapp }`: envía un código al número nuevo → `{ whatsappNuevo, demoCodigo? }`. 422 si es inválido o igual al actual |
| `POST /api/perfil/telefono/verificar` | `{ codigo }`: con el código correcto, `whatsapp` = el número nuevo → `{ user }`. Mismos errores que la verificación del registro: 422 `CODIGO_INCORRECTO` con los intentos restantes; 410 `CODIGO_EXPIRADO`, `CODIGO_AGOTADO` o `SIN_CODIGO` |
| `POST /api/perfil/telefono/reenviar` | Otro código al número nuevo; 429 `REENVIO_PRONTO` antes de 60 s; 410 `SIN_CODIGO` si no hay cambio en curso |
| `DELETE /api/perfil/telefono` | Cancela el cambio en curso |
| `GET /api/perfil/telefono` | El cambio en curso, si hay: `{ whatsappNuevo }` o `{ whatsappNuevo: null }` (para retomarlo al recargar) |

---

## Plan de implementación

1. **Datos.**
   - `tipo`, `direccion` y `nombreNegocio` en el usuario.
   - `users.json` versión 3, con migración de la 1 y la 2.
   - `verifications.json` versión 2 con `whatsapp`; el registro guarda su número.
   - Los esquemas de `src/lib/validation/perfil.ts`.
   - Tests de la migración y de los esquemas.
2. **Dirección, negocio y datos fiscales en el servidor.** Las rutas `PUT /api/perfil/direccion`, `PUT` y `DELETE /api/perfil/datos-fiscales`, con tests de rutas.
3. **Contraseña en el servidor.** `PUT /api/perfil/contrasena`, con tests:
   - cambia el hash y se entra con la nueva;
   - la anterior ya no sirve;
   - una cuenta de Google sin contraseña la crea y suma `"password"`.
4. **Teléfono en el servidor.**
   - Las rutas `POST`, `GET` y `DELETE /api/perfil/telefono`, `…/verificar` y `…/reenviar`, reutilizando `whatsapp-verification.ts`.
   - Tests:
     - el número anterior sigue hasta verificar;
     - un código incorrecto, expirado o agotado;
     - el reenvío antes de 60 s;
     - cancelar el cambio.
5. **Cliente HTTP y hooks.**
   - `src/lib/perfil-api.ts` y `src/hooks/use-perfil.ts`. Al guardar, actualizan la caché de la sesión (`/api/auth/me`), así que el encabezado y el checkout ven el cambio.
   - Las reglas de lint de hooks y clientes HTTP.
   - Tests.
6. **Página `/panel/perfil`.**
   - Las tarjetas: datos personales, teléfono, dirección y negocio, datos fiscales (reutiliza `formulario-datos-fiscales`) y contraseña.
   - "Mi perfil" sin "Próximamente".
   - Revisar a 375 px.
7. **E2E** (`e2e/perfil.spec.ts`):
   - el nombre y el correo son de solo lectura;
   - hacerse socio exige el negocio y la dirección;
   - los datos fiscales se guardan, aparecen precargados en el checkout y se borran;
   - cambiar la contraseña y entrar con la nueva;
   - una cuenta de Google crea su contraseña;
   - el teléfono cambia solo tras verificar, y con un código incorrecto sigue el anterior;
   - `users.json` v2 se migra;
   - 375 px.
8. **Documentación.** El README suma:
   - el perfil, el tipo de cliente y el cambio de teléfono;
   - las rutas nuevas;
   - `users.json` v3 y `verifications.json` v2;
   - la hoja de ruta: 10 en verificación y 11 (sesión) pendiente.

---

## Criterios de aceptación

- [ ] `/panel/perfil` muestra el número de cliente, el nombre completo y el correo sin campos editables, y la nota "El nombre y el correo no se pueden cambiar". "Mi perfil" en el menú ya no dice "Próximamente".
- [ ] Marcar "Soy socio" y guardar sin nombre de negocio o sin dirección completa muestra el error en cada campo y no guarda. Con todo lleno, guarda `tipo: "socio"`, `nombreNegocio` y `direccion`.
- [ ] Un ocasional guarda sin dirección (`direccion: null`) o con la dirección completa. Una dirección a medias o un código postal que no tiene 5 dígitos da error en ese campo.
- [ ] Pasar de socio a ocasional deja `nombreNegocio: null` y conserva la dirección.
- [ ] Los datos fiscales guardados en el perfil aparecen precargados al pedir factura en el borrador (SPEC 06). Un RFC inválido da error en su campo. "Borrar datos fiscales" deja `datosFiscales: null`, y un pedido hecho antes conserva su copia.
- [ ] Al cambiar la contraseña, la anterior ya no inicia sesión y la nueva sí. Si no coinciden o no cumplen las reglas del registro, se muestra el error en su campo.
- [ ] Una cuenta que solo entra con Google ve "Crear contraseña". Al guardarla puede iniciar sesión con correo y contraseña, y `providers` incluye `"google"` y `"password"`.
- [ ] Pedir el cambio de teléfono envía un código al número nuevo: aviso de demo y `[DEMO WHATSAPP] Código para +52…` con el número nuevo. Hasta verificar, el perfil y `/api/auth/me` siguen con el número anterior.
- [ ] Con el código correcto, el teléfono pasa a ser el nuevo. Con uno incorrecto se ven los intentos restantes y el teléfono no cambia. Un código expirado o agotado pide uno nuevo. "Reenviar" antes de 60 s responde 429, y "Cancelar" deja el número anterior sin cambio en curso.
- [ ] Pedir un número igual al actual o con formato inválido responde 422.
- [ ] Al recargar la página con un cambio de teléfono en curso, la tarjeta lo retoma y pide el código.
- [ ] Guardar una tarjeta no toca los datos de las demás, y su error no bloquea a las otras.
- [ ] El nombre del encabezado y los datos fiscales del checkout se actualizan sin recargar.
- [ ] Un `users.json` de versión 2 (o 1) se migra a la 3 sin perder usuarios: `tipo: "ocasional"`, `direccion: null` y `nombreNegocio: null`, y la sesión sigue funcionando.
- [ ] A 375 px no hay scroll horizontal en `/panel/perfil`, ni con el cambio de teléfono en curso.
- [ ] `pnpm lint`, `pnpm test`, `pnpm test:e2e` y `pnpm build` pasan.

---

## Decisiones

- **Sí:** dividir la descripción en perfil (10) y sesión con tokens y JWKS (11), por decisión del usuario. La sesión es infraestructura: toca el middleware, todas las rutas y el cliente HTTP.
- **Sí:** el cliente elige ser socio en su perfil, y eso hace obligatorios la dirección y el nombre del negocio (decisión del usuario; KARSO 5.1).
- **No:** elegirlo en el registro o que solo lo asigne el admin. El registro sigue igual.
- **Sí:** ser socio no da beneficios por ahora; solo se guarda el tipo. KARSO lo deja pendiente (sección 8); hay que hablarlo con el socio.
- **Sí:** un teléfono nuevo se verifica con código antes de reemplazar al anterior (decisión del usuario). Es el canal verificado de la cuenta y el de los avisos.
- **Sí:** el campo sigue llamándose `whatsapp`, aunque KARSO lo llama `telefono`. Renombrarlo tocaría todo el registro, y el backend puede mapearlo.
- **Sí:** la contraseña se cambia sin pedir la actual (decisión del usuario): la sesión activa basta en el demo. Con la SPEC 11 (revocación) conviene revisarlo.
- **Sí:** una cuenta de Google puede crear una contraseña y suma `"password"` a `providers`.
- **Sí:** la dirección tiene la forma de KARSO 6.1, la misma de las sucursales, con el número dentro de la calle.
- **Sí:** de socio a ocasional se borra `nombreNegocio` y se conserva la dirección, que para un ocasional es opcional.
- **Sí:** los datos fiscales se pueden borrar, y los pedidos hechos conservan su copia (decisión del usuario).
- **Sí:** tarjetas que se guardan por separado (decisión del usuario): un error en una no bloquea a las demás.
- **Sí:** `users.json` versión 3 **migrando** las anteriores, como en la SPEC 06, porque no se pueden perder usuarios. `verifications.json` versión 2 **descartando** la anterior, porque son códigos temporales.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Cambiar la contraseña sin pedir la actual: quien tome una sesión abierta puede cambiarla | Decisión del usuario. La SPEC 11 trae la revocación de sesiones; ahí conviene revisar si se pide la actual. |
| Que un número nuevo sin verificar quede como el de la cuenta | El número no cambia hasta verificar el código; el cambio en curso vive aparte, en `verifications.json`. |
| Perder usuarios al migrar `users.json` | Se migra (no se descarta), con tests de la versión 1 y la 2 y E2E con la sesión abierta. |
| Que el checkout pierda los datos fiscales precargados | El checkout sigue leyéndolos del usuario. Un E2E guarda en el perfil y revisa la precarga. |
| Que el código del registro y el del cambio de teléfono choquen | Una cuenta activa no tiene verificación de registro pendiente, y cada código guarda el número al que se envió. |

---

## Lo que **no** está en este spec

- Sesión con tokens de acceso y renovación, llave asimétrica, JWKS y revocación (SPEC 11).
- Editar nombre, apellidos o correo; verificar el correo; recuperar la contraseña.
- Beneficios de socio y la API para socios.
- Borrar la cuenta.
- Cifrado por campo (backend).
