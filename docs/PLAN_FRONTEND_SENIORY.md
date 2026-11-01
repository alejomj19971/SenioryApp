# SENIORY — Plan del frontend (versión 2)

> **Para quien implemente (equipo o Claude Code):** este plan describe cómo el frontend Next.js deja de leer los JSON de `frontend/data/` y pasa a usar el backend NestJS, **módulo por módulo**. Cómo se conectan los dos lados (entorno local, contratos, errores, tiempo real, pruebas) está en [INTEGRACION_FRONTEND_BACKEND.md](./INTEGRACION_FRONTEND_BACKEND.md).
> **Antes de escribir código en `frontend/`, lee `frontend/AGENTS.md`**: esta versión de Next.js (16.3.6) tiene cambios incompatibles con versiones anteriores. Las decisiones de este plan se basan en la documentación local de `frontend/node_modules/next/dist/docs/`.

| Campo | Valor |
|---|---|
| **Proyecto** | Seniory — *Creciendo y cuidando juntos* |
| **Fecha** | 2026-11-01 (versión 1: 2026-10-24) |
| **Estado** | Vigente. F0 y el sistema de diseño base están construidos; F1 en construcción |
| **Base** | [ADR-01](./ADR-01.md) §4.7 · [ADR-02](./ADR-02.md) · [PLAN_BACKEND](./PLAN_BACKEND_SENIORY.md) · [INTEGRACION](./INTEGRACION_FRONTEND_BACKEND.md) · [OPERACION](./OPERACION.md) |
| **Planes detallados** | Uno por módulo en [docs/frontend/](./frontend/README.md) |

## Qué cambió desde la versión 1

| Antes (2026-10-24) | Ahora |
|---|---|
| El backend estaba en construcción; cada F esperaba a su M en staging. | **El backend M0–M10 está construido y probado.** Todo el frontend se puede construir ya contra el backend local, sin esperar staging. |
| Paleta provisional (verde azulado + coral) y componentes del prototipo. | **Paleta nueva** (limpieza, seguridad, salud y precisión) y `components/ui` ajustado a la hoja de componentes aprobada (Etapa 0): objetivos de 48 px, contraste AA medido y componente `Aviso`. Ver §3.6. |
| Tipos generados del OpenAPI con `openapi-typescript`. | **No sirve para lo que se lee:** el OpenAPI del backend declara los cuerpos de entrada pero **no las respuestas**. Los contratos de respuesta se escriben a mano y se vigilan con pruebas de contrato (§2.4, decisión 4). |
| La cookie de refresco viajaba tal cual. | La del backend lleva `Path=/api/v1/auth`: **el BFF debe reescribir las cookies** al guardarlas en el dominio de Next (§2.3). |
| La ventana de gracia de 30 s del refresco era un ajuste pendiente al backend. | **Ya existe** (`VENTANA_DE_GRACIA_MS`). |
| Orden F1 → F9 por número. | **Orden por valor** (§4): F7 (pagos) sube porque sin pago aprobado no se puede iniciar un servicio, y F3 se funde con F4. |
| El flujo de diseño no existía. | Las pantallas se diseñan por etapas con Claude Design y se integran con Claude Code (§8). |

---

## 1. Objetivo y principios

**Objetivo:** construir el frontend de la **aplicación real** de Seniory, para producción y usuarios reales. Cada pantalla pasa a usar datos del backend, se agrega lo que una aplicación real exige (cuentas, estados de carga, vacío y error honestos, textos legales) y se corrigen los hallazgos H1–H12 del [plan del backend §2.2](./PLAN_BACKEND_SENIORY.md). No hay versión de demostración.

**Principios**

