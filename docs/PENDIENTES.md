# Seniory — Lo que nos va quedando pendiente

**Se actualiza al terminar cada PR.** Aquí va solo lo que **falta o se dejó para después**, ordenado por etapa del plan. Lo que ya se hizo está en [AVANCE.md](./AVANCE.md). Las decisiones abiertas completas, con su responsable, están en el [plan del backend §10](./PLAN_BACKEND_SENIORY.md) y los requisitos para lanzar en el [§12](./PLAN_BACKEND_SENIORY.md).

**Leyenda del tipo:** 🧑 decisión o trabajo de una persona (no de código) · 🔧 código que falta · ⚖️ legal o de negocio · 🚀 bloquea el lanzamiento

---

## Decisiones tomadas a un lado («por ahora no»)

| Tema | Estado | Qué se necesita |
|---|---|---|
| 🚀 **Proveedor de correo** | **Aplazado por decisión del equipo** (2026-10-31) | Elegir un proveedor y escribir su adaptador. Sin él, «olvidé mi contraseña» responde 503 en producción, y tampoco hay avisos por correo. Lo recibe el puerto `EnviadorDeRecuperacion` (M1) y, más adelante, `CanalDeNotificacion` (M5). |
| 🚀 Hosting de staging y producción | Abierta | Elegir dónde se aloja (región cercana a Colombia o EE. UU., con Postgres gestionado y respaldos) y revisar la transferencia internacional de datos (Ley 1581). Bloquea el despliegue (M0 PR 7). |

---

## Por etapa del plan

### M0 — Plataforma y compartido  *(7 de 8 PR)*

| | Pendiente |
|---|---|
| 🔧🚀 | **PR 7: `Dockerfile` y despliegue automático a staging.** Espera el hosting. |
| 🧑 | Crear la cuenta de **Sentry** y su `SENTRY_DSN`; después, conectar el reporte de errores 500 y de eventos fallidos (hoy van solo al log). |
| 🧑 | Ver la **CI en verde en GitHub** (lint, arquitectura, pruebas con Postgres, build): corre desde que `main` recibió el workflow. Corregir lo que falle. |
| 🧑 | **Aceptar los ADR-03 (comunicación) y ADR-04 (stack)** entre los dos desarrolladores. |
| 🧑 | Actualizar la imagen del diagrama de ADR-01 (datos de salud en Teleasistencia, Mensajería y outbox). |
| 🔧 | Revisar las actualizaciones que abre Dependabot **una por una** antes de fusionarlas (TypeScript 7 rompió la instalación). |
| 🔧 | Contratos versionados del [ADR-03](./ADR-03.md): `openapi.json` (con el plugin de Swagger para que muestre los campos de los DTO), AsyncAPI de los eventos y su verificación en la CI. **Va en un PR aparte.** |

### M1 — Identidad  *(7 de 8 PR)*

| | Pendiente |
|---|---|
| 🔧 | **PR 8 (opcional):** exportar los datos de la persona y eliminar su cuenta (Ley 1581). Puede pasar a M10. |
| 🚀 | **Proveedor de correo** (ver arriba): recuperar la contraseña. |
| ⚖️🚀 | **Textos legales:** hoy la versión `v1` de la política de datos y del consentimiento es solo un marcador. Un abogado debe redactar los textos reales. |
| ⚖️🚀 | **Quién puede dar el consentimiento por la persona mayor** (decisión 1 de [M1 §10](./backend/M1-identidad.md)): asesoría legal. El modelo ya guarda con qué calidad se consintió. |
| ⚖️ | **Vincular a un segundo familiar** (`POST /vinculos`): necesita decidir quién autoriza la invitación (el responsable, la persona mayor…). |
| 🔧 | Contraseña de un solo uso del administrador, que se cambia al primer ingreso (M10: obliga al guard global a conocer esa marca). |
| 🔧🚀 | **Autenticación en dos pasos para administradores** (decisión 4, antes de producción, M10). |
| 🔧 | Verificar el correo de las cuentas (necesita el canal de correo, M5). |
| 🔧 | Tarea programada diaria que borre las sesiones y los enlaces de recuperación vencidos (los repositorios ya tienen el método; falta programarla, M10). |
| 🧑 | **Bloqueo de cuenta como vector de denegación de servicio** (decisión 7): que los fallos caduquen con el tiempo y desbloquear por correo (M10). |
| 🔧 | Rotar el secreto de firma de los tokens sin invalidar los de acceso vigentes: hoy acepta una sola clave. |
| 🔧 | Reintentos del envío del enlace de recuperación (hoy, si el canal falla, la persona pide otro): llegan con Notificaciones (M5). |

