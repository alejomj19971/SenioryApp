# SENIORY — Plan del frontend para conectarse al backend

> **Para quien implemente (equipo o Claude Code):** este plan describe cómo el frontend Next.js deja de leer los JSON de `frontend/data/` y pasa a usar el backend NestJS, **módulo por módulo**, al mismo ritmo que el [plan del backend](./PLAN_BACKEND_SENIORY.md). Cada módulo del frontend (F*n*) se construye cuando su módulo del backend (M*n*) está listo en staging.
> **Antes de escribir código en `frontend/`, lee `frontend/AGENTS.md`**: esta versión de Next.js (16.3.6) tiene cambios incompatibles con versiones anteriores. Las decisiones de este plan se basan en la documentación local de `frontend/node_modules/next/dist/docs/`.

| Campo | Valor |
|---|---|
| **Proyecto** | Seniory — *Creciendo y cuidando juntos* |
| **Fecha** | 2026-10-24 |
| **Estado** | Propuesta |
| **Base** | [ADR-01](./ADR-01.md) §4.7 (las pantallas solo hablan con `lib/services`) · [ADR-02](./ADR-02.md) · [PLAN_BACKEND](./PLAN_BACKEND_SENIORY.md) · [PLAN_MVP](./PLAN_MVP_SENIORY.md) |
| **Planes detallados** | Uno por módulo en [docs/frontend/](./frontend/README.md) |

---

## 1. Objetivo y principios

**Objetivo:** construir el frontend de la **aplicación real** de Seniory, para producción y usuarios reales. El MVP del Rocket Pitch es el punto de partida: cada pantalla pasa a usar datos del backend **sin rediseñarla**, y se agrega lo que una aplicación real exige (cuentas, estados de carga y error honestos, textos legales) y se corrigen los hallazgos H1–H12 del [plan del backend §2.2](./PLAN_BACKEND_SENIORY.md). Ya no se mantiene una versión de demostración.

**Principios**

1. **Las pantallas no cambian de fuente de datos; cambia el servicio.** `lib/services/*` es el puerto (ADR-01 §4.7). Hoy lee JSON; cada módulo F lo reimplementa sobre la API y **borra el JSON que reemplaza**. Los componentes no se enteran.
2. **El navegador solo habla con Next.** Next actúa como *backend for frontend* (BFF): los componentes de servidor y las acciones de servidor llaman al backend de servidor a servidor. El navegador nunca ve la URL ni los tokens del backend.
3. **Leer en el servidor, escribir con acciones de servidor.** Es lo que recomienda Next 16: los componentes de servidor piden datos directamente a la fuente, y las mutaciones usan *Server Actions*, que traen protección CSRF y pueden escribir cookies.
4. **El backend decide los permisos; el frontend solo los refleja.** `proxy.ts` hace verificaciones *optimistas* (¿hay cookie de sesión?) para redirigir rápido; la verificación real ocurre en la API (Next lo advierte: el proxy no debe ser la única defensa).
5. **Nada de datos de prueba en producción.** Mientras un módulo no esté conectado, su servicio sigue leyendo `data/` (como hoy); al conectarlo se borra su JSON, y la carpeta `data/` desaparece al terminar F8. No hay un «modo demostración» permanente ni interruptor entre fuentes de datos. Hasta que todos los módulos estén conectados, el entorno de staging es solo para el equipo.
6. **Accesibilidad igual o mejor que el MVP** en toda pantalla nueva (E5): texto ≥ 18 px, objetivos de 48 × 48 px, contraste AA, errores anunciados a lectores de pantalla.

---

## 2. Arquitectura

### 2.1 Cómo viaja una petición

```
Navegador ──(HTML / RSC / Server Action, cookies de sesión)──▶ Next.js en Vercel
                                                                 │
           proxy.ts: ¿hay sesión? ¿hay que renovar el token? ────┤
                                                                 │
           Componente de servidor ─▶ lib/services (puerto, mapea DTO → tipos)
           Server Action ─────────▶ lib/acciones ─────────▶ lib/services
                                                                 │
                                          lib/api/cliente-servidor.ts (server-only)
                                          · reenvía la cookie de acceso
                                          · reenvía X-Request-Id y la IP del cliente
                                          · traduce problem+json a errores tipados
                                                                 │
                                                                 ▼
                                                   Backend NestJS /api/v1
```