1. **Las pantallas no cambian de fuente de datos; cambia el servicio.** `lib/services/*` es el puerto (ADR-01 §4.7). Cada módulo F lo reimplementa sobre la API y **borra el JSON que reemplaza**. Los componentes no se enteran.
2. **El navegador solo habla con Next** (BFF): componentes de servidor, acciones de servidor y *route handlers* llaman al backend de servidor a servidor. El navegador nunca ve la URL del backend ni los tokens.
3. **Leer en el servidor, escribir con acciones de servidor.**
4. **El backend decide los permisos; el frontend solo los refleja.** `proxy.ts` hace verificaciones *optimistas*; la real ocurre en la API.
5. **Nada de datos de prueba en producción.** Mientras un módulo no esté conectado, su servicio sigue leyendo `data/`; al conectarlo se borra su JSON, y `data/` desaparece al terminar F8. Sin interruptor entre fuentes. Hasta entonces el entorno compartido es solo para el equipo.
6. **El servidor pone los números.** Precios, saldos, estados y fechas vienen de la API; el frontend nunca calcula dinero que luego se cobre (`lib/pricing.ts` solo se conserva para mostrar mientras se escribe, y se vigila contra los vectores del backend).
7. **Honestidad.** La interfaz no promete lo que el sistema no hace: sin «línea de emergencia» simulada, sin «escribiendo…» inventado, sin precios de ejemplo (§7).
8. **Accesibilidad igual o mejor que el MVP** (E5): texto ≥ 18 px, objetivos de 48 × 48 px, contraste AA medido, errores anunciados a lectores de pantalla.

---

## 2. Arquitectura

### 2.1 Cómo viaja una petición

```
Navegador ──(HTML / RSC / Server Action / EventSource, cookies de sesión)──▶ Next.js
                                                                              │
          proxy.ts: ¿hay sesión? ¿hay que renovar el token? ──────────────────┤
                                                                              │
   Componente de servidor ─▶ lib/services (puerto, mapea el contrato → tipos de la pantalla)
   Server Action ──────────▶ lib/acciones ─────────▶ lib/services
   Route handler (/api/…) ─▶ solo para lo que no cabe en una acción: tiempo real y archivos
                                                                              │
                                       lib/api/cliente-servidor.ts (server-only)
                                       · reenvía la cookie de acceso
                                       · reenvía X-Request-Id, X-Cliente-IP y X-Seniory-BFF
                                       · traduce problem+json a ErrorDeApi
                                                                              │
                                                                              ▼
                                                                Backend NestJS /api/v1
```

### 2.2 Capas dentro de `frontend/`

| Capa | Carpeta | Regla |
|---|---|---|
| Pantallas | `app/`, `components/` | Solo importan `lib/services` (lectura) y `lib/acciones` (escritura). Nunca `lib/api` ni `data/` (lo vigila `regla-de-capas.test.ts`). |
| Servicios (puertos) | `lib/services/*.ts` (`server-only`) | Firmas `async` estables y tipos de `lib/types.ts`. Llaman al cliente y **mapean** el contrato del backend a esos tipos. |
| Contratos | `lib/api/contratos/*.ts` | Tipos de lo que el backend **responde** (§2.4). Solo los ven los servicios. |
| Acciones | `lib/acciones/*.ts` (`'use server'`) | Mutaciones: validan la entrada, llaman a los servicios, devuelven los errores esperados **como valor** y revalidan. |
| Cliente HTTP | `lib/api/` (`server-only`) | Única pieza que conoce la URL del backend, las cookies y el formato `problem+json`. |
| Sesión | `lib/sesion/` (`server-only`) | Guarda, renueva y borra las cookies; `verificarSesion()` memorizada por render. |
| Proxy | `proxy.ts` | Correlación, verificación optimista de sesión y renovación del token. |
| Diseño | `app/globals.css`, `components/ui/` | Tokens y componentes base (§3.6). |

### 2.3 Sesión

