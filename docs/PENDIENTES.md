# Seniory — Lo que nos va quedando pendiente

**Se actualiza al terminar cada PR.** Aquí va solo lo que **falta o se dejó para después**, ordenado por etapa del plan. Lo que ya se hizo está en [AVANCE.md](./AVANCE.md). Las decisiones abiertas completas, con su responsable, están en el [plan del backend §10](./PLAN_BACKEND_SENIORY.md) y los requisitos para lanzar en el [§12](./PLAN_BACKEND_SENIORY.md).

**Leyenda del tipo:** 🧑 decisión o trabajo de una persona (no de código) · 🔧 código que falta · ⚖️ legal o de negocio · 🚀 bloquea el lanzamiento

---

## Decisiones tomadas a un lado («por ahora no»)

| Tema | Estado | Qué se necesita |
|---|---|---|
| 🚀 **Proveedor de correo** | **Aplazado por decisión del equipo** (2026-10-31); el adaptador ya existe (2026-11-16) | La decisión de negocio (comprometerse con Resend u otro) sigue abierta, pero el código ya está listo para los dos puertos: `EnviadorDeRecuperacion` (M1, `CANAL_DE_RECUPERACION=resend`) y `CanalDeNotificacion` (M5, `CANAL_DE_CORREO_PARA_AVISOS=resend`), ambos con las mismas credenciales `RESEND_API_KEY`/`RESEND_CORREO_DESDE`. Mientras no haya un dominio propio verificado en Resend, ninguno de los dos entrega a usuarios reales — solo al correo de la cuenta de Resend. |
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
| 🔧 | **Actualización de seguridad de Next.js** (aplazada por decisión del equipo, 2026-11-28): al correr `next dev`, la CLI de Next.js 16.4.2 avisa que esa versión tiene una vulnerabilidad conocida y sugiere `next upgrade --agent=security`. No se ha verificado el aviso ni se ha actualizado nada. Antes de lanzar: confirmar de qué versión se corrige, actualizar en un PR aparte y pasar las pruebas del frontend (unitarias y de recorrido). |
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
| 🧑 | **Segundo factor obligatorio para administradores** (decisión 4, M10): el TOTP ya está construido y cada administrador lo activa por su cuenta (`segundo-factor.controller.ts`); falta decidir si antes de producción debe ser obligatorio para todos, no solo opcional. |
| ✅ | ~~Verificar el correo de las cuentas.~~ Resuelto (2026-11-28): enlace por correo al registrarse (`/verificar-correo`), aviso «Confirma tu correo» con reenvío, y ningún correo sale a una dirección sin confirmar. Las cuentas de cuidadores que carga Directorio nacen sin confirmar y lo hacen desde su panel. |
| 🔧 | **Teléfono verificado** (SMS/WhatsApp): hoy solo el correo se confirma; cuando haya proveedor de SMS, el mismo criterio debe aplicarse al teléfono antes de enviar avisos. |
| 🔧 | Tarea programada diaria que borre las sesiones y los enlaces de recuperación vencidos (los repositorios ya tienen el método; falta programarla, M10). |
| 🧑 | **Bloqueo de cuenta como vector de denegación de servicio** (decisión 7): que los fallos caduquen con el tiempo y desbloquear por correo (M10). |
| 🔧 | Rotar el secreto de firma de los tokens sin invalidar los de acceso vigentes: hoy acepta una sola clave. |
| 🔧 | Reintentos del envío del enlace de recuperación (hoy, si el canal falla, la persona pide otro): llegan con Notificaciones (M5). |
| 🔧🚀 | **Foto de perfil de la familia** (pedido 2026-11-16, importante): hoy solo el cuidador tiene foto (`AlmacenDeArchivos` vive solo en Directorio). Para que la familia también pueda subir la suya desde «Mi cuenta» hay que: (1) mover `AlmacenDeArchivos` y su adaptador de Cloudinary de Directorio a `compartido`, para que Identidad pueda usarlo sin romper las reglas de dependencia; (2) campo de foto en `Usuario` (migración); (3) caso de uso y endpoint `PUT /yo/foto` (mismo patrón que `PUT /cuidadores/yo/foto`); (4) la pantalla de Mi Cuenta en el frontend. |

### M2 — Directorio (lectura)  *(backend y frontend construidos, incluida la búsqueda por cercanía)*