Excepción prevista: los eventos en tiempo real (SSE) de Teleasistencia y Mensajería necesitan una conexión larga del navegador. Se resuelven en F6 (sección 6).

### 2.2 Capas dentro de `frontend/`

| Capa | Carpeta | Regla |
|---|---|---|
| Pantallas | `app/`, `components/` | Solo importan `lib/services` (lectura) y `lib/acciones` (escritura). Nunca `lib/api` ni `data/`. |
| Servicios (puertos) | `lib/services/*.ts` (`server-only`) | Firmas `async` estables y tipos de `lib/types.ts`. Llaman al cliente HTTP y **mapean** los DTOs del backend a esos tipos, así un cambio en la API no se propaga a los componentes. |
| Acciones | `lib/acciones/*.ts` (`'use server'`) | Mutaciones. Validan la entrada, llaman a los servicios, devuelven errores esperados **como valor** (no los lanzan) y revalidan la ruta. |
| Cliente HTTP | `lib/api/` (`server-only`) | Única pieza que conoce la URL del backend, las cookies y el formato `problem+json`. |
| Sesión | `lib/sesion/` (`server-only`) | Lee y escribe las cookies de sesión; `verificarSesion()` memorizada por render. |
| Proxy | `proxy.ts` (raíz de `frontend/`) | Verificación optimista de sesión y renovación del token de acceso. |

`server-only` hace que el build falle si un componente cliente importa por error un módulo de servidor (documentado en la guía *Data Security* de Next).

### 2.3 Sesión

| Tema | Decisión |
|---|---|
| Dónde viven las cookies | En el **dominio del frontend**. Las escribe Next en acciones de servidor a partir de lo que devuelve el backend. |
| Cookies | `seniory_acceso` (15 min) y `seniory_refresco` (30 días): `HttpOnly`, `Secure` fuera de local, `SameSite=Lax`, `Path=/`. |
| Renovación | En `proxy.ts`, cuando la cookie de acceso falta o venció y existe la de refresco: llama a `POST /auth/refresh`, escribe las cookies nuevas en la respuesta **y** en la petición que continúa, para que los componentes de servidor de esa misma petición ya usen el token nuevo. Los componentes de servidor no pueden escribir cookies (restricción de Next 16). |
| Peticiones simultáneas | Varias navegaciones o *prefetch* pueden intentar renovar a la vez con el mismo token de refresco. El backend acepta un token recién reemplazado durante una **ventana de gracia de 30 s** (ajuste a M1, ver [F1](./frontend/F1-identidad.md) §4.3) para no cerrar la sesión por error. |
| Verificación real | `verificarSesion()` en `lib/sesion` usa `GET /yo` del backend, memorizada con `cache` de React. Si responde 401, redirige a `/ingresar`. |
| Cierre de sesión | Acción de servidor: llama a `POST /auth/logout` y borra las cookies. |

### 2.4 Contrato entre el frontend y el backend

| Encabezado que envía Next | Para qué |
|---|---|
| `Cookie: seniory_acceso=…` | Autenticación (el backend ya la acepta). |
| `X-Request-Id` | Correlación de logs entre ambos lados. |
| `X-Cliente-IP` + `X-Seniory-BFF: <secreto>` | Todas las peticiones llegan al backend desde los servidores de Vercel. Sin esto, el límite por IP de M0 y M1 trataría a todos los usuarios como uno solo. El backend solo cree en `X-Cliente-IP` si el secreto compartido es correcto (ajuste a M0, ver [F0](./frontend/F0-base-de-integracion.md) §4.6). |

- **Tipos:** se generan desde el OpenAPI del backend con `openapi-typescript` (solo tipos, sin código en tiempo de ejecución) en `lib/api/esquema.d.ts`. Los adaptadores mapean esos DTOs a `lib/types.ts`, así un cambio en la API no se propaga a los componentes.
- **Errores:** el cliente convierte `problem+json` en `ErrorDeApi` con `estado`, `codigo`, `mensaje` y `errores` por campo.
- **Caché:** en Next 16 sin `cacheComponents`, `fetch` no se guarda en caché por defecto, y leer cookies vuelve dinámica la ruta. Toda la app autenticada es dinámica; no se agrega caché hasta medir.