### M2 — Directorio (lectura)  *(backend construido)*

| | Pendiente |
|---|---|
| 🧑🚀 | **Cargar los primeros cuidadores reales** con `npm run cuidadores:importar`: quién revisa los documentos, en cuánto tiempo y con qué vigencia (procedimiento operativo), y el archivo revisado. Sin ellos, el directorio de producción está vacío por diseño. |
| 🧑🚀 | **Almacén de archivos real** (bucket privado con URL firmadas) cuando haya hosting: hoy en producción la hoja de vida responde 503 (`ALMACEN_DE_ARCHIVOS=deshabilitado`); el almacén local es solo para desarrollo. |
| 🔧🚀 | **Programar `npm run cuidadores:revisar-vigencias` cada día** (cron del hosting). Mientras no corra, un control vencido ya oculta el perfil al leerlo, pero la búsqueda lo seguiría listando hasta la revisión. |
| 🔧 | **Fotos de los cuidadores:** hoy `fotoUrl` es un texto sin almacén detrás; se resuelve con el almacén real (M9, subida por el cuidador). |
| 🔧 | La búsqueda normaliza el texto en la aplicación (sin `unaccent`) y usa `LIKE` sobre columnas normalizadas con índices `pg_trgm`. Revisar con `EXPLAIN` cuando haya volumen real. |
| 🔧 | La ruta `GET /cuidadores/:id/hoja-de-vida` responde un 302 hacia el API: el BFF (F2) decide si lo sigue por el servidor o redirige al navegador. |
| 🔧 | Frontend: `cuidadores.ts` y el buscador contra la API (F2). |
| 🧑 | Revisar si los teléfonos de `frontend/data/cuidadores.json` son de personas reales, y la **licencia de las fotos** de la landing. Las semillas del backend usan nombres y teléfonos inventados, no esos datos. |

*Resuelto en M2:* el directorio exige sesión y pasa por el límite global de peticiones (100 por minuto por IP); un límite propio y más estricto queda para M10 si hace falta.

### M3 — Pagos I: cotización  *(backend construido)*

| | Pendiente |
|---|---|
| ⚖️🚀 | **Comisiones aprobadas** (8 % a la familia y 10 % al cuidador de la política 1 son «ilustrativas»). Cambiarlas es insertar una política nueva con otra versión y fecha de inicio; no hace falta tocar código. |
| 🔧 | Frontend (F3): verificar `lib/pricing.ts` contra `backend/pruebas/vectores/precios.json` y corregir el pago al profesional a `subtotal − round(subtotal × 0,1)` (hoy difiere con montos de pesos sueltos). |
| 🔧 | Pantalla o comando para que un administrador cree una política nueva sin SQL (M10). |

### M4 — Reservas  *(backend construido)*

| | Pendiente |
|---|---|
| ⚖️🚀 | **Política de cancelación y reembolso.** El evento `servicio_cancelado` ya lleva las horas de anticipación para que Pagos (M7) la aplique. |
| 🧑 | **Cómo pasa un servicio a «en curso»:** hoy el cuidador marca el inicio (check-in), solo dentro de su franja o hasta 30 minutos antes. Decidir si además debe ser automático. |
| 🔧 | **Servicios aceptados que nunca se iniciaron** (el cuidador no llegó, o no marcó): hoy se quedan «aceptado» para siempre. Falta decidir qué pasa (marcar «no se presentó», avisar, reembolsar) — M10. |
| 🔧🚀 | **Exigir el pago aprobado para iniciar** (`REQUIERE_PAGO_APROBADO`): lo activa M7, cuando exista el pago; hoy un servicio aceptado puede iniciar sin pago. |
| 🔧 | Que el cuidador defina su propia `aceptacionAutomatica` (hoy es un campo del perfil que solo se cambia por base de datos o por el importador): llega con M9. |
| 🧑 | **Anticipación máxima de 180 días** y **plazos de aceptación** (2 h, o 30 min si es para hoy) están en el dominio como constantes: confirmarlos con el equipo. |
| 🔧 | Una franja de 6 h admite servicios de hasta 8 h (rango de la base de datos): decidir si las horas deben caber en la franja. |
| 🔧 | Frontend (F4): `contratacion.ts`, la confirmación con id, `CuidadorEnTurno` y la vista mínima del cuidador (`/cuidador`). |
| 🧑 | Horas exactas de cada franja (mañana 06–12, tarde 12–18, noche 18–06): decididas el 2026-10-26; confirmar con el negocio. |
| ⚖️ | Evaluar un seguro de responsabilidad civil y el manejo de quejas entre familias y cuidadores. |