| | Pendiente |
|---|---|
| 🧑🚀 | **Cargar los primeros cuidadores reales** con `npm run cuidadores:importar`: quién revisa los documentos, en cuánto tiempo y con qué vigencia (procedimiento operativo), y el archivo revisado. Sin ellos, el directorio de producción está vacío por diseño. |
| ✅ | ~~**Programar `npm run cuidadores:revisar-vigencias` cada día** (cron del hosting).~~ Resuelto (2026-11-16): `SondeoDeVigencias` corre esta revisión sola dentro de la app, cada `INTERVALO_REVISION_DE_VIGENCIAS_MS` (1 hora por defecto); ya no depende de un cron del hosting. El comando sigue para forzarla a mano. |
| 🔧 | La búsqueda normaliza el texto en la aplicación (sin `unaccent`) y usa `LIKE` sobre columnas normalizadas con índices `pg_trgm`. Revisar con `EXPLAIN` cuando haya volumen real. |
| 🔧 | La ruta `GET /cuidadores/:id/hoja-de-vida` responde un 302 hacia el API: el BFF (F2) decide si lo sigue por el servidor o redirige al navegador. |
| 🔧 | Frontend: `cuidadores.ts` y el buscador contra la API (F2). |
| 🧑 | Confirmar la **licencia de las fotos** de la landing (`frontend/public/img/*.jpg`) antes del lanzamiento. |

*Resuelto en M2:* el directorio exige sesión y pasa por el límite global de peticiones (100 por minuto por IP); un límite propio y más estricto queda para M10 si hace falta. Las pruebas de contrato e integración de la búsqueda por cercanía ya corrieron contra Postgres real (2026-11-09, con Docker disponible): encontraron y se corrigieron tres fallas — `Permissions-Policy` bloqueaba la geolocalización en todo el sitio, el CSP no dejaba cargar los tiles de OpenStreetMap, y el radio terrestre de la fórmula de Haversine en JS (6371 km) no coincidía con el de `earthdistance` en Postgres (6378,168 km), lo que rompía la paginación por cursor de distancia (repetía la última fila para siempre). Las 1320 pruebas de integración y las de contrato del directorio quedan en verde. **Almacén de archivos real:** ya se construyó el adaptador de Cloudinary (`AlmacenDeArchivosCloudinary`, `ALMACEN_DE_ARCHIVOS=cloudinary`); las fotos de perfil quedan públicas y los documentos privados con dirección firmada — con una diferencia frente al almacén local: la firma de Cloudinary no vence por sí sola (su función de pago «token-based authentication» no está activada todavía), aunque sigue sin poder adivinarse sin las credenciales del servidor.

### M3 — Pagos I: cotización  *(backend construido)*

| | Pendiente |
|---|---|
| ⚖️🚀 | **Comisiones aprobadas** (8 % a la familia y 10 % al cuidador de la política 1 son «ilustrativas»). Cambiarlas es insertar una política nueva con otra versión y fecha de inicio; no hace falta tocar código. |
| 🔧 | Frontend (F3): verificar `lib/pricing.ts` contra `backend/pruebas/vectores/precios.json` y corregir el pago al profesional a `subtotal − round(subtotal × 0,1)` (hoy difiere con montos de pesos sueltos). |
| 🔧 | Pantalla o comando para que un administrador cree una política nueva sin SQL (M10). |

### M4 — Reservas  *(backend construido)*

| | Pendiente |
|---|---|
| ✅ | ~~**Política de cancelación y reembolso.**~~ Decidido (2026-11-15): con 2 horas o más de anticipación se devuelve todo; con menos, se reparte mitad y mitad entre el reembolso a la familia y la compensación al cuidador (`ReembolsarServicioCancelado`). |
| 🧑 | **Cómo pasa un servicio a «en curso»:** hoy el cuidador marca el inicio (check-in), solo dentro de su franja o hasta 30 minutos antes. Decidir si además debe ser automático. |
| ✅ | ~~**Servicios aceptados que nunca se iniciaron.**~~ Decidido (2026-11-15): `SondeoDeNoShows` los cancela (motivo «no_show») cuando la franja termina sin que nadie marcara que inició. |
| 🔧 | **Exigir el pago aprobado para iniciar:** ya está hecho (`REQUIERE_PAGO_APROBADO`, obligatorio en staging y producción). En desarrollo viene apagado para poder probar sin pagar. |
| 🔧 | Que el cuidador defina su propia `aceptacionAutomatica`: ya está hecho (`PATCH /cuidadores/yo`, M9). |
| 🧑 | **Anticipación máxima de 180 días** y **plazos de aceptación** (2 h, o 30 min si es para hoy) están en el dominio como constantes: confirmarlos con el equipo. |
| ✅ | ~~Una franja de 6 h admite servicios de hasta 8 h: decidir si las horas deben caber en la franja.~~ Resuelto (2026-11-22): la familia ahora elige la **hora de inicio exacta** (bloques de 30 min), no una franja completa; un servicio puede cruzar de una franja a otra (p. ej. 11:30–13:30). `jornada` queda solo como clasificación para la disponibilidad general del cuidador. |
| 🧑 | Horas exactas de cada franja (mañana 06–12, tarde 12–18, noche 18–06): decididas el 2026-10-26; confirmar con el negocio. |
| ⚖️ | Evaluar un seguro de responsabilidad civil y el manejo de quejas entre familias y cuidadores. |
| ✅ | ~~**Por revisar (2026-11-19):** la hora exacta la coordinan familia y cuidador por chat, pero la cancelación mide contra el inicio fijo de la franja, no contra esa hora.~~ Resuelto (2026-11-22): ya no hace falta coordinarla por chat — la familia la elige al contratar, y la cancelación mide la anticipación contra esa hora real (`horasDeAnticipacion` ya no usa el límite fijo de la franja). |
| ✅ | ~~**Contratar uno o varios cuidadores a la vez.**~~ Resuelto (2026-11-20): carrito en `/app/contratar/carrito` — selección múltiple en la búsqueda, cada cuidador con su propia fecha/franja/horas, total combinado, bolsa como saldo compartido, y envío con reintento individual si uno falla. |

