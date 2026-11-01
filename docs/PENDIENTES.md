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
| ⚖️🚀 | **Política de cancelación y reembolso.** El evento `servicio_cancelado` ya lleva las horas de anticipación; Pagos (M7) hoy **siempre devuelve todo**. Cuando el negocio la defina, se aplica en `ReembolsarServicioCancelado`. |
| 🧑 | **Cómo pasa un servicio a «en curso»:** hoy el cuidador marca el inicio (check-in), solo dentro de su franja o hasta 30 minutos antes. Decidir si además debe ser automático. |
| 🔧 | **Servicios aceptados que nunca se iniciaron** (el cuidador no llegó, o no marcó): hoy se quedan «aceptado» para siempre. Falta decidir qué pasa (marcar «no se presentó», avisar, reembolsar) — M10. |
| 🔧 | **Exigir el pago aprobado para iniciar:** ya está hecho (`REQUIERE_PAGO_APROBADO`, obligatorio en staging y producción). En desarrollo viene apagado para poder probar sin pagar. |
| 🔧 | Que el cuidador defina su propia `aceptacionAutomatica`: ya está hecho (`PATCH /cuidadores/yo`, M9). |
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

### M7 — Pagos II: cobro, bolsas y liquidación  *(backend construido)*

| | Pendiente |
|---|---|
| 🧑🚀 | **Elegir la pasarela de pagos** (que acepte marketplace y devoluciones) y **cómo se le paga al cuidador** (transferencia, dispersión de la pasarela). Hoy hay una pasarela y un dispersor **simulados** (solo desarrollo, pruebas y staging; la configuración los prohíbe en producción) y uno **deshabilitado** que responde «no disponible». **Sin esto no se puede cobrar en producción:** con `REQUIERE_PAGO_APROBADO=true` ningún servicio podría iniciar. |
| 🔧🚀 | **Un adaptador por proveedor** (`PasarelaDePagos` y `DispersorDePagos`): crear el cobro con el id del pago como referencia, consultar estado, reembolsar con clave de idempotencia, **verificar la firma sobre el cuerpo crudo** e interpretar el aviso. El adaptador debe quitar los datos de tarjeta antes de guardar el aviso. Probar el webhook real en staging. |
| ⚖️🚀 | **Bolsa en pesos u horas, sus paquetes y descuentos.** La tabla de paquetes está **vacía** hasta que el negocio los apruebe (el saldo ya se lleva en pesos; `horas_referencia` es solo para mostrar). `GET /catalogo/bolsas` devuelve la lista vacía mientras tanto. |
| ⚖️🚀 | **Política de cancelación tardía.** Hoy se devuelve todo siempre; si la familia debe perder algo, hay que decidir qué pasa con ese dinero (¿se liquida al cuidador, parcial?). `servicio_cancelado` ya trae `horasDeAnticipacion`. |
| ⚖️🚀 | Empresa constituida, cuenta comercial aprobada, **facturación electrónica ante la DIAN** y tratamiento de retenciones. |
| 🔧 | **Conciliación diaria** contra el reporte de la pasarela (tabla `conciliaciones`): hoy solo se recupera cada pago pendiente preguntándole su estado antes de vencerlo. Depende del reporte del proveedor. |
| 🔧 | **Pagos tardíos y reembolsos fallidos** (`pagos.aprobacion_tardia`, `pagos.reembolso_tardio_fallido` en la auditoría): hoy los atiende una persona; falta una alarma (Sentry) y una pantalla para el administrador (M10). |
| 🔧 | **Liquidaciones `fallidas`** (rechazo definitivo del dispersor): no se reintentan solas; falta la acción de administrador para corregir la cuenta y reintentar (`Liquidacion.reintentar` ya existe), y confirmar las `enviadas` por el webhook del dispersor. |
| 🔧 | **Datos de la cuenta del cuidador** (banco, número, titular, cifrados): hoy el dispersor recibe solo el id del cuidador. Llega con M9 (registro del cuidador) y la elección del dispersor. |
| 🔧 | Un pago de servicio con **cobro parcial o con propina**, y **reembolsos parciales**: no están en el alcance. |
| 🔧 | Frontend (F3 y F4): `/bolsa` y la compra con `Idempotency-Key`, el enlace de pago, el estado «falta pagar» del servicio y la vista de liquidaciones del cuidador. |