---

## 3. Estándares

### 3.1 Datos y errores

| Situación | Cómo se maneja |
|---|---|
| Lectura en componente de servidor que recibe 401 | `redirect('/ingresar?volver=<ruta>')` |
| Lectura que recibe 404 (inexistente o ajeno) | `notFound()`; ya existe `app/not-found.tsx`. |
| Error inesperado (5xx, red) | Se lanza; lo captura un `error.tsx` del segmento con mensaje claro en español y botón de reintentar (E1). |
| Mutación con error esperado (400, 409, 422) | La acción devuelve `{ ok: false, mensaje, errores }`; el formulario lo muestra con `useActionState`. |
| Mutación exitosa | `revalidatePath` de las rutas afectadas y, si corresponde, `redirect`. |

### 3.2 Formularios

- `<form action={accion}>` con `useActionState`; el botón muestra el estado pendiente y se deshabilita.
- Validación en el servidor (la acción), además de los atributos HTML (`required`, `type="email"`, `minLength`).
- Errores junto a cada campo, enlazados con `aria-describedby`; un resumen con `role="alert"` al enviar.
- `autocomplete` correcto (`email`, `current-password`, `new-password`, `name`, `tel`).
- Mensajes en español de Colombia, sin jerga técnica.

### 3.3 Seguridad

- Nada de tokens en `localStorage` ni en componentes cliente.
- Variables del backend sin prefijo `NEXT_PUBLIC_` (solo existen en el servidor).
- Toda acción de servidor se trata como un endpoint público: valida su entrada y deja que el backend autorice.
- Redirecciones con parámetro `volver` solo hacia rutas internas (evita redirecciones abiertas).
- Los DTOs que llegan a componentes cliente llevan solo lo que la pantalla muestra (por ejemplo, sin teléfono del cuidador en la búsqueda, H1).

### 3.4 Configuración por variables de entorno

| Variable (solo servidor) | Ejemplo | Uso |
|---|---|---|
| `SENIORY_API_URL` | `http://localhost:3001/api/v1` | URL del backend. |
| `SENIORY_BFF_SECRETO` | secreto | Encabezado `X-Seniory-BFF`. |

Nada de interruptores entre «datos de prueba» y «datos reales»: un servicio o lee de `data/` (módulo pendiente) o llama a la API (módulo conectado), y la transición se hace módulo por módulo, borrando el JSON. En producción, la aplicación **no arranca** si falta una variable obligatoria.

### 3.5 Pruebas

| Tipo | Herramienta | Qué cubre |
|---|---|---|
| Unitarias | Vitest | Mapeadores DTO → tipos, cliente HTTP y traducción de errores, validaciones de acciones, `pricing.ts` con los vectores compartidos del backend (M3). |
| Componentes | Vitest + Testing Library | Formularios: errores, estado pendiente, accesibilidad básica. |
| Recorrido | Playwright | Los recorridos principales (buscar → perfil → contratar → teleasistencia). Primero sobre el estado actual, como red de seguridad mientras se reemplazan los servicios; desde F1, contra staging con un usuario de prueba propio. |
| Accesibilidad | Lighthouse CI | ≥ 90 en landing, inicio de sesión, perfil y teleasistencia (E5). |

Las guías de Vitest y Playwright están en `node_modules/next/dist/docs/01-app/02-guides/testing/`.

---

## 4. Módulos del frontend