| Tema | Decisión |
|---|---|
| Quién escribe las cookies | Next, en el **dominio del frontend**, a partir de los `Set-Cookie` que devuelve el backend (`respuesta.headers.getSetCookie()`). El navegador nunca habla con el backend. |
| **Reescritura obligatoria** | El backend emite `seniory_acceso` con `Path=/` y `seniory_refresco` con **`Path=/api/v1/auth`** (para que solo viaje a las rutas de sesión del backend). En el dominio de Next esa ruta no existe, así que el BFF las guarda **ambas con `Path=/`**, conservando `HttpOnly`, `SameSite=Lax`, `Secure` fuera de local y la fecha de vencimiento. Al llamar al backend, el BFF reenvía el refresco explícitamente en el encabezado `Cookie`. |
| Renovación | En `proxy.ts`: si falta la cookie de acceso o vence en menos de 60 s (se lee el `exp` del JWT **sin verificar la firma**: es optimista) y hay refresco → `POST /auth/refresh`; las cookies nuevas van en la **respuesta** y en la **petición que continúa**, para que los componentes de servidor de esa misma navegación ya usen el token nuevo (los componentes de servidor no pueden escribir cookies en Next 16). Si responde 401, borra las cookies y redirige a `/ingresar`. |
| Peticiones simultáneas | El backend acepta un refresco recién reemplazado durante **30 s** (ya implementado): varias navegaciones o *prefetch* no cierran la sesión. |
| Verificación real | `verificarSesion()` llama a `GET /yo` (memorizada con `cache` de React); 401 → `/ingresar?volver=…`. |
| Cierre | Acción de servidor: `POST /auth/logout` y borra las cookies aunque el backend no responda. |
| Roles y áreas | `familiar` → `/app`; `cuidador` → `/cuidador`; `administrador` → `/admin`. Cada área verifica el rol con `GET /yo`; el backend vuelve a verificarlo en cada ruta. |

### 2.4 Contrato entre el frontend y el backend

| Encabezado que envía Next | Para qué |
|---|---|
| `Cookie: seniory_acceso=…` (y el refresco solo en `/auth/refresh` y `/auth/logout`) | Autenticación. |
| `X-Request-Id` | Correlación de logs de ambos lados. |
| `X-Cliente-IP` + `X-Seniory-BFF: <secreto>` | Todas las peticiones llegan al backend desde los servidores de Next; sin esto, el límite por IP trataría a todos los usuarios como uno solo. |
| `Idempotency-Key` | En los POST que mueven dinero o piden ayuda: solicitar servicio, comprar bolsa, alerta. La clave se genera **al montar el formulario**, no al enviar, para que un reintento la repita. |

- **Tipos de respuesta.** El OpenAPI del backend (`/api/docs-json`) declara los cuerpos de entrada pero no las respuestas, así que `openapi-typescript` no produciría tipos útiles para lo que se lee. Decisión 4 (§6): por defecto, **contratos escritos a mano** en `lib/api/contratos/` y vigilados por **pruebas de contrato** que llaman al backend real (INTEGRACION §6). Alternativa: que el backend declare sus respuestas (`@ApiProperty`) y generar los tipos; es más trabajo en el backend y una dependencia nueva.
- **Errores:** `problem+json` → `ErrorDeApi` con `estado`, `codigo`, `mensaje` y `errores` por campo; cada módulo F aporta los mensajes en español de sus códigos (INTEGRACION §5).
- **Caché:** en Next 16 sin `cacheComponents`, `fetch` no se guarda por defecto y leer cookies vuelve dinámica la ruta. Toda la app autenticada es dinámica; no se agrega caché hasta medir.

---

## 3. Estándares

### 3.1 Datos y errores

| Situación | Cómo se maneja |
|---|---|
| Lectura en componente de servidor con 401 | `redirect('/ingresar?volver=<ruta>')` |
| Lectura con 404 (inexistente **o ajeno**: el backend no distingue) | `notFound()` |
| Error inesperado (5xx, red, tiempo agotado) | Se lanza; lo captura un `error.tsx` del segmento con `Aviso` y «Reintentar». |
| Mutación con error esperado (400, 409, 422, 429) | La acción devuelve `{ ok: false, mensaje, errores }`; el formulario lo muestra. |
| Mutación exitosa | `revalidatePath` y, si corresponde, `redirect`. |
| Servicio no disponible (503: pasarela, correo o almacén aún sin proveedor) | Mensaje honesto «no está disponible por ahora»; nunca se finge. |

### 3.2 Formularios

- `<form action={accion}>` con `useActionState`; botón con estado pendiente y deshabilitado.
- Validación en el servidor (la acción) además de atributos HTML; el backend tiene la última palabra.
- Errores junto a cada campo (`aria-describedby`) y un resumen con `role="alert"`; `Aviso` para errores de la pantalla.
- `autocomplete` correcto (`email`, `current-password`, `new-password`, `name`, `tel`).
- Mensajes en español de Colombia, sin jerga técnica.

