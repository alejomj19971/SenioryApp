# SENIORY — Plan de integración frontend ↔ backend

Cómo se conectan los dos lados, módulo por módulo, y cómo se comprueba que quedaron bien conectados. Complementa el [plan del frontend](./PLAN_FRONTEND_SENIORY.md) (qué se construye y en qué orden) y las guías [OPERACION](./OPERACION.md) y [SEGURIDAD](./SEGURIDAD.md) del backend.

| Campo | Valor |
|---|---|
| **Fecha** | 2026-11-01 |
| **Estado** | Vigente; se actualiza al cerrar cada módulo F |
| **Punto de partida** | Backend M0–M10 en `main` (2927 pruebas); frontend F0 y sistema de diseño base en `main` |

---

## 1. Entorno local de integración

Todo corre en el equipo de quien desarrolla; no hace falta staging.

| Pieza | Puerto | Cómo se levanta |
|---|---|---|
| Postgres 17 | 5434 | `cd backend && npm run bd:arriba` (Docker Desktop encendido) |
| Migraciones | — | `npm run bd:migrar` |
| Datos de ejemplo de **desarrollo** | — | `CONTRASENA_DE_PRUEBA=… npm run semillas` (la familiar Andrea, Doña Carmen con consentimiento y 9 cuidadores visibles; **se niega a correr en producción**) |
| Administrador | — | `ADMIN_NOMBRE=… ADMIN_CORREO=… ADMIN_CONTRASENA=… npm run crear-admin` |
| Backend | 3001 | `npm run dev` (documentación en `http://localhost:3001/api/docs`, JSON en `/api/docs-json`) |
| Frontend | 3000 | `cd frontend && npm run dev` |

**Variables que deben coincidir entre los dos lados**

| Backend (`backend/.env`) | Frontend (`frontend/.env.local`) | Regla |
|---|---|---|
| `SECRETO_BFF` | `SENIORY_BFF_SECRETO` | **Idénticos**, 32+ caracteres. Sin esto el backend ignora la IP del cliente. |
| `PUERTO=3001` | `SENIORY_API_URL=http://localhost:3001/api/v1` | El prefijo `/api/v1` va en la URL. |
| `COOKIES_SEGURAS=false` | (Next usa `secure` solo si `NODE_ENV=production`) | En local, ambos sin `Secure`: el navegador no guarda una cookie `Secure` en `http://`. |
| `VERSION_POLITICA_VIGENTE=v1` | `lib/legal/versiones.ts` → `v1` | El registro **falla (400)** si la versión que envía el frontend no es la vigente. |
| `VERSION_CONSENTIMIENTO_SALUD_VIGENTE=v1` | ídem | Igual para el consentimiento (`consentimiento.version_no_vigente`). |

**Variables del backend para que todo funcione en local sin proveedores reales**

| Variable | Valor local | Qué habilita |
|---|---|---|
| `CANAL_DE_RECUPERACION` | `consola` | «Olvidé mi contraseña»: el enlace sale en el log del backend (no hay correo). Con `deshabilitado` responde 503. |
| `CANALES_DE_NOTIFICACION_SIMULADOS` | `true` | Avisos por correo/SMS/WhatsApp solo al log; la campana es real. |
| `PASARELA_DE_PAGOS` · `SECRETO_DE_PASARELA` | `simulada` · 32+ | Pagos de mentira; **el pago solo se aprueba con un aviso firmado** (§4, F7). |
| `DISPERSOR_DE_PAGOS` | `simulado` | Liquidaciones al cuidador. |
| `REQUIERE_PAGO_APROBADO` | `false` para explorar, `true` para probar el ciclo completo | Con `true`, un servicio no inicia sin pago aprobado. |
| `ALMACEN_DE_ARCHIVOS` · `SECRETO_DE_ARCHIVOS` | `local` · 32+ | Hoja de vida y documentos del cuidador (F2, F9). |
| `INTERVALO_*` | los de `.env.ejemplo` | Tareas: expirar solicitudes, omitir tomas, enviar avisos, vencer pagos. |

**Un solo comando (pendiente).** Cuando F1 esté cerrado se agrega `npm run integracion:preparar` en el frontend (Postgres, migraciones, semillas y variables de ejemplo) para que un recorrido completo arranque desde cero en minutos.