### M5 — Notificaciones  *(backend construido)*

| | Pendiente |
|---|---|
| 🧑🚀 | **Proveedor de correo y de SMS o WhatsApp.** Hoy el único canal real es la aplicación (la campana, `GET /notificaciones`); correo, SMS, WhatsApp y push no se registran hasta que haya proveedor. **Sin un canal confiable fuera de la app, una alerta de teleasistencia solo llegaría a quien tenga la app abierta: no se puede lanzar así.** |
| 🔧🚀 | **Un adaptador por canal real** (`CanalDeNotificacion`) y probar el tiempo de entrega de alertas en staging con el canal real (E11): `entregada_en − creada_en` ya queda guardado en cada aviso. |
| 🔧 | **Confirmación de entrega** de SMS y WhatsApp: hoy un canal con proveedor responde `enviada` (aceptado) y no pasa a `entregada`; falta el webhook del proveedor que lo confirme. |
| 🔧 | Handlers de Pagos (`PagoAprobado`, `PagoRechazado`: M7) y de Teleasistencia (`AlertaGenerada`, `MedicamentoOmitido`, `LecturaFueraDeRango`: M6). El motor ya soporta la prioridad alta y los varios canales a la vez. |
| 🔧 | **Preferencias de la persona** (qué canales usa) y **horario silencioso** (las alertas lo ignoran): la tabla `preferencias_de_notificacion` existe, falta la API y usarla al elegir canales. |
| 🔧 | **Marcar como leídas** (la campana no sabe qué falta por ver): necesita una columna nueva. Y publicar `NotificacionEntregada`. |
| 🧑 | Costo por mensaje de cada canal, para decidir cuáles son «normales» (hoy: app y correo) y cuáles solo para alertas (SMS, WhatsApp). |
| 🔧 | **Sentry** para la alarma «alerta sin entregar» (hoy: auditoría y error en el log). |
| 🔧 | La tabla `fallidas` del plan no hace falta: el estado `fallida` y el historial de `intentos_de_envio` ya lo cubren. |

### M6 — Teleasistencia  *(backend construido)*

| | Pendiente |
|---|---|
| 🧑🚀 | **Umbrales clínicos:** los rangos por defecto (presión 90–140 / 60–90, pulso 50–100, glucosa 70–180) son **provisionales**, de uso general; un profesional de salud debe definirlos antes de lanzar. La **tolerancia de toma** (60 min) también está abierta. |
| ⚖️🚀 | **Aviso de alcance:** Teleasistencia **no** es un servicio de emergencias ni un dispositivo médico. La pantalla de la alerta debe decir a quién se avisó y ofrecer llamar al 123; revisarlo con asesoría legal. |
| 🧑 | **Cifrado de columnas clínicas** y plazos de retención y supresión de lecturas (decisión abierta, M10). |
| 🔧🚀 | **El canal confiable fuera de la app** (M5) es lo que hace útil una alerta: hoy solo llega a quien tenga Seniory abierta. Probar E11 en staging con el canal real. |
| 🔧 | **Eventos en vivo (SSE)** `GET /adultos-mayores/:id/eventos`: no se construyó. Necesita la infraestructura de SSE que también usa Mensajería (M8); mientras tanto la interfaz consulta el resumen. Cuando exista debe verificar el acceso en cada reconexión (revocar el consentimiento corta el flujo). |
| 🔧 | La persona mayor con **cuenta propia** (rol `adulto_mayor`) no tiene acceso: la política solo contempla a la familia y al cuidador. Decidir si la tendrá. |
| 🔧 | Alertas **automáticas** por una lectura fuera de rango o una toma omitida (los orígenes `signos` y `medicamento` existen en la base pero hoy solo avisan por notificación). |
| 🔧 | Editar un medicamento (hoy se agrega y se desactiva) y la **auditoría de lectura masiva** (alertar si alguien consulta demasiados). |
| 🔧 | Convenio real con un servicio de emergencias: solo con un acuerdo y su propio ADR (hoy no hay «línea de emergencia», ni simulada). |
| 🔧 | Frontend (F5): `teleasistencia.ts`, `BotonAlerta` con clave de idempotencia y estado real, `ListaMedicamentos` optimista y `GraficaSignos` con estado vacío. |

