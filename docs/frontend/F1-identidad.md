# F1 — Identidad en el frontend

| Campo | Valor |
|---|---|
| **Módulo** | F1 |
| **Requiere en el backend** | M1 (Identidad) en staging |
| **Requiere en el frontend** | F0 |
| **Tamaño** | L |
| **Estado** | Propuesta |

---

## 1. Objetivo y alcance

Que cada familiar entre a Seniory con su propia cuenta y que «Hola, Andrea» y «Doña Carmen, 78 años» salgan de la sesión real, no de `familia.json`.

**Entra**
- Pantallas de registro, inicio de sesión, alta del adulto mayor, consentimiento de datos de salud y política de tratamiento de datos.
- Manejo de la sesión en Next: cookies, renovación del token en `proxy.ts`, verificación en el servidor y cierre de sesión.
- Protección de `/app/*`.
- Adaptador `api` de `paciente.ts` para `obtenerFamiliar()` y `obtenerAdultoMayor()`.
- Tipos generados desde el OpenAPI del backend.

**No entra**
- `obtenerCuidadorEnTurno()` sigue leyendo `data/` hasta F4 (depende de Reservas).
- Recuperar contraseña y verificar correo (dependen del canal de correo, M5).
- Invitar a otros familiares.

---

## 2. Relación con el backend

| Backend (M1) | Uso en F1 |
|---|---|
| `POST /auth/registro`, `/auth/login`, `/auth/refresh`, `/auth/logout` | Acciones de servidor y `proxy.ts`. |
| `POST /auth/olvide-contrasena`, `POST /auth/restablecer-contrasena` | Pantallas «Olvidé mi contraseña» (pide el correo y siempre muestra «si hay una cuenta, te enviamos un enlace») y `/restablecer-contrasena?token=…`. Si responde 503, la pantalla dice que no está disponible por ahora. |
| `PATCH /yo/contrasena` | Pantalla «Cambiar contraseña» en el perfil; la respuesta trae las cookies nuevas y el BFF debe reenviarlas. |
| `GET /yo` | `verificarSesion()` y `paciente.ts`. |
| `POST /adultos-mayores`, `POST /adultos-mayores/:id/consentimientos` | Pantallas de bienvenida. |
| Errores 400 (por campo), 401 (genérico), 409 (correo registrado), 429 (demasiados intentos) | Mensajes en los formularios. |

---

## 3. Definición de preparado

- [ ] F0 terminado.
- [ ] M1 desplegado en staging, con OpenAPI disponible.
- [ ] Ajustes de M1 de la sección 4.3 incluidos en el backend.
- [ ] **Textos v1** de la política de tratamiento de datos y del consentimiento de salud, escritos en lenguaje sencillo.
- [ ] **Textos legales** (política de tratamiento y consentimiento) con una primera versión revisada por asesoría legal, porque esta vez se publican a usuarios reales.

---

## 4. Diseño

### 4.1 Rutas nuevas

| Ruta | Acceso | Contenido |
|---|---|---|
| `/ingresar` | Solo sin sesión | Correo, contraseña (con botón para mostrarla), «Ingresar», enlace a «Crear cuenta». |
| `/registro` | Solo sin sesión | Nombre, correo, teléfono opcional, contraseña (mínimo 10 caracteres), aceptación de la política con enlace, «Crear cuenta». |
| `/bienvenida/persona` | Con sesión | «¿A quién vas a cuidar?»: nombre, fecha de nacimiento, parentesco (chips: Hijo o hija, Nieto o nieta, Cónyuge, Hermano o hermana, Otro). |
| `/bienvenida/consentimiento` | Con sesión | Por qué se pide (en una frase), el texto v1 del consentimiento, quién acepta y «Autorizo». |
| `/privacidad` | Pública | Política de tratamiento de datos v1. |

Las rutas de cuenta van en un grupo `app/(cuenta)/` con un layout propio sencillo (logo y contenido centrado). La bienvenida **no** va dentro de `/app` porque el layout de `/app` consulta datos de teleasistencia, que no existen hasta tener persona y consentimiento.

**Después de iniciar sesión o registrarse:**
1. Sin adulto mayor vinculado → `/bienvenida/persona`.
2. Sin consentimiento de salud vigente → `/bienvenida/consentimiento`.
3. Si no → `volver` (si es una ruta interna válida) o `/app`.

`AppHeader` agrega «Cerrar sesión» (un formulario con la acción `cerrarSesion`).

### 4.2 Sesión

**Cookies en el dominio del frontend** (las escribe Next, no el navegador):

| Cookie | Duración | Opciones |
|---|---|---|
| `seniory_acceso` | 15 min | `HttpOnly`, `Secure` fuera de local, `SameSite=Lax`, `Path=/` |
| `seniory_refresco` | 30 días | Igual |

**Módulo `lib/sesion/` (server-only)**