### 3.3 Seguridad

- Ningún token en `localStorage` ni en componentes cliente. Variables del backend sin `NEXT_PUBLIC_`.
- Toda acción de servidor se trata como un endpoint público: valida su entrada y deja que el backend autorice.
- `volver` solo hacia rutas internas (empieza por `/`, no por `//`).
- Los DTOs que llegan a componentes cliente llevan solo lo que la pantalla muestra (sin correo ni ids internos que no se usen).
- Texto de otros usuarios (mensajes, reseñas) siempre como texto, nunca como HTML.
- Encabezados de seguridad y CSP: se revisan en F10 con la guía *Content Security Policy* de Next.

### 3.4 Configuración por variables de entorno

| Variable (solo servidor) | Uso |
|---|---|
| `SENIORY_API_URL` | URL del backend con su prefijo (`http://localhost:3001/api/v1`). |
| `SENIORY_BFF_SECRETO` | Igual a `SECRETO_BFF` del backend (32+ caracteres). |

Más adelante: `SENTRY_DSN` (F10). En producción la aplicación **no arranca** si falta una obligatoria. Sin interruptores entre «datos de prueba» y «datos reales».

### 3.5 Pruebas

| Tipo | Herramienta | Qué cubre |
|---|---|---|
| Unitarias | Vitest | Mapeadores contrato → tipos, cliente y errores, `lib/sesion`, validaciones de acciones, `pricing.ts` contra los 150 vectores del backend. |
| Componentes | Vitest + Testing Library | Formularios: errores, estado pendiente, accesibilidad básica. |
| **Contrato** | Vitest contra el backend local | Que cada respuesta que el frontend lee tenga la forma que el contrato dice (INTEGRACION §6). |
| Recorrido | Playwright **contra el backend local** | Los recorridos principales con datos reales de las semillas. |
| Accesibilidad | Lighthouse CI | ≥ 90 en landing, ingresar, registro, perfil y teleasistencia (E5). |

### 3.6 Sistema de diseño

Fuente única de verdad: `app/globals.css` (tokens) y `components/ui/` (componentes). Aprobado en la **Etapa 0** (hoja de componentes).

| Regla | Detalle |
|---|---|
| Colores | Solo tokens semánticos (`bg-primary`, `text-success`, `border-input`…). Prohibido hex, rgb y oklch en clases, y `text-white`/`bg-white` fijos. |
| Significado | **Azul marino** = acción principal y seguridad · **verde** = salud, verificado, normal (`accent`, `success`) · **ámbar** = atención y calificaciones (`warning`) · **rojo** = solo errores y alertas de emergencia (`destructive`) · **azul claro** = información (`info`). Nunca el color como única señal: siempre ícono y texto. |
| Tamaños | Botones, campos y pestañas ≥ 48 px (`h-12` = 54 px porque 1 rem = 18 px); texto ≥ 18 px salvo secundario. |
| Estados | Cada pantalla trae: cargando (esqueleto), vacío (texto útil y una acción), error (`Aviso` con «Reintentar») y normal. |
| Componentes nuevos | Se crean en `components/ui/` con el mismo estilo (ejemplo: `Aviso`). Sin librerías nuevas. |
| Contraste | Todo token nuevo o cambiado se mide en claro, oscuro y alto contraste antes de aceptarse (mínimo 4,5:1 texto; 3:1 texto grande y bordes de controles). |

**Anotado, sin resolver** (decisiones de Alejo, hoja Etapa 0): color del sello «Verificado» de `tarjeta-cuidador.tsx` (hoy `bg-primary`); activar el modo oscuro (nadie pone la clase `.dark`) y su combinación con alto contraste; `timeZone: "America/Bogota"` en `lib/format.ts`; botones de la barra de accesibilidad y de voz del buscador que miden 41 px; `chip.tsx` de 45 px.

---

## 4. Módulos del frontend y orden de construcción

Con el backend completo, el orden se elige por valor para una familia real y por dependencias, no por número de módulo.