### M5 — Notificaciones  *(backend construido)*

| | Pendiente |
|---|---|
| 🧑🚀 | **Proveedor de SMS o WhatsApp** (push y un dominio verificado en Resend también). Hoy los canales reales son la aplicación (la campana) y el correo (`CanalDeCorreoResend`, 2026-11-16, apagado por defecto); SMS, WhatsApp y push no se registran hasta que haya proveedor. **Sin un canal confiable fuera de la app para quien no tiene correo a mano, una alerta de teleasistencia solo llegaría a quien tenga la app abierta: no se puede lanzar así.** |
| 🔧🚀 | **Un adaptador por canal real** (`CanalDeNotificacion`) y probar el tiempo de entrega de alertas en staging con el canal real (E11): `entregada_en − creada_en` ya queda guardado en cada aviso. |
| 🔧 | **Confirmación de entrega** de SMS y WhatsApp: hoy un canal con proveedor responde `enviada` (aceptado) y no pasa a `entregada`; falta el webhook del proveedor que lo confirme. |
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
| 🧑 | **Idea (2026-11-17, sin construir):** itinerario o rutina diaria para la persona mayor (comidas, higiene, caminata, hidratación, actividades), con el mismo patrón de días/horario/vigencia y seguimiento de cumplimiento que ya tiene `Medicamento`. Le da a la familia una forma concreta de decir qué espera del cuidador, en vez de algo vago. No bloquea el lanzamiento; se valida con el piloto si las familias realmente lo usarían antes de construirlo. |
| 🧑 | **Por revisar (2026-11-19):** mejorar el módulo de teleasistencia en general — sin alcance definido todavía, queda por conversar qué mejorar primero (ver también la idea de la rutina diaria, arriba). |

### M7 — Pagos II: cobro, bolsas y liquidación  *(backend construido)*