```ts
// Copia los tokens que devuelve el backend (encabezados Set-Cookie) a las cookies de Next.
// Solo se puede usar en acciones de servidor o route handlers (restricción de Next 16).
export async function guardarSesion(respuestaDelBackend: Response): Promise<void>;
export async function borrarSesion(): Promise<void>;

// Lo usa el cliente HTTP para autenticar cada petición.
export async function tokenDeAcceso(): Promise<string | null>;

// Verificación real, memorizada durante un render con cache() de React.
// Llama a GET /yo; si responde 401, redirect('/ingresar').
export const verificarSesion: () => Promise<PerfilPropio>;
```

**Renovación en `proxy.ts`** (solo con `SENIORY_FUENTE_DATOS=api`):

1. Si la ruta es de invitado (`/ingresar`, `/registro`) y hay cookie de refresco → redirigir a `/app`.
2. Si la ruta es protegida (`/app/*`, `/bienvenida/*`) y no hay ninguna cookie → redirigir a `/ingresar?volver=<ruta>`.
3. Si la cookie de acceso falta o vence en menos de 60 s (se lee el `exp` del JWT **sin verificar la firma**: es una comprobación optimista) y hay cookie de refresco:
   - llamar a `POST /auth/refresh` con la cookie de refresco y los encabezados del BFF;
   - si responde bien, escribir las cookies nuevas en la **respuesta** (para el navegador) y en la **petición que continúa** (para que los componentes de servidor de esta misma navegación usen el token nuevo);
   - si responde 401, borrar las cookies y redirigir a `/ingresar`.
4. Si no, continuar.

El proxy nunca decide permisos: solo redirige rápido. La verificación real la hacen `verificarSesion()` y el backend en cada petición.

### 4.3 Ajustes necesarios en el backend (M1)

| Ajuste | Por qué |
|---|---|
| **Ventana de gracia de 30 s** para un token de refresco recién reemplazado: si se presenta de nuevo dentro de ese plazo, se emite otro par nuevo de la misma familia en lugar de revocarla. | Al vencer el acceso, varias peticiones simultáneas (navegación y *prefetch*) pueden renovar a la vez con el mismo token. Sin la ventana, la detección de reutilización cerraría la sesión del usuario legítimo. Pasados 30 s, la reutilización sí revoca la familia. |
| **Verificación de `Origin` solo cuando viene el encabezado.** | Las llamadas del BFF son de servidor a servidor y no llevan `Origin`. Los navegadores sí lo envían en peticiones `POST` entre sitios, que es el caso de CSRF. |
| **Límite por IP con `X-Cliente-IP`** si `X-Seniory-BFF` es válido. | Ver [F0 §4.6](./F0-base-de-integracion.md). |

### 4.4 Acciones de servidor (`lib/acciones/cuenta.ts`)

| Acción | Entrada | Errores esperados que devuelve |
|---|---|---|
| `registrarse` | `FormData` del registro | Campos inválidos; «Ya existe una cuenta con ese correo. ¿Quieres ingresar?» (409) |
| `iniciarSesion` | `FormData` del inicio de sesión + `volver` | «Correo o contraseña incorrectos» (401, sin distinguir la causa); «Hiciste demasiados intentos. Espera unos minutos e inténtalo de nuevo» (429) |
| `cerrarSesion` | — | Nunca falla para el usuario: si el backend no responde, igual borra las cookies. |
| `registrarAdultoMayor` | `FormData` de la persona | Campos inválidos |
| `otorgarConsentimiento` | `FormData` del consentimiento | «Ya hay una autorización vigente» (409 → continúa a `/app`) |

Todas usan la firma de `useActionState` (`(estadoPrevio, formData)`), validan en el servidor con las mismas reglas del DTO del backend (para responder rápido) y dejan que el backend tenga la última palabra.

El parámetro `volver` solo se acepta si empieza por `/` y no por `//` (evita redirecciones a otros sitios).

### 4.5 Datos

| Servicio | Adaptador `api` |
|---|---|
| `obtenerFamiliar()` | `verificarSesion()` → `{ id, nombre, foto: '', adultoMayorId }` (el adulto mayor responsable). |
| `obtenerAdultoMayor()` | El adulto mayor responsable de `/yo` → `{ id, nombre, edad, foto }`. |
| `obtenerCuidadorEnTurno()` | Sigue leyendo `data/` hasta F4. |

**Tipos.** Script `npm run api:tipos`: genera `lib/api/esquema.d.ts` con `openapi-typescript` desde el OpenAPI del backend (`SENIORY_API_URL` + ruta de la documentación). El archivo generado se versiona; la CI avisa si no coincide con el backend.

**Estado mixto en staging.** Mientras los demás módulos no estén conectados, un usuario nuevo verá en esas secciones los datos de ejemplo de `data/` (cuidadores, teleasistencia). Por eso **staging es solo para el equipo** hasta terminar F8, y no se publica a usuarios reales. Cada módulo F elimina el JSON que reemplaza, así que la mezcla desaparece sola.

### 4.6 Accesibilidad de las pantallas nuevas (E5)