| Orden | # | Módulo | Backend | Pantallas y servicios | Hallazgos que corrige |
|---|---|---|---|---|---|
| ✅ | **F0** | Base de integración | M0 | Cliente HTTP, configuración, servicios en servidor, `proxy.ts` base, `error.tsx`, pruebas | — |
| ✅ | **Etapa 0** | Sistema de diseño | — | Paleta, `components/ui`, `Aviso` | — |
| 1 | **F1** | Identidad | M1 | Ingresar, registrarse, recuperar y cambiar contraseña, alta del adulto mayor, consentimiento, política, cerrar sesión; sesión y `proxy.ts`; `paciente.ts` | — |
| 2 | F2 | Directorio | M2 | Búsqueda con filtros y cursor, perfil con reseñas e insignias, hoja de vida por *route handler* | H1, H9, H10, H12 |
| 3 | **F3+F4** | Cotización y contratación | M3, M4 | Resumen de costo del servidor, solicitar con `Idempotency-Key`, mis servicios, confirmación, cuidador en turno y **área del cuidador** `/cuidador` (aceptar, rechazar, iniciar, finalizar) | H2, H3, H4 |
| 4 | F7 | Pagos y bolsas | M7 | Pagar al confirmarse (enlace de la pasarela), estados del pago, saldo y compra de bolsas, liquidaciones del cuidador, catálogo real | H5 |
| 5 | F6 | Teleasistencia | M6 | Inicio y resumen, medicamentos y tomas, signos vitales, **alerta real** con `avisadosA` y llamar al 123, consulta periódica | H6, H7, H8 |
| 6 | F8 | Mensajería | M8 | Conversaciones, mensajes con `idDeCliente`, eventos en vivo por *route handler* | H11 |
| 7 | F5 | Notificaciones | M5 | Campana con `GET /notificaciones` | — |
| 8 | F9 | Cuidadores y administración | M9 | Registro del cuidador, perfil, documentos, renovaciones, **panel de revisores** `/admin` | H10 |
| 9 | F10 | Cierre para producción | M10 | Páginas legales, SEO, Sentry, CSP, Lighthouse, borrar `data/`, exportar y eliminar cuenta cuando el backend lo tenga | — |

F3 se une a F4 porque la pantalla de contratar necesita cotizar y solicitar a la vez. F7 va antes que F6 porque, con `REQUIERE_PAGO_APROBADO`, un servicio no inicia sin pago aprobado: sin F7, F4 no cierra el ciclo.

---

## 5. Definición de terminado común (cada módulo F*n*)

- [ ] `npm run lint`, `npm run build` y `npm test` del frontend en verde.
- [ ] El servicio del módulo usa la API y **el JSON que reemplazaba ya no existe** en `data/` ni se importa.
- [ ] Ningún componente importa `lib/api` ni `data/` (regla de capas en verde).
- [ ] **Pruebas de contrato** del módulo contra el backend local en verde.
- [ ] **Recorrido de Playwright** del módulo contra el backend local en verde.
- [ ] Estados de carga, vacío y error revisados en cada pantalla.
- [ ] Colores solo con tokens; contraste AA medido si se tocó la paleta.
- [ ] Recorrido manual en 390 px y en escritorio, en claro y con alto contraste; Lighthouse Accesibilidad ≥ 90 en las pantallas nuevas.
- [ ] Ningún texto en inglés visible. Ningún dato de ejemplo visible. Ninguna promesa que el sistema no cumple.
- [ ] `docs/AVANCE.md` y `docs/PENDIENTES.md` actualizados.

---

## 6. Decisiones

### Resueltas

| # | Decisión | Resolución |
|---|---|---|
| 1 | Tiempo real al navegador | **Mensajería:** *route handler* de Next que abre el flujo del backend con la cookie y lo reenvía al `EventSource` del navegador (se reconecta cada 10 min por diseño y con `Last-Event-ID`). **Teleasistencia:** el backend aún no tiene flujo en vivo (pendiente en M6); F6 usa consulta periódica cada 10–15 s (plan B). Ver INTEGRACION §7. |
| 2 | Dominio propio | Sigue pendiente del hosting (OPERACION); con el BFF no hace falta para que funcione la sesión. |
| 3 | Pruebas de recorrido contra el backend | Sí, desde F1, contra el backend local y las semillas; en la CI con un servicio de Postgres (INTEGRACION §8). |