| | Pendiente |
|---|---|
| ✅ | ~~**Elegir la pasarela de pagos.**~~ Decidido: Mercado Pago (Wompi quedó descartado por ahora: pide RUT y actividad comercial que todavía no hay). `PasarelaDeMercadoPago` (Checkout Pro / Orders API) ya está **construida y conectada** — crea el cobro, consulta estado, reembolsa, verifica la firma del webhook por HMAC-SHA256 e interpreta el aviso (`pasarela-mercadopago.ts`, con sus pruebas unitarias). Falta configurar `MERCADOPAGO_ACCESS_TOKEN`/`MERCADOPAGO_SECRETO_DE_FIRMA` reales (hoy solo hay simulada/deshabilitada fuera de desarrollo) y **probar el webhook real en staging**. |
| ✅ | ~~**Cómo se le paga al cuidador.**~~ Resuelto (2026-11-21): para el piloto, un administrador transfiere de verdad por fuera del sistema (Nequi, Daviplata, banco) y lo confirma con `PATCH /liquidaciones/:id/confirmar-pago` (`DispersorManual`, `ConfirmarPagoDeLiquidacion`, cola en `GET /liquidaciones/por-pagar`). Los datos bancarios del cuidador se piden por fuera de la app por ahora. Se evaluó automatizarlo con el «Split de Pagos» de Mercado Pago y se aplazó: esa función **«solo está disponible si tu contacto comercial te compartió la información necesaria»** (no es autoservicio) y no se confirmó que esté disponible para Colombia; probablemente depende de tener primero empresa constituida y cuenta comercial aprobada (ver abajo). Retomar cuando haya volumen que lo justifique. |
| ⚖️🚀 | **Bolsa en pesos u horas, sus paquetes y descuentos.** La tabla de paquetes está **vacía** hasta que el negocio los apruebe (el saldo ya se lleva en pesos; `horas_referencia` es solo para mostrar). `GET /catalogo/bolsas` devuelve la lista vacía mientras tanto. |
| ✅ | ~~**Política de cancelación tardía.**~~ Decidido (2026-11-15): con menos de 2 horas de anticipación, mitad y mitad entre la familia y el cuidador (`ReembolsarServicioCancelado`, `HORAS_MINIMAS_PARA_CANCELAR_GRATIS`). |
| ⚖️🚀 | Empresa constituida, cuenta comercial aprobada, **facturación electrónica ante la DIAN** y tratamiento de retenciones. |
| 🔧 | **Conciliación diaria** contra el reporte de la pasarela (tabla `conciliaciones`): hoy solo se recupera cada pago pendiente preguntándole su estado antes de vencerlo. Depende del reporte del proveedor. |
| 🔧 | **Pagos tardíos y reembolsos fallidos** (`pagos.aprobacion_tardia`, `pagos.reembolso_tardio_fallido` en la auditoría): hoy los atiende una persona; falta una alarma (Sentry) y una pantalla para el administrador (M10). |
| 🔧 | **Liquidaciones `fallidas`** (rechazo definitivo del dispersor): no se reintentan solas; falta la acción de administrador para corregir la cuenta y reintentar (`Liquidacion.reintentar` ya existe), y confirmar las `enviadas` por el webhook del dispersor. |
| 🔧 | **Datos de la cuenta del cuidador** (banco, número, titular, cifrados): hoy el dispersor recibe solo el id del cuidador. Llega con M9 (registro del cuidador) y la elección del dispersor. |
| 🔧 | Un pago de servicio con **cobro parcial o con propina**, y **reembolsos parciales**: no están en el alcance. |
| 🧑 | **Por revisar (2026-11-19):** la lógica de cuándo se cobra — `REQUIERE_PAGO_APROBADO` exige el pago antes de que el cuidador pueda iniciar el servicio; confirmar que esto no contradice la regla de negocio que se había explicado de que el cobro es «al final del servicio» (puede ser solo una diferencia de redacción: se cobra desde que el cuidador acepta, no al terminar, pero vale la pena dejarlo explícito en el texto que ve la familia). |
| 🧑 | **Por hacer (2026-11-19):** crear las cuentas de prueba de Mercado Pago (una Vendedor y una Comprador, del mismo país) desde el panel de desarrolladores, para poder probar pagos de principio a fin sin el error «una de las partes es de prueba». |

### M8 — Mensajería  *(backend construido)*

| | Pendiente |
|---|---|
| 🧑 | **Cuánto tiempo sigue legible una conversación** después de terminar el servicio. Hoy es **para siempre** para sus dos partes (escribir sí se corta al terminar el servicio). Decidir con asesoría legal el plazo de conservación y la supresión (Ley 1581). |
| 🔧 | **Marcar como leídos** y contar los no leídos: la columna `leido_en` existe, falta el caso de uso y mostrarlo en la lista. Y una vista previa del último mensaje en `GET /conversaciones`. |
| 🔧 | **Reportar o bloquear** una conversación abusiva, y moderación: hoy solo hay el tope de 60 mensajes por minuto por IP. |
| 🔧 | **Varias instancias:** el flujo en vivo consulta la base cada 2 s y no depende de la memoria, pero solo el servidor que procesa el evento despierta a sus conexiones al instante. Para latencia inmediata en todas hará falta `LISTEN/NOTIFY` o un bus (decisión de hosting, M10). |
| 🔧 | **Flujo en vivo de Teleasistencia** (`GET /adultos-mayores/:id/eventos`, pendiente de M6): ya hay la infraestructura (`ConexionesDeFlujos`, patrón de `FlujoDeMensajes`); falta construirlo y que verifique el acceso en cada vuelta. |

### M9 — Directorio II: registro y verificación  *(backend construido)*