### M8 — Mensajería  *(backend construido)*

| | Pendiente |
|---|---|
| 🧑 | **Cuánto tiempo sigue legible una conversación** después de terminar el servicio. Hoy es **para siempre** para sus dos partes (escribir sí se corta al terminar el servicio). Decidir con asesoría legal el plazo de conservación y la supresión (Ley 1581). |
| 🔧 | **Marcar como leídos** y contar los no leídos: la columna `leido_en` existe, falta el caso de uso y mostrarlo en la lista. Y una vista previa del último mensaje en `GET /conversaciones`. |
| 🔧 | **Reportar o bloquear** una conversación abusiva, y moderación: hoy solo hay el tope de 60 mensajes por minuto por IP. |
| 🔧 | **Varias instancias:** el flujo en vivo consulta la base cada 2 s y no depende de la memoria, pero solo el servidor que procesa el evento despierta a sus conexiones al instante. Para latencia inmediata en todas hará falta `LISTEN/NOTIFY` o un bus (decisión de hosting, M10). |
| 🔧 | **Flujo en vivo de Teleasistencia** (`GET /adultos-mayores/:id/eventos`, pendiente de M6): ya hay la infraestructura (`ConexionesDeFlujos`, patrón de `FlujoDeMensajes`); falta construirlo y que verifique el acceso en cada vuelta. |
| 🔧 | Frontend (F4): `mensajeria.ts`, quitar las respuestas automáticas y los indicadores simulados de `ChatMensajes`, `EventSource` con reconexión y **reconocer los mensajes por su `id`** (el flujo entrega al menos una vez). |

### M9 — Directorio II: registro y verificación  *(backend construido)*

| | Pendiente |
|---|---|
| ⚖️🚀 | **Procedimiento de verificación:** quién revisa, en cuánto tiempo y con qué vigencia de cada control (hoy: antecedentes y psicotécnica **deben** traer fecha de vencimiento, máximo 5 años; títulos pueden no vencer; son propuestas provisionales), y los primeros cuidadores reales verificados. |
| 🧑🚀 | **Antivirus para los archivos subidos** (puerto `AnalizadorDeArchivos` del plan, no construido). Hoy solo se valida el formato por contenido y el tamaño. |
| 🔧🚀 | **Almacén real de archivos:** el local no se admite en producción, así que **sin bucket privado no se pueden subir documentos** (responde 503). Depende del hosting. |
| 🔧 | **Quitar metadatos** de las imágenes subidas (EXIF con ubicación y fecha): hoy se guardan tal cual. Necesita una librería de imágenes. |
| ⚖️🚀 | **Segundo factor para administradores** (el panel de revisores decide quién se muestra a las familias). Hoy basta la contraseña. |
| 🔧 | **Avisar a los revisores** de que hay una postulación nueva (hoy la ven al abrir la cola) y **plazos de respuesta** a los cuidadores. |
| 🔧 | La **foto** del cuidador no se sube por la API (la base la admite): llega con el almacén real. |
| 🔧 | Que un control vencido **cancele o reasigne** los servicios futuros del cuidador (hoy Reservas recibe `cuidador_oculto` pero no actúa), y una pantalla de administrador para suspender o reactivar cuidadores (`suspender` existe en el dominio). |
| 🔧 | **Eliminar los documentos** de quien se retira o los rechazados, y los plazos de conservación (Ley 1581). |
| 🔧 | Frontend: registro del cuidador, carga de documentos (envío como cuerpo binario, no multipart) y panel de revisión. |

### M10 — Endurecimiento y producción  *(construido lo que no depende del hosting)*

Construido: imagen de Docker y CI que la verifica (arranque seguro), rol de base de datos de la aplicación con permisos mínimos, estado del outbox para el monitor, guarda de migraciones sin datos de prueba, ensayo de restauración y los documentos [OPERACION](./OPERACION.md) y [SEGURIDAD](./SEGURIDAD.md).