### Abiertas

| # | Decisión | Recomendación |
|---|---|---|
| 4 | Contratos de respuesta: a mano o generados | **A mano + pruebas de contrato** (cero dependencias nuevas). Si el equipo prefiere generar, el backend debe primero declarar sus respuestas. |
| 5 | Quién acepta el consentimiento de salud (titular o representante) | Pendiente de asesoría legal (M1, decisión 1); **bloquea el lanzamiento**. Mientras tanto, el familiar como representante. |
| 6 | Textos legales v1 (política y consentimiento) | Los redacta el equipo; los revisa un abogado antes de publicar. El frontend los versiona (`v1`) y la versión debe coincidir con `VERSION_POLITICA_VIGENTE` y `VERSION_CONSENTIMIENTO_SALUD_VIGENTE` del backend. |
| 7 | Fecha de nacimiento: tres listas o campo de fecha | Tres listas; validar en la prueba de usabilidad (E4). |
| 8 | Activar el modo oscuro | Decisión de Alejo (Etapa 0). |
| 9 | Línea de emergencia en la alerta | **No existe ni se simula** (H7): la pantalla dice a quién se avisó y ofrece llamar al 123. |

---

## 7. Requisitos del frontend para producción

| Requisito | Detalle |
|---|---|
| **Páginas legales** | Política de tratamiento de datos (F1), términos y condiciones, y aviso sobre el alcance de la teleasistencia (F6). Enlaces visibles en el pie y en el registro. |
| **Honestidad en la teleasistencia** | Sin «línea de emergencia». La alerta muestra **a quién se notificó de verdad** (`avisadosA`) y ofrece llamar al 123 (H7). Hoy `boton-alerta.tsx` dice «Se notificará a Andrea y a la línea de emergencia»: se corrige en F6. |
| **Sin contenido de ejemplo** | `landing/bolsas.tsx` dice «Precios de referencia, ilustrativos para la demo» y calcula con $21.600: se reemplaza por `GET /catalogo/bolsas` (F7; la lista llega vacía hasta que el negocio apruebe los paquetes). Las fotos de `public/img` y las hojas de vida de `public/hojas-de-vida` son del prototipo: confirmar licencias y retirar las hojas de ejemplo antes de publicar. |
| **Monitoreo** | Sentry en el frontend (sin datos personales) y el `digest` de los errores de servidor. |
| **SEO y metadatos** | Título, descripción y Open Graph en español; `robots.txt` que excluya `/app`, `/cuidador` y `/admin`. |
| **Rendimiento** | Lighthouse de rendimiento y accesibilidad antes del lanzamiento; imágenes con `next/image`. |
| **Navegadores** | Chrome y Edge de escritorio y Android, Safari de iPhone (el comando de voz se oculta donde no hay soporte). |
| **Variables y secretos** | Configurados en el hosting por entorno; ninguno con `NEXT_PUBLIC_`. |
| **Dominio y HTTPS** | Dominio propio con certificado y cookies `Secure`. |

---

## 8. Flujo de diseño con Claude Design

Las pantallas se diseñan por etapas y se integran por etapas. Una etapa = un módulo F.

1. **Diseño (Claude Design).** Se le da el prompt base (paleta ya aplicada, reglas de TSX con tokens y estados) y la «Etapa Fn» con sus pantallas. Entrega TSX con Tailwind, datos de ejemplo en un archivo aparte y las dudas de diseño. El resultado de la hoja de componentes quedó en `frontend/ETAPA0_HOJA_DE_COMPONENTES.md`.
2. **Integración (Claude Code).** Se aplican los cambios al repositorio, se conectan al servicio real del módulo, se borra el dato de ejemplo y se verifica con lint, build, pruebas y capturas a 390 px en claro y alto contraste.
3. **Cuando no hay diseño aún**, Claude Code construye la pantalla directamente con `components/ui` y los tokens (así se hizo F1), y Claude Design la puede refinar después sin cambiar los servicios ni las acciones: por eso la lógica y la presentación van separadas.
