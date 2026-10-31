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

### M2 — Directorio (lectura)

| | Pendiente |
|---|---|
| 🔧 | Todo el módulo: búsqueda y perfiles de cuidadores verificados, reseñas y `GET /cuidadores`. |
| 🧑 | **Límite de peticiones del directorio** para evitar el vaciado masivo (decisión abierta). |
| 🧑 | Revisar si los teléfonos de `frontend/data/cuidadores.json` son de personas reales, y la **licencia de las fotos** de la landing. |

### M3 — Pagos I: cotización

| | Pendiente |
|---|---|
| 🔧 | Todo el módulo: `POST /pagos/cotizaciones` y la política de precios versionada. |
| ⚖️ | **Comisiones aprobadas** (8 % a la familia y 10 % al cuidador hoy son «ilustrativas»). |

### M4 — Reservas

| | Pendiente |
|---|---|
| 🔧 | Todo el módulo: solicitar, aceptar, iniciar, finalizar, cancelar y calificar un servicio. |
| ⚖️ | **Política de cancelación y reembolso.** |
| 🧑 | Horas exactas de cada franja (mañana, tarde, noche). |
| ⚖️ | Evaluar un seguro de responsabilidad civil y el manejo de quejas entre familias y cuidadores. |

### M5 — Notificaciones

| | Pendiente |
|---|---|
| 🔧🚀 | Todo el módulo, con **un canal real y confiable** (SMS o WhatsApp Business, este con plantillas aprobadas por Meta) probado en staging con E11. |
| 🧑🚀 | **Proveedor de correo y de SMS o WhatsApp.** |

### M6 — Teleasistencia

| | Pendiente |
|---|---|
| 🔧 | Todo el módulo: alerta, medicamentos, signos vitales y tiempo real (SSE). |
| ⚖️🚀 | **Rangos de signos vitales y tolerancia de medicamentos**, definidos por un profesional de salud. |
| ⚖️🚀 | **Aviso de alcance** (no es un servicio de emergencias ni un dispositivo médico) revisado por asesoría legal. |
| 🧑 | Cifrado de las columnas clínicas y plazos de retención. |

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
| F0 — Base de integración | 🔧 Cliente HTTP, configuración, servicios `server-only` y `proxy.ts`. **Se puede construir ya.** |
| F1 — Identidad | 🔧 Registro, inicio de sesión, **olvidé mi contraseña**, cambiar contraseña, alta del adulto mayor y consentimiento. |
| F2 a F9 | 🔧 Una por cada módulo M2 a M9 (directorio, cotización, contratación con vista mínima del cuidador, avisos, teleasistencia, pagos y bolsas, mensajes, administración). |
| 🧑 | **Pruebas de usabilidad** con adultos mayores y familiares reales (E4, E5). |
| 🧑 | Quitar de la landing los textos y cifras de demostración. |
| 🧑 | Decidir **dominios y cookies**: subdominios del mismo sitio (`app.…` y `api.…`) o reescrituras. |

---

## Cómo se usa este archivo

1. Al terminar un PR, **se borra de aquí lo que quedó hecho** y se anota en [AVANCE.md](./AVANCE.md).
2. Lo que se deja a un lado a propósito se agrega a «Decisiones tomadas a un lado», con la fecha.
3. Lo que bloquea el lanzamiento lleva 🚀: antes de abrir a usuarios reales no debe quedar ninguno.