---

## 2. Cómo se conecta lo técnico

### 2.1 Cliente HTTP (`lib/api/cliente-servidor.ts`, ya construido en F0)

`leerDelBackend` (componentes de servidor: 401 → `/ingresar`, 404 → `notFound()`, el resto se lanza), `escribirEnBackend` (acciones: devuelve el error como valor) y `pedirAlBackend` (respuesta cruda, la usa la sesión). Tiempo máximo de 8 s por petición. Envía `X-Seniory-BFF`, `X-Cliente-IP`, `X-Request-Id`, y `Idempotency-Key` cuando se le da.

### 2.2 Sesión (F1)

1. **Iniciar sesión / registrarse:** la acción llama a `POST /auth/login|registro` **sin cookie**; el backend responde `{ usuario }` y dos `Set-Cookie`. `lib/sesion` los lee con `getSetCookie()` y escribe las cookies en Next **con `Path=/`** (la de refresco llega con `Path=/api/v1/auth`, que en el dominio de Next no existe).
2. **Cada petición:** el cliente reenvía solo `seniory_acceso`.
3. **Renovar:** `proxy.ts` llama a `POST /auth/refresh` enviando `Cookie: seniory_refresco=…`; escribe las cookies nuevas en la respuesta y en la petición que continúa. 204 sin cuerpo.
4. **Cerrar:** `POST /auth/logout` con el refresco; se borran ambas cookies pase lo que pase.
5. **Cambiar contraseña:** `PATCH /yo/contrasena` **devuelve cookies nuevas** (cierra las otras sesiones): la acción debe guardarlas.

### 2.3 Contratos de respuesta (`lib/api/contratos/`)

El OpenAPI no declara respuestas (decisión 4 del plan). Cada módulo F escribe el contrato de lo que lee, tomándolo de la respuesta real y del README del módulo del backend, y el servicio lo **mapea** a `lib/types.ts`. Regla: el contrato refleja al backend (nombres en español, fechas ISO, dinero en pesos enteros); `lib/types.ts` refleja a la pantalla.

### 2.4 Fechas, dinero y zona horaria

- Fechas de servicio: `AAAA-MM-DD` de **Colombia** (nunca instante UTC). Franjas: mañana 06–12, tarde 12–18, noche 18–06.
- Instantes (mensajes, lecturas, pagos): ISO 8601 en UTC; se muestran con `timeZone: "America/Bogota"` (pendiente en `lib/format.ts`).
- Dinero: pesos **enteros**; `formatearCOP`. Nunca `float`. `lib/pricing.ts` se corrige para que el pago al profesional sea `subtotal − round(subtotal × 0,1)` y pase los 150 vectores de `backend/pruebas/vectores/precios.json`.

---

## 3. Mapa de módulos: qué consume cada F