| | Pendiente |
|---|---|
| ⚖️🚀 | **Procedimiento de verificación:** quién revisa, en cuánto tiempo y con qué vigencia de cada control (hoy: antecedentes y psicotécnica **deben** traer fecha de vencimiento, máximo 5 años; títulos pueden no vencer; son propuestas provisionales), y los primeros cuidadores reales verificados. |
| 🧑🚀 | **Antivirus para los archivos subidos** (puerto `AnalizadorDeArchivos` del plan, no construido). Hoy solo se valida el formato por contenido y el tamaño. |
| 🔧 | **Quitar metadatos** de las imágenes subidas (EXIF con ubicación y fecha): hoy se guardan tal cual. Necesita una librería de imágenes. |
| 🔧 | **Avisar a los revisores** de que hay una postulación nueva (hoy la ven al abrir la cola) y **plazos de respuesta** a los cuidadores. |
| 🔧 | La **foto** del cuidador no se sube por la API (la base la admite): llega con el almacén real. |
| 🔧 | Que un control vencido **cancele o reasigne** los servicios futuros del cuidador (hoy Reservas recibe `cuidador_oculto` pero no actúa), y una pantalla de administrador para suspender o reactivar cuidadores (`suspender` existe en el dominio). |
| 🔧 | **Eliminar los documentos** de quien se retira o los rechazados, y los plazos de conservación (Ley 1581). |
| 🔧 | Frontend: registro del cuidador, carga de documentos (envío como cuerpo binario, no multipart) y panel de revisión. |
| 🧑 | **Alojamiento de archivos en S3** (en vez de o además de Cloudinary) para servir archivos y vistas a nivel global. Decisión del equipo (2026-11-16): **por ahora no se hace**; queda anotado para revisar más adelante. |

*Resuelto en M9:* el almacén real de archivos ya existe (`ALMACEN_DE_ARCHIVOS=cloudinary`, ver M2) — ya se pueden subir documentos de verificación y foto de perfil sin depender de un disco que se pierde en cada despliegue. De paso se corrigió un bug real: detrás de un proxy (Render), la validación de «mismo origen» de las rutas de subida del frontend comparaba contra el host INTERNO del proceso en vez del dominio público, así que toda subida devolvía 403 sin importar el almacén.

### M10 — Endurecimiento y producción  *(construido lo que no depende del hosting)*

Construido: imagen de Docker y CI que la verifica (arranque seguro), rol de base de datos de la aplicación con permisos mínimos, estado del outbox para el monitor, guarda de migraciones sin datos de prueba, ensayo de restauración y los documentos [OPERACION](./OPERACION.md) y [SEGURIDAD](./SEGURIDAD.md).

| | Pendiente |
|---|---|
| 🚀 | **Elegir el hosting** y con él: desplegar (M0 PR 7), TLS, registro de imágenes, secretos rotados, respaldos automáticos del proveedor y **ensayo de restauración con el respaldo real** (antes del lanzamiento y cada trimestre), y un monitor externo que consulte `/salud/listo` y `/api/v1/salud/operacion` con las alertas propuestas en OPERACION. |
| 🚀 | **Sentry** (`SENTRY_DSN`) y los tableros de errores 5xx, retraso del outbox y latencia de alertas (la medición E11 ya se registra; falta graficarla). |
| 🔧🚀 | **Prueba de carga ligera** (búsqueda de cuidadores, alertas) y revisión de índices con volumen real; ajustar los límites de peticiones con sus resultados. |
| 🔧 | **Un rol de base de datos por módulo.** Hoy hay uno de mínimos permisos para toda la aplicación, porque los módulos comparten transacciones (p. ej. importar un cuidador escribe en Identidad y Directorio). Separarlos pide rediseñar esas transacciones: necesita su propio ADR. |
| 🔧 | **Exportar y suprimir los datos de una persona** (Ley 1581; PR 8 de M1) y los plazos de retención. Pide decisión legal sobre qué se conserva (registros financieros, de salud, auditoría). |
| 🔧 | **Verificación del correo**, cifrado de columnas clínicas, quitar metadatos de imágenes y antivirus (ver [SEGURIDAD](./SEGURIDAD.md)). |
| 🔧 | Publicar los contratos **OpenAPI y AsyncAPI** versionados. |
| 🧑 | Definir con el equipo la **guardia, la comunicación de caídas** y el contacto con la SIC ante un incidente con datos personales; la periodicidad de rotación de secretos. |
| ⚖️🚀 | Los requisitos de la [sección 12 del plan](./PLAN_BACKEND_SENIORY.md): términos y condiciones, política de datos, atención de consultas y reclamos (SIC), soporte, piloto cerrado con unas 20 familias. |

### M11 — IA *(opcional)*

| | Pendiente |
|---|---|
| 🧑 | Definir el alcance con el equipo y escribir su propio ADR antes de implementar. |