| | Pendiente |
|---|---|
| 🚀 | **Elegir el hosting** y con él: desplegar (M0 PR 7), TLS, registro de imágenes, secretos rotados, respaldos automáticos del proveedor y **ensayo de restauración con el respaldo real** (antes del lanzamiento y cada trimestre), y un monitor externo que consulte `/salud/listo` y `/api/v1/salud/operacion` con las alertas propuestas en OPERACION. |
| 🚀 | **Sentry** (`SENTRY_DSN`) y los tableros de errores 5xx, retraso del outbox y latencia de alertas (la medición E11 ya se registra; falta graficarla). |
| 🔧🚀 | **Prueba de carga ligera** (búsqueda de cuidadores, alertas) y revisión de índices con volumen real; ajustar los límites de peticiones con sus resultados. |
| 🔧 | **Un rol de base de datos por módulo.** Hoy hay uno de mínimos permisos para toda la aplicación, porque los módulos comparten transacciones (p. ej. importar un cuidador escribe en Identidad y Directorio). Separarlos pide rediseñar esas transacciones: necesita su propio ADR. |
| 🔧 | **Exportar y suprimir los datos de una persona** (Ley 1581; PR 8 de M1) y los plazos de retención. Pide decisión legal sobre qué se conserva (registros financieros, de salud, auditoría). |
| 🔧 | **Segundo factor para administradores**, verificación del correo, cifrado de columnas clínicas, quitar metadatos de imágenes y antivirus (ver [SEGURIDAD](./SEGURIDAD.md)). |
| 🔧 | Publicar los contratos **OpenAPI y AsyncAPI** versionados. |
| 🧑 | Definir con el equipo la **guardia, la comunicación de caídas** y el contacto con la SIC ante un incidente con datos personales; la periodicidad de rotación de secretos. |
| ⚖️🚀 | Los requisitos de la [sección 12 del plan](./PLAN_BACKEND_SENIORY.md): términos y condiciones, política de datos, atención de consultas y reclamos (SIC), soporte, piloto cerrado con unas 20 familias. |

### M11 — IA *(opcional)*

| | Pendiente |
|---|---|
| 🧑 | Definir el alcance con el equipo y escribir su propio ADR antes de implementar. |

---

## Frontend

El frontend se conecta al backend módulo por módulo, en el orden del [plan v2](./PLAN_FRONTEND_SENIORY.md#4-módulos-del-frontend-y-orden-de-construcción): F1, F2, F3+F4, F7, F6, F8, F5, F9 y F10. **F0, la Etapa 0 (sistema de diseño) y F1 (identidad) están construidos**; el resto de las pantallas sigue leyendo `frontend/data/`, así que el entorno compartido es solo para el equipo.

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
| 🔧 | **Cuidador en turno:** hasta F4 nadie aparece «en turno» (antes era uno inventado del prototipo). `mensajes.json` y la contratación siguen del prototipo y se reemplazan en F4 y F8: mientras tanto el chat de un cuidador real aparece vacío. |
| 🧑 | Los recorridos del directorio necesitan los cuidadores de `npm run semillas` (y uno importado con PDF para probar la hoja de vida); sin ellos algunos se omiten. |
| F3 a F10 | 🔧 Una por cada módulo M3 a M9 (cotización y contratación con vista mínima del cuidador, pagos y bolsas, teleasistencia, mensajes, avisos, administración) y el cierre para producción. |
| 🔧 | **Vulnerabilidades de las dependencias del frontend** (`npm audit`: 15 en producción, casi todas por `shadcn` y `zod`; arreglarlas obliga a subir `shadcn` a una versión mayor). `shadcn` es una herramienta de desarrollo y no debería estar en `dependencies`. |
| 🧑 | **Pruebas de usabilidad** con adultos mayores y familiares reales (E4, E5). |
| 🧑 | Quitar de la landing los textos y cifras de demostración. |
| 🧑 | Decidir **dominios y cookies**: subdominios del mismo sitio (`app.…` y `api.…`) o reescrituras. |

---

## Cómo se usa este archivo

1. Al terminar un PR, **se borra de aquí lo que quedó hecho** y se anota en [AVANCE.md](./AVANCE.md).
2. Lo que se deja a un lado a propósito se agrega a «Decisiones tomadas a un lado», con la fecha.
3. Lo que bloquea el lanzamiento lleva 🚀: antes de abrir a usuarios reales no debe quedar ninguno.