| F | Rutas del backend | Servicio / acción en el frontend | Pantallas | JSON que se borra |
|---|---|---|---|---|
| **F1** | `POST /auth/registro` · `login` · `refresh` · `logout` · `olvide-contrasena` · `restablecer-contrasena` · `GET/PATCH /yo` · `PATCH /yo/contrasena` · `POST /adultos-mayores` · `GET /adultos-mayores/:id` · `POST /adultos-mayores/:id/consentimientos` · `DELETE /consentimientos/:id` | `lib/sesion`, `acciones/cuenta`, `services/paciente` | `/ingresar`, `/registro`, `/recuperar`, `/restablecer-contrasena`, `/bienvenida/*`, `/privacidad`, perfil, cerrar sesión | `data/familia.json` (familiar y adulto mayor; el cuidador en turno sigue hasta F4) |
| **F2** | `GET /cuidadores` · `/cuidadores/filtros` · `/cuidadores/:id` · `/cuidadores/:id/hoja-de-vida` | `services/cuidadores` | `/app/cuidadores`, `/app/cuidadores/[id]`; *route handler* para la hoja de vida | `data/cuidadores.json`, `public/hojas-de-vida/*` |
| **F3+F4** | `POST /pagos/cotizaciones` · `POST /servicios` · `GET /servicios` · `GET /servicios/:id` · `/servicios/:id/{cancelar,calificacion}` · `GET /adultos-mayores/:id/cuidador-en-turno` · del cuidador: `/servicios/:id/{aceptar,rechazar,iniciar,finalizar}` | `services/contratacion`, `acciones/contratacion` | `/app/contratar/[id]`, confirmación, «mis servicios», cuidador en turno, `/cuidador` | `cuidadorAsignadoId` de `familia.json` |
| **F7** | `GET /catalogo/bolsas` · `GET /bolsa` · `POST /bolsa/compras` · `GET /pagos` · `POST /pagos/:id/enlace` · `GET /liquidaciones` | `services/pagos`, `acciones/pagos` | pago al confirmarse, estados del pago, saldo y compra de bolsas, liquidaciones | datos de ejemplo de `landing/bolsas.tsx` |
| **F6** | `/adultos-mayores/:id/{resumen,medicamentos,signos-vitales,signos-vitales/ultima,rangos-de-referencia,alertas}` · `POST /medicamentos/:id/desactivar` · `PATCH /medicamentos/:id/tomas/:tomaId` · `PATCH /alertas/:id/atendida` | `services/teleasistencia`, `acciones/teleasistencia` | inicio, `/app/teleasistencia`, alerta, `BottomNav` (medicamento pendiente) | `data/medicamentos.json`, `data/signos-vitales.json` |
| **F8** | `POST/GET /conversaciones` · `GET/POST /conversaciones/:id/mensajes` · `GET /mensajeria/eventos` (SSE) | `services/mensajeria`, `acciones/mensajeria`, *route handler* de eventos | `/app/mensajes/[id]` (sin respuestas automáticas) | `data/mensajes.json` (y con él, `data/`) |
| **F5** | `GET /notificaciones` | `services/notificaciones` | campana | — |
| **F9** | `POST /auth/registro-cuidador` · `/cuidadores/yo` (`POST/GET/PATCH`) · `PUT /cuidadores/yo/documentos/:tipo` · `POST /cuidadores/yo/revision` · `POST /cuidadores/yo/verificaciones/:control/renovacion` · `/verificaciones/*` (administrador) | `services/postulacion`, `services/verificaciones` | registro del cuidador, perfil, documentos, panel `/admin` | — |

### Brechas conocidas entre el prototipo y la API (se resuelven al construir cada F)