---

## Frontend

El frontend se conecta al backend módulo por módulo, en el orden del [plan v2](./PLAN_FRONTEND_SENIORY.md#4-módulos-del-frontend-y-orden-de-construcción): F1, F2, F3+F4, F7, F6, F8, F5, F9 y F10. **F0 a F9 están construidos** (ya no queda ningún dato de ejemplo: `frontend/data/` se borró en F8); falta F10, el cierre para producción.

| Etapa | Pendiente |
|---|---|
| F1 — Identidad *(construido)* | 🔧 `instrumentation.ts` que impida arrancar en producción sin `SENIORY_API_URL` y `SENIORY_BFF_SECRETO` (hoy la primera lectura falla con un mensaje claro, pero la app arranca). |
| ⚖️ | **Textos legales:** la política de tratamiento y el texto del consentimiento son versiones de trabajo (`v1`, marcadas en pantalla como pendientes de revisión legal). Hay que publicarlos revisados por un abogado y decidir **quién acepta el consentimiento** (hoy el familiar como representante). **Bloquea el lanzamiento.** |
| 🔧 | **Retirar la autorización de salud:** el texto promete «puedes retirarla cuando quieras» y el backend tiene `DELETE /consentimientos/:id`, pero `GET /yo` no devuelve el id del consentimiento, así que la pantalla no puede ofrecerlo. Falta exponer el id en `/yo` (backend) y una pantalla en «Mi cuenta» (frontend). |
| 🔧 | **Perfil:** cambiar el nombre y el teléfono (`PATCH /yo` existe; falta la pantalla), y verificar el correo (llega con el canal de correo, M5). |
| 🔧 | **Varias personas a cuidar:** hoy la app usa la responsable (o la primera); falta elegir entre varias y agregar otra después de la bienvenida. |
| 🔧 | **Un solo comando de integración** (`npm run integracion:preparar`) y el job `integracion` de la CI (ver [INTEGRACION §1 y §8](./INTEGRACION_FRONTEND_BACKEND.md)). |
| F2 — Directorio *(construido)* | 🔧 **Backend:** que `GET /cuidadores` y `/cuidadores/:id` digan si hay hoja de vida pública (`tieneHojaDeVida`). Hoy el perfil lo averigua con una consulta extra y la tarjeta de la búsqueda no puede mostrar «hoja de vida disponible». |
| 🔧 | **Fotos de los cuidadores:** la API trae `fotoUrl` (hoy siempre nula; llega con el almacén real). Mientras, se muestran las iniciales. |
| 🔧 | **Reseñas:** solo las del backend; no hay paginación de reseñas (el perfil trae todas). Revisar cuando un cuidador tenga muchas. |
| 🔧 | **Cuidador en turno:** hasta F4 nadie aparece «en turno» (antes era uno inventado del prototipo). Desde F4 el cuidador en turno es el real, y desde F8 «Escribir» abre su chat real. |
| 🧑 | Los recorridos del directorio necesitan los cuidadores de `npm run semillas` (y uno importado con PDF para probar la hoja de vida); sin ellos algunos se omiten. |
| F3+F4 — Contratación *(construido)* | 🔧 **Pagar un servicio con la pasarela:** un servicio aceptado con medio «pasarela» necesita que la familia pague; la pantalla del servicio todavía no ofrece «Pagar» (llega con F7). Con la bolsa, el pago es inmediato. |
| 🔧 | **Avisos al cuidador:** hoy el cuidador solo ve una solicitud al abrir su panel; el aviso por correo/SMS/WhatsApp espera proveedor; la campana (F5) ya lo muestra al abrir la aplicación. Una solicitud sin respuesta vence a las 2 horas (30 minutos si es para hoy). |
| 🔧 | **Panel del cuidador:** separa Por responder / En curso / Próximos / Terminados / Cancelados *(resuelto el 2026-11-22)*, pero sigue mostrando solo los más recientes (sin «ver más»), sin calendario ni historial de pagos (liquidaciones en F7; su perfil y documentos ya están en F9). |
| ✅ | **Reprogramar** *(resuelto el 2026-11-22)*: mientras el cuidador no ha respondido, la familia puede cambiar fecha/hora/horas de la solicitud (`POST /servicios/:id/modificar`) en vez de cancelar y pedir de nuevo; el cuidador recibe un aviso nuevo y el plazo para responder se reinicia. Una vez aceptado, sigue aplicando cancelar y pedir de nuevo (la política de cancelación tardía ya está decidida, ver M4). |
| F7 — Pagos y bolsas *(construido)* | ⚖️🚀 **Pasarela y dispersor reales:** hoy solo hay la simulada (sin página de pago: el pago se aprueba con un aviso firmado que fabrican las pruebas). Con la pasarela real hay que revisar que la **página de retorno** lleve de vuelta a `/app/servicios/[id]` y, si hace falta, `URL_PUBLICA_DE_LA_API`/dominios. Ver [pagos/README](../backend/src/pagos/README.md). |
| ⚖️ | **Precios de las bolsas:** el catálogo está vacío en producción hasta que el negocio apruebe paquetes (las pruebas crean `prueba-5h` y `prueba-10h` **solo en la base local**). La landing y «Mi bolsa» ya los muestran en cuanto existan. |
| 🔧 | **La landing es dinámica** (lee el catálogo en cada visita) y por eso ya no es estática; si pesa en el rendimiento, cachear unos minutos. |
| 🔧 | **Historial de pagos de la familia** (hoy solo el de cada servicio y los movimientos de la bolsa) y comprobantes/facturas (decisión legal). |
| 🔧 | **Cobro de un pago vencido por la familia:** la pantalla dice que el servicio se cancela; no hay recordatorio previo hasta que existan los canales fuera de la app (la campana de F5 solo avisa dentro de la aplicación). |
| 🧑 | La base local acumula cuentas de prueba (correos `.invalid`) con cada corrida de los recorridos; no afecta a ningún entorno compartido. |
| F6 — Teleasistencia *(construido)* | 🔧 **Backend: flujo en vivo** (SSE, ya previsto en M6): hoy la pantalla se actualiza sola cada 15 s mientras se mira. Cuando exista, usará el mismo patrón que el chat. |
| 🔧 | **Backend: listar las alertas** y exponer sus ids: `GET …/resumen` solo trae cuántas hay sin atender, así que la pantalla las cuenta pero no puede ofrecer «marcar como atendida» (`PATCH /alertas/:id/atendida` ya existe). |
| ⚖️🧑 | **Rangos de referencia:** los de `RANGOS_POR_DEFECTO` son provisionales y los debe definir un profesional de salud antes de lanzar; falta la pantalla para que la familia cargue los de su médico (`PUT …/rangos-de-referencia`). La pantalla solo dice «fuera del rango esperado», sin cuál medida ni qué significa. |
| 🔧 | **Medicamentos:** hoy solo diarios (el backend admite días de la semana y vigencias) y sin editar (se deja de tomar y se agrega de nuevo). La lista de «administrar» muestra los que se toman hoy. |
| 🔧 | **El cuidador en turno** puede leer y marcar tomas según el backend (si tiene un servicio activo ahora); su pantalla no está construida: hoy solo la familia usa la teleasistencia. |
| 🔧 | **Avisos de cada toma** con la app cerrada: dependen de los canales fuera de la app (correo, SMS, WhatsApp; la campana de F5 solo avisa dentro de la aplicación); la alarma sonora funciona solo con la pantalla abierta. |
| ⚖️ | **Aviso legal del alcance de la teleasistencia** (no es un servicio de emergencias ni un dispositivo médico): ya se dice en pantalla; falta el texto aprobado en los términos. |
| 🔧 | **«Gratis»**: el distintivo de la pantalla viene del prototipo; confirmar con el negocio que la teleasistencia seguirá siendo gratuita. |
| F8 — Mensajería *(construido)* | 🔧 **Avisos de mensaje nuevo:** hoy el mensaje solo llega en vivo si la otra persona tiene el chat (o la app) abierto; la campana (F5) lo muestra al abrir la aplicación, pero sin correo/WhatsApp (espera proveedor) nadie se entera de un mensaje con la app cerrada. |
| 🔧 | **Mensajes no leídos:** la API no deja marcar ni consultar «leído» (la tabla tiene la columna, pero no hay ruta), así que la lista no cuenta ni marca pendientes y la pantalla no inventa un «visto». Si el negocio lo pide, es un cambio del backend. |
| 🔧 | **Muchas conexiones:** el backend permite 5 flujos en vivo por persona; con más pestañas abiertas las sobrantes caen al respaldo (consulta cada 10 s). Al elegir el hosting hay que comprobar que su proxy no almacene en búfer ni recorte las conexiones largas del flujo en vivo (`/api/mensajeria/eventos`); con varias instancias del backend, además, el aviso inmediato solo llega a la que procesó el evento y las demás lo reciben en su revisión de cada 2 s (ver [OPERACION](./OPERACION.md)). |
| F5 — Notificaciones *(construido)* | 🔧 **«Leído» en el servidor:** el punto de la campana se decide por dispositivo (cookie) porque la API no deja marcar avisos como leídos; si el negocio quiere que se sincronice entre dispositivos o contar cuántos faltan, es un cambio del backend (ya anotado en M5). |
| 🔧 | **Avisos en vivo:** la campana se actualiza al abrir o recargar una pantalla (la entrega del backend tarda hasta unos segundos); no hay flujo en vivo de avisos, a diferencia del chat. |
| 🔧 | **Enlaces a un servicio concreto:** el aviso no trae el id del servicio, así que lleva a la lista (`/app/servicios`) y no al detalle. Si se quiere, el backend tendría que incluir el destino en el aviso. |
| F9 — Postulación y revisión *(construido)* | 🔧 **Backend: la cola de revisión** entrega solo las 50 verificaciones **más antiguas** de cada estado, sin paginar ni ordenar de la más reciente a la más antigua. Con más de 50 por revisar, las siguientes aparecen al decidir las primeras; y en «Aprobadas», «Rechazadas» y «Vencidas» no salen las recientes. El panel avisa cuando llega al tope. Hay que paginar y ordenar por fecha de decisión en el backend. |
| 🔧 | **Avisar a los revisores:** nada les avisa de una postulación nueva (la campana de F5 es solo del cuidador y de las familias): hoy el panel se consulta. Falta un aviso (correo o el canal que se elija) cuando entra una verificación a la cola. |
| 🔧 | **Administradores:** solo se crean por consola (`npm run crear-admin`); no hay pantalla para invitar o quitar revisores, ni segundo factor (decisión abierta en M9). |
| 🔧 | **Documentos propios:** el cuidador sube y reemplaza, pero no puede borrar ni descargar lo que subió; el derecho de supresión de sus datos se resuelve en F10. |
| F10 — Cierre para producción *(construido)* | 🧑 **Sentry:** falta la cuenta y el `SENTRY_DSN` (ya anotado arriba, M0); mientras no exista, el frontend no instala `@sentry/nextjs` (es una dependencia nueva, y sin DSN quedaría sin configurar). Los errores del servidor ya traen un `digest` para buscarlos en el log; conectarlos a Sentry es agregar el SDK cuando haya cuenta. |
| 🧑 | **Exportar y eliminar la cuenta** (Ley 1581): el backend todavía no tiene esas rutas (quedó anotado como opcional en M1, PR 8); el frontend las construye cuando existan. Hoy «eliminar tus datos» en la política de privacidad dice que el canal se publicará antes del lanzamiento. |
| 🧑 | **Lighthouse:** no se corrió en esta sesión (la CLI pide descargar un paquete que la política de la sesión no permitió ejecutar). Córrelo contra la build de producción (`npm run build && npx next start`) en landing, ingresar, registro, perfil del cuidador y teleasistencia antes de lanzar; accesibilidad ≥ 90 (F10 §3.5). |
| 🔧 | **CSP sin nonces:** `next.config.ts` manda `script-src`/`style-src` con `unsafe-inline` (no hay orígenes externos: el navegador solo habla con este servidor). Un nonce por petición sería más estricto, pero fuerza TODA la aplicación a renderizarse dinámicamente (la guía de Next lo advierte: sin caché de CDN, más carga en el servidor) — ver `docs/frontend/F10-cierre.md`. Revisar si vale la pena al elegir el hosting. |
| 🧑🚀 | **Dominio y `URL_PUBLICA_DEL_SITIO`:** sin ellos, `robots.txt`, `sitemap.xml` y Open Graph usan `localhost` (en Vercel se completa sola). Hay que fijarla al elegir el hosting. |
| 🔧 | **Vulnerabilidades de las dependencias del frontend** (`npm audit`: 15 en producción, casi todas por `shadcn` y `zod`; arreglarlas obliga a subir `shadcn` a una versión mayor). `shadcn` es una herramienta de desarrollo y no debería estar en `dependencies`. |
| 🧑 | **Pruebas de usabilidad** con adultos mayores y familiares reales (E4, E5). |
| 🧑 | Decidir **dominios y cookies**: subdominios del mismo sitio (`app.…` y `api.…`) o reescrituras. |

---

## Cómo se usa este archivo

1. Al terminar un PR, **se borra de aquí lo que quedó hecho** y se anota en [AVANCE.md](./AVANCE.md).
2. Lo que se deja a un lado a propósito se agrega a «Decisiones tomadas a un lado», con la fecha.
3. Lo que bloquea el lanzamiento lleva 🚀: antes de abrir a usuarios reales no debe quedar ninguno.