### M7 — Pagos II: cobro, bolsas y liquidación

| | Pendiente |
|---|---|
| 🔧 | Todo el módulo: cobro, bolsas de horas, liquidación al cuidador y el webhook de la pasarela. |
| 🧑🚀 | **Pasarela de pagos** que acepte marketplace y dispersión al cuidador, y cómo se paga al cuidador. |
| ⚖️🚀 | **Bolsa en pesos u horas**, sus paquetes y descuentos. |
| ⚖️🚀 | Empresa constituida, cuenta comercial aprobada, facturación electrónica ante la DIAN y tratamiento de retenciones. |

### M8 — Mensajería

| | Pendiente |
|---|---|
| 🔧 | Todo el módulo: conversaciones y mensajes con tiempo real. |
| 🧑 | Cuánto tiempo sigue legible una conversación después de terminar el servicio. |

### M9 — Directorio II: registro y verificación

| | Pendiente |
|---|---|
| 🔧 | Todo el módulo: registro del cuidador, documentos y verificación. |
| 🧑 | Antivirus para los archivos subidos. |
| ⚖️🚀 | **Procedimiento de verificación:** quién revisa, en cuánto tiempo y con qué vigencia; y los primeros cuidadores reales verificados. |

### M10 — Endurecimiento y producción

| | Pendiente |
|---|---|
| 🔧🚀 | Todo: despliegue, un rol de base de datos por módulo, respaldos con restauración ensayada, monitoreo y alertas, y revisión de seguridad (OWASP ASVS nivel 2). |
| ⚖️🚀 | Los requisitos de la [sección 12 del plan](./PLAN_BACKEND_SENIORY.md): términos y condiciones, política de datos, atención de consultas y reclamos (SIC), soporte, piloto cerrado con unas 20 familias. |

### M11 — IA *(opcional)*

| | Pendiente |
|---|---|
| 🧑 | Definir el alcance con el equipo y escribir su propio ADR antes de implementar. |

---

## Frontend

El prototipo del pitch funciona con datos de ejemplo. **Ninguna pantalla está conectada al backend todavía.**

| Etapa | Pendiente |
|---|---|
| F1 — Identidad | 🔧 `instrumentation.ts` que impida arrancar en producción sin `SENIORY_API_URL` y `SENIORY_BFF_SECRETO` (va con el primer código que llama al backend). Registro, inicio de sesión, **olvidé mi contraseña**, cambiar contraseña, alta del adulto mayor y consentimiento. |
| F2 a F9 | 🔧 Una por cada módulo M2 a M9 (directorio, cotización, contratación con vista mínima del cuidador, avisos, teleasistencia, pagos y bolsas, mensajes, administración). |
| 🔧 | **Vulnerabilidades de las dependencias del frontend** (`npm audit`: 15 en producción, casi todas por `shadcn` y `zod`; arreglarlas obliga a subir `shadcn` a una versión mayor). `shadcn` es una herramienta de desarrollo y no debería estar en `dependencies`. |
| 🧑 | **Pruebas de usabilidad** con adultos mayores y familiares reales (E4, E5). |
| 🧑 | Quitar de la landing los textos y cifras de demostración. |
| 🧑 | Decidir **dominios y cookies**: subdominios del mismo sitio (`app.…` y `api.…`) o reescrituras. |

---

## Cómo se usa este archivo

1. Al terminar un PR, **se borra de aquí lo que quedó hecho** y se anota en [AVANCE.md](./AVANCE.md).
2. Lo que se deja a un lado a propósito se agrega a «Decisiones tomadas a un lado», con la fecha.
3. Lo que bloquea el lanzamiento lleva 🚀: antes de abrir a usuarios reales no debe quedar ninguno.