| Módulo | Brecha |
|---|---|
| F1 | El prototipo tiene un solo «familiar» y un «adulto mayor» fijos con foto. La API trae `adultosMayores[]` (puede haber varios o ninguno) con `fotoUrl` nulo posible. Sin adulto mayor → `/bienvenida/persona`; sin consentimiento → `/bienvenida/consentimiento`. El parentesco es un valor cerrado (`hijo_hija`, `nieto_nieta`, `conyuge`, …) y la fecha de nacimiento se envía `AAAA-MM-DD`. |
| F2 | El tipo `Cuidador` del prototipo trae `telefono` (**H1: nunca debe llegar al navegador**; se elimina) y `calificacion` numérica (la API da `null` si no tiene reseñas: «Sin reseñas», no «0 estrellas»). La paginación es por **cursor** (20 por página, máx. 50). El autor de la reseña viene abreviado («Andrea G.»). La hoja de vida **redirige** a una dirección firmada que vence a los 5 minutos y exige sesión: no se enlaza directo, pasa por un *route handler* de Next que la sigue y entrega el PDF. La vista del cuidador **no dice si tiene hoja de vida**: el perfil lo pregunta al backend (302 = sí, 404 = no) y solo ofrece el enlace si existe; la tarjeta de la búsqueda ya no promete «hoja de vida disponible». Los **ids son UUID** (el prototipo usaba `c-marta-restrepo`): un id que no es UUID se trata como «no encontrado» sin llegar al backend (que daría 400). La búsqueda se hace **en el servidor**, con los filtros en la URL; «Ver más» pide la página siguiente con el cursor por una acción de servidor. El filtro de zona y las especialidades salen de `/cuidadores/filtros`. |
| F3+F4 | `ConfirmarContratacion` hoy es un stub. La API pide `adultoMayorId`, `cuidadorId`, `fecha`, `jornada`, `horas` (1–8) y `medioDePago` (`pasarela` o `bolsa`), con `Idempotency-Key` obligatoria (8–100 caracteres). El **resultado es una solicitud** (`solicitado`, o `aceptado` si el cuidador activó la aceptación automática), no una confirmación: la pantalla de confirmación dice «Solicitud enviada, esperando al cuidador». El cuidador responde en 2 horas (30 min si es para hoy). Errores propios: `servicio.franja_ocupada` (409), `bolsa.saldo_insuficiente` (422). |
| F7 | El flujo real: servicio **aceptado** → Pagos crea el pago → `pago_requerido` avisa → la familia pide el enlace (`POST /pagos/:id/enlace`) y paga en la pasarela → el **webhook firmado** aprueba. Con la pasarela simulada no hay página de pago: para recorrer el ciclo en local, la prueba envía el aviso firmado (helper de pruebas con `SECRETO_DE_PASARELA`). Con `bolsa` el pago nace aprobado. El catálogo de bolsas llega **vacío** hasta que el negocio apruebe los paquetes: la landing no muestra precios inventados. |
| F6 | El backend marca/deshace tomas con `PATCH …/tomas/:tomaId { estado }` y tiene idempotencia y bloqueo (409 si dos pantallas chocan). La alerta lleva `Idempotency-Key` y devuelve `avisadosA`. **No hay flujo en vivo**: la pantalla consulta cada 10–15 s. Sin lecturas, las listas vienen vacías (estado «vacío», no error). Los rangos de referencia son **provisionales** (los define un profesional de salud antes de lanzar). |
| F8 | `idDeCliente` por mensaje (reenviar no duplica). Solo se escribe con un servicio vivo (422 si no); leer siempre. La interfaz **reconoce los mensajes por `id`** (el flujo entrega al menos una vez). Sin presencia ni «escribiendo…» (H11). Texto plano 1–1000 caracteres. |
| F9 | Subida de documentos como **cuerpo binario** (`PUT`, no multipart), PDF/JPEG/PNG de 1 byte a 5 MB (hoja de vida solo PDF), hasta 5 por tipo; el servidor decide por el contenido. Con el almacén `deshabilitado` responde 503. El panel de administrador abre documentos con dirección firmada de 2 minutos (cada apertura queda auditada). |

---

## 4. Orden de integración y puntos de control