| # | Módulo | Requiere en el backend | Pantallas y servicios | Hallazgos que corrige |
|---|---|---|---|---|
| **F0** | Base de integración | M0 | Cliente HTTP, configuración, servicios en servidor, `proxy.ts` base, `error.tsx`, pruebas | — |
| **F1** | Identidad | M1 | Registro, inicio y cierre de sesión, alta del adulto mayor, consentimiento; `paciente.ts` (`obtenerFamiliar`, `obtenerAdultoMayor`) sobre `/yo` | — |
| F2 | Directorio | M2 | `/app/cuidadores`, `/app/cuidadores/[id]`; búsqueda en el servidor | H1, H9, H10, H12 |
| F3 | Cotización | M3 | `ResumenCosto` con montos del servidor | — |
| F4 | Contratación | M4 | `/app/contratar/[id]`, confirmación con id, cuidador en turno, y **vista mínima del cuidador** (`/cuidador`: aceptar o rechazar solicitudes, iniciar y finalizar servicios) | H2, H3, H4 |
| F5 | Notificaciones | M5 | Sin cambios obligatorios (campana opcional) | — |
| F6 | Teleasistencia | M6 | Inicio, `/app/teleasistencia`, alerta real, medicamentos, signos, tiempo real (SSE) | H6, H7, H8 |
| F7 | Pagos y bolsas | M7 | Pago al contratar, saldo y compra de bolsas | H5 |
| F8 | Mensajería | M8 | `/app/mensajes/[id]` sin simulaciones, tiempo real | H11 |
| F9 | Cuidadores y administración | M9 | Registro del cuidador, documentos, panel de verificación | H10 |

F0 se puede construir **ya**, en paralelo con M0, porque solo necesita `GET /salud`. F1 se construye en cuanto M1 esté en staging.

---

## 5. Definición de terminado común (cada módulo F*n*)

- [ ] `npm run lint` y `npm run build` del frontend en verde.
- [ ] Pruebas unitarias del módulo en verde.
- [ ] El servicio del módulo usa la API y **el JSON que reemplazaba ya no existe** en `data/` ni se importa.
- [ ] Ningún componente importa `lib/api` ni `data/`.
- [ ] Estados de carga, vacío y error revisados en las pantallas del módulo.
- [ ] Recorrido manual en 390 px y en escritorio; Lighthouse Accesibilidad ≥ 90 en las pantallas nuevas.
- [ ] Ningún texto en inglés visible para el usuario.

---

## 6. Decisiones abiertas

| # | Decisión | Recomendación |
|---|---|---|
| 1 | Cómo llega el tiempo real (SSE) al navegador | Decidir en F6: conexión directa al backend (requiere dominio propio o CORS con cookies) o proxy por un route handler de Next con renovación periódica. Plan B: consultas periódicas cada 10–15 s. |
| 2 | Dominio propio (`app.seniory.co`, `api.seniory.co`) | Necesario para producción (marca, correo, certificados); con el BFF no es obligatorio para que funcione la sesión, pero ayuda al SSE de F6. |
| 3 | Pruebas de recorrido contra staging en la CI | Sí desde F1, con un usuario de prueba propio de staging. |

---

## 7. Requisitos del frontend para producción

| Requisito | Detalle |
|---|---|
| **Páginas legales** | Política de tratamiento de datos (F1), términos y condiciones, y aviso sobre el alcance de la teleasistencia (ver F6). Enlaces visibles en el pie y en el registro. |
| **Honestidad en la teleasistencia** | La interfaz no promete lo que el sistema no hace: no dice «línea de emergencia» salvo que exista una integración real; muestra a quién se notificó de verdad y ofrece llamar al 123 (H7). |
| **Sin contenido de ejemplo** | `landing/bolsas.tsx` dice «Precios de referencia, ilustrativos para la demo» y calcula con una tarifa de referencia «ejemplo del pitch» ($21.600): se reemplaza por el catálogo real del backend (F7) con precios aprobados por el equipo empresarial. Las fotos de `public/img` son de bancos de imágenes: confirmar su licencia y atribución antes de publicar. |
| **Monitoreo** | Sentry en el frontend (sin datos personales), y registro del `digest` de los errores de servidor. |
| **SEO y metadatos** | Título, descripción y Open Graph en español; `robots.txt` que excluya `/app`. |
| **Rendimiento** | Lighthouse de rendimiento y accesibilidad revisados antes del lanzamiento; imágenes con `next/image`. |
| **Navegadores** | Chrome y Edge de escritorio y Android, Safari de iPhone (el comando de voz se oculta donde no hay soporte). |
| **Variables y secretos** | Configurados en Vercel por entorno; ninguno con `NEXT_PUBLIC_`. |
| **Dominio y HTTPS** | Dominio propio con certificado y cookies `Secure`. |