- Etiquetas visibles en cada campo (sin depender del `placeholder`).
- Texto ≥ 18 px y botones de 48 px de alto; un solo botón principal por pantalla.
- Errores junto al campo con `aria-describedby` y un resumen con `role="alert"`.
- `autocomplete`: `name`, `email`, `tel`, `current-password`, `new-password`.
- Botón «Mostrar contraseña» con `aria-pressed`.
- Sin límites de tiempo ni CAPTCHA.
- Funcionan con el alto contraste, el tamaño de texto y el teclado, como el resto de la app.
- El consentimiento en frases cortas: qué datos, para qué, quién los ve y cómo revocarlo.

---

## 5. Seguridad

| Riesgo | Control |
|---|---|
| Robo de tokens desde JavaScript | Cookies `HttpOnly`; los tokens nunca llegan a componentes cliente. |
| CSRF en acciones | Next solo acepta `POST` y compara `Origin` con `Host`; cookies `SameSite=Lax`. |
| Redirección abierta con `volver` | Solo rutas internas. |
| Enumeración de cuentas | Mismo mensaje para correo inexistente y contraseña errónea. |
| Confiar en el proxy | El proxy solo redirige; los datos siempre se piden con el token al backend, que decide. |
| Sesión cerrada por renovaciones simultáneas | Ventana de gracia de 30 s en el backend (§4.3). |
| Datos de la sesión en el navegador | Solo se pasan a componentes cliente los campos que la pantalla muestra (nombre, no correo ni IDs internos). |

---

## 6. Pruebas

| Tipo | Prueba |
|---|---|
| Unitaria | Validación de `volver`: acepta `/app/cuidadores`; rechaza `//otro.com`, `https://otro.com` y vacío. |
| Unitaria | Lectura del `exp` del JWT: token vigente, vencido, a 30 s de vencer y mal formado (se trata como vencido). |
| Unitaria | `guardarSesion`: toma los valores de los `Set-Cookie` del backend y escribe las cookies con las opciones de Next. |
| Unitaria | Acciones: errores por campo, 401 con mensaje genérico, 409 y 429 con su mensaje. |
| Componente | Formulario de inicio de sesión: muestra el resumen de errores con `role="alert"` y deshabilita el botón mientras envía. |
| Recorrido (Playwright, `api` contra el backend local) | Registro → persona → consentimiento → `/app` muestra «Hola, <nombre>» → cerrar sesión → `/app` redirige a `/ingresar`. |
| Recorrido | Inicio de sesión con contraseña errónea muestra el mensaje genérico; con la correcta vuelve a la ruta de `volver`. |
| Recorrido | Con la cookie de acceso vencida (reloj adelantado o cookie borrada), navegar a `/app` renueva la sesión sin pedir de nuevo la contraseña. |
| Recorrido | El recorrido principal de F0 sigue pasando, ahora iniciando sesión primero con un usuario de prueba de staging. |

---

## 7. Pull requests

| PR | Contenido |
|---|---|
| 1 | `lib/sesion/`, renovación y redirecciones en `proxy.ts`, cookie de acceso en el cliente HTTP, con pruebas unitarias. |
| 2 | Tipos generados (`api:tipos`) y adaptador `api` de `paciente.ts`. |
| 3 | `/ingresar` y `/registro` con sus acciones y pruebas de componente. |
| 4 | `/bienvenida/persona`, `/bienvenida/consentimiento` y `/privacidad`. |
| 5 | «Cerrar sesión» en `AppHeader` y recorridos de Playwright contra el backend local. |

---

## 8. Definición de terminado de F1

Además de la [definición común](../PLAN_FRONTEND_SENIORY.md):

- [ ] En staging (modo `api`): registro → persona → consentimiento → `/app` con el nombre real del familiar y del adulto mayor.
- [ ] Sin sesión, `/app/*` redirige a `/ingresar`; con sesión, `/ingresar` redirige a `/app`.
- [ ] La sesión se renueva sola durante 30 días de uso sin pedir la contraseña, y sin cerrarse por renovaciones simultáneas.
- [ ] Ningún token es visible desde JavaScript del navegador (verificado en las herramientas de desarrollo).
- [ ] Lighthouse Accesibilidad ≥ 90 en `/ingresar`, `/registro` y la bienvenida.
- [ ] El recorrido principal de Playwright sigue pasando.

---

## 9. Decisiones abiertas

| # | Decisión | Recomendación |
|---|---|---|
| 1 | Quién acepta el consentimiento | Pendiente de asesoría legal (M1, decisión 1). **Bloquea el lanzamiento a usuarios reales.** Mientras tanto, en desarrollo y staging, el familiar como representante. |
| 2 | Fecha de nacimiento: campo de fecha o tres listas (día, mes, año) | Tres listas: son más fáciles para personas con poca experiencia digital que el calendario del navegador. Validar en la prueba de usabilidad (E4). |
| 3 | Textos legales v1 | Los redacta el equipo; los revisa un abogado **antes de publicar a usuarios reales**. |