Cada módulo es una rama `feat/fN-…`, un commit aprobado y su subida a `main`. Antes de pasar al siguiente, el módulo cumple la [definición de terminado](./PLAN_FRONTEND_SENIORY.md#5-definición-de-terminado-común-cada-módulo-fn).

| Paso | Módulo | Punto de control (lo que debe funcionar contra el backend local) |
|---|---|---|
| 1 | **F1** | Registro → persona → consentimiento → `/app` con «Hola, <nombre real>»; sin sesión `/app` redirige a `/ingresar`; la sesión se renueva sola; cerrar sesión; «olvidé mi contraseña» con el enlace del log del backend. |
| 2 | F2 | Buscar por texto y filtros, paginar con cursor, abrir un perfil, ver la hoja de vida; ningún teléfono en el HTML ni en el JSON de la página. |
| 3 | F3+F4 | La familia cotiza y solicita; el cuidador (otra sesión) acepta; sin doble reserva (dos familias, una recibe 409); la familia cancela; el cuidador inicia y finaliza; la familia califica. |
| 4 | F7 | Con bolsa: pago aprobado al instante. Con pasarela: enlace, aviso firmado, pago aprobado, servicio inicia. Pago rechazado → el servicio se cancela por `pago_fallido`. |
| 5 | F6 | Medicamentos y tomas del día, lectura de signos, alerta con `avisadosA`, el cuidador de un servicio terminado pierde el acceso al instante (404). |
| 6 | F8 | Dos sesiones chatean en vivo; reconexión sin perder ni duplicar; escribir con servicio terminado da el aviso correcto. |
| 7 | F5 | La campana lista los avisos reales y marca los de alta prioridad. |
| 8 | F9 | Un cuidador se registra, sube documentos, un administrador los revisa y aprueba, y aparece en la búsqueda de las familias. |
| 9 | F10 | Lighthouse, CSP, Sentry, `data/` borrada, páginas legales con texto aprobado. |

---

## 5. Errores: del backend a la pantalla

El backend responde `application/problem+json` con `{ type, title, status, codigo, idDeCorrelacion, errores? }`. `ErrorDeApi` ya lo traduce. Cada módulo F agrega un catálogo `codigo → mensaje en español` en `lib/api/mensajes-de-error.ts`; lo que no esté en el catálogo usa el mensaje por estado.

| Estado | Significado en Seniory | Mensaje por defecto |
|---|---|---|
| 400 | Campo inválido (por campo en `errores`) | El del campo, tal cual lo da el backend (ya viene en español) |
| 401 | Sesión vencida o no iniciada | Redirige a `/ingresar?volver=…`. En el login: «Correo o contraseña incorrectos» (sin distinguir) |
| 403 | El rol no puede hacer esto | «No tienes permiso para hacer esto» |
| 404 | No existe **o no es tuyo** (el backend no los distingue) | `notFound()` |
| 409 | Conflicto (correo ya registrado, franja ocupada, alguien se adelantó) | Mensaje específico por `codigo` |
| 422 | Regla de negocio (saldo insuficiente, servicio sin pago, no se puede escribir) | Mensaje específico por `codigo` |
| 429 | Demasiados intentos | «Hiciste demasiados intentos. Espera unos minutos e inténtalo de nuevo» |
| 503 | Aún no hay proveedor (correo, pasarela, almacén) | «No está disponible por ahora». **Nunca se finge** |
| Red / 8 s | El backend no responde | `error.tsx` con `Aviso` y «Reintentar» |

`idDeCorrelacion` se muestra pequeño en el `Aviso` de los errores inesperados («Código: …») para que soporte encuentre la petición en los logs.

---

## 6. Pruebas de integración

| Capa | Qué comprueba | Dónde |
|---|---|---|
| **Contrato** | Para cada ruta que el frontend lee: la respuesta real tiene los campos que el contrato dice, con los tipos correctos, y **no trae** los que no debe (teléfono, correo ajeno, dinero del otro lado). Corre contra el backend local con las semillas. | `frontend/pruebas/contrato/*.test.ts` |
| **Sesión** | Reescritura de cookies (`Path=/`), renovación con acceso vencido, refresco simultáneo (la ventana de gracia), cierre. | `frontend/pruebas/unitarias` (con `fetch` simulado) + una de contrato contra el backend |
| **Recorrido** | Los recorridos del §4 con Playwright en 390 px, con datos reales. | `frontend/pruebas/recorrido/*.spec.ts` |
| **Accesibilidad** | Lighthouse ≥ 90 por pantalla nueva; contraste AA medido si cambia un token. | CI / manual |
| **Seguridad** | Ninguna cookie de sesión legible desde JavaScript; ninguna respuesta con datos de otra persona; el HTML no contiene teléfonos ni correos ajenos. | Recorrido |

Para los recorridos con **dos personas** (familia y cuidador, dos familias a la vez) se usan dos contextos de navegador de Playwright, cada uno con su sesión.

**Utilidades de prueba** (`frontend/pruebas/soporte/`): `backend-local.ts` (¿está arriba? si no, la prueba se **omite con mensaje claro**, no falla), `crear-cuenta.ts` (registra una familia nueva por la API con correo único) y `firmar-aviso-de-pago.ts` (aviso firmado para el ciclo de F7).

---

## 7. Tiempo real y archivos (route handlers)

| Caso | Diseño |
|---|---|
| **Eventos de mensajería (F8)** | `app/api/mensajeria/eventos/route.ts`: `GET` que abre `GET /mensajeria/eventos` del backend con la cookie y el `Last-Event-ID` del navegador y reenvía el cuerpo como flujo (`text/event-stream`, sin caché, sin búfer). El navegador usa `EventSource('/api/mensajeria/eventos')`. Si el backend cierra (vida máxima de 10 min, apagado), el `EventSource` se reconecta solo con `Last-Event-ID`. Si la cookie de acceso venció, `proxy.ts` ya la renovó antes de llegar al handler. Si hay 5 conexiones abiertas de la misma persona el backend responde 429/cierra: la interfaz usa una sola conexión por pestaña activa. |
| **Respaldo sin flujo** | Si el flujo falla tres veces seguidas, la interfaz pasa a consultar `GET /conversaciones/:id/mensajes` cada 10 s. |
| **Teleasistencia (F6)** | Sin flujo en vivo en el backend: consulta de `GET …/resumen` cada 10–15 s mientras la pantalla está visible (se pausa en segundo plano). Cuando exista el flujo, usará el mismo patrón que mensajería. |
| **Hoja de vida (F2)** ✅ | `app/api/cuidadores/[id]/hoja-de-vida/route.ts` (la lógica está en `abrirHojaDeVida` del servicio): pide `GET /cuidadores/:id/hoja-de-vida` con la cookie sin seguir la redirección, **sigue él mismo** la dirección firmada (5 minutos de vida) y entrega el PDF con `Cache-Control: private, no-store`. El navegador nunca ve ni la dirección del backend ni una URL firmada que se pueda copiar. Solo sigue direcciones `https` (un bucket real) o del propio backend (almacén local de desarrollo), y solo entrega `application/pdf`. En producción, `URL_PUBLICA_DE_LA_API` del backend debe ser alcanzable desde el servidor de Next. |
| **Subida de documentos (F9)** | Acción de servidor o *route handler* que reenvía el cuerpo **binario** al `PUT /cuidadores/yo/documentos/:tipo` (límite de 5 MB y tipo comprobados antes de reenviar; el backend decide por el contenido). |

---

## 8. CI

Hoy la CI del frontend corre lint, build y pruebas unitarias. Para integrar se agrega un job **`integracion`** (cuando F1 esté cerrado):

1. Servicio `postgres:17` en el job; `npm ci` y `bd:migrar` en el backend con variables de prueba.
2. Arrancar el backend (`npm run build && node dist/main`) y esperar `/salud/listo`.
3. `semillas` con una contraseña de prueba generada por el job.
4. `npm run build` del frontend y arrancarlo con `next start`.
5. Pruebas de contrato y recorridos de Playwright (Chromium) con el reporte como artefacto.

Mientras no exista, la verificación es local y se anota en cada commit.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| La sesión se cierra sola por renovaciones simultáneas | Ventana de gracia de 30 s (backend) + prueba de refresco simultáneo. |
| Cookie de refresco no llega por su `Path` | Reescritura a `Path=/` y prueba de sesión contra el backend real (§2.2). |
| Un cambio en la API rompe una pantalla sin que nadie se entere | Pruebas de contrato en la CI; los servicios mapean, así el cambio se absorbe en un solo archivo. |
| Se filtra un dato que no debía salir (teléfono, dinero ajeno) | Contratos sin esos campos + prueba de contrato que falla si aparecen + revisión del HTML. |
| Doble envío al reintentar (cobro, alerta, mensaje) | `Idempotency-Key` generada al montar el formulario; `idDeCliente` por mensaje. |
| El texto legal no coincide con la versión que acepta el backend | Una sola constante de versión + prueba que la compara con el backend local. |
| Estado mixto (datos reales y de ejemplo) confunde a usuarios | Entorno compartido solo para el equipo hasta terminar F8; cada F borra su JSON. |
| El pago no se puede completar en local | Helper de prueba que firma el aviso; documentado en §1 y §3 (F7). |
| Flujo en vivo de teleasistencia inexistente | Consulta periódica hoy; el backend lo agrega después sin cambiar las pantallas. |

---

## 10. Trabajo de F1 (el primero)

| PR | Contenido |
|---|---|
| 1 | `lib/sesion/` (guardar, leer, borrar; reescritura de cookies), renovación y redirecciones en `proxy.ts`, cookie de acceso en el cliente, `verificarSesion`; pruebas unitarias. |
| 2 | Contratos de Identidad y adaptador de `paciente.ts` sobre `GET /yo`; `lib/legal/versiones.ts`. |
| 3 | `/ingresar`, `/registro`, `/recuperar`, `/restablecer-contrasena` con sus acciones y pruebas de componente. |
| 4 | `/bienvenida/persona`, `/bienvenida/consentimiento`, `/privacidad` (texto provisional **marcado como pendiente de revisión legal**) y cambiar contraseña. |
| 5 | «Cerrar sesión» en `AppHeader`, protección del layout de `/app`, pruebas de contrato y recorrido de Playwright contra el backend local. |

Se construyen juntos en una rama (`feat/f1-identidad`) y se commitean por PR si el volumen lo pide.
