# Seniory — Avance del proyecto

**Corte:** 31 de octubre de 2026 · Se actualiza al terminar cada PR o cuando se toma una decisión.

## Dónde vamos

> **Backend: M0 con 7 de 8 PR hechos (falta el despliegue a staging, que espera el hosting), M1 (Identidad) con 7 de 8, M2 (Directorio) en `main` y M3 (cotización) en `main` y M4 (reservas) en `main` y M5 (notificaciones) en `main` y M6 (teleasistencia) en `main` y M7 (cobro, bolsas y liquidación) en `main` y M8 (mensajería) en `main` y M9 (registro y verificación de cuidadores) en `main` y M10 (endurecimiento) en `main` en lo que no depende del hosting.**
> Siguiente paso: **el frontend** (F1 en revisión; ver el [plan v2](./PLAN_FRONTEND_SENIORY.md) y el [plan de integración](./INTEGRACION_FRONTEND_BACKEND.md)); **M11 (IA)** es opcional y pide definir su alcance. Para lanzar falta elegir el hosting y lo que de él depende (ver [OPERACION](./OPERACION.md), [SEGURIDAD](./SEGURIDAD.md) y [PENDIENTES](./PENDIENTES.md)). Se construye todo el backend antes de seguir con el frontend; los datos reales (cuidadores, verificaciones) llegan después por los procesos del propio sistema. Pendiente de ustedes: revisar y aceptar el [ADR-03](./ADR-03.md) (comunicación) y el [ADR-04](./ADR-04.md) (stack) y ver la CI en verde en GitHub.
>
> El frontend ya tiene su **sistema de diseño** (paleta y componentes), **F0** (base de integración) y **F1** (identidad: cuentas reales, sesión y bienvenida) construido y en revisión; el resto de las pantallas sigue con los datos de ejemplo del prototipo hasta conectarse. Siguiente: **F7 (pagos y bolsas)**.

```
Backend   M0 █████████████████▌░░  7 de 8 PR (falta el despliegue)
          M1 ██████████████████░░  PR 7 de 8 (… recuperar contraseña y ajustes para el BFF)
          M2 ████████████████████  construido
          M3 ████████████████████  construido
          M4 ████████████████████  construido
          M5 ████████████████████  construido
          M6 ████████████████████  construido
          M7 ████████████████████  construido
          M8 ████████████████████  construido
          M9 ████████████████████  construido
          M10 ███████████████░░░░░  construido salvo lo que espera el hosting
          M11                      pendiente (opcional)
Frontend  F0 ████████████████████  construido
          Etapa 0 ████████████████  construido (paleta y components/ui)
          F1 ████████████████████  construido
          F2 ████████████████████  construido
          F3+F4 ██████████████████  construido (en revisión)   ← aquí
          F5 … F10                 pendientes (F7 siguiente)
Base de datos  ████████████████████  completa (adelantada)
```

## Lo que llevamos

### Documentación y planes

| Documento | Estado |
|---|---|
| [ADR-01](./ADR-01.md) y [ADR-02](./ADR-02.md) | Vigentes. |
| [ADR-03](./ADR-03.md) | **Borrador:** estrategia de comunicación. Asíncrona entre módulos (eventos por outbox) y síncrona solo donde la persona espera la respuesta; REST con OpenAPI 3.1 hacia el frontend y AsyncAPI 3.0 para los eventos. Falta que lo acepten ambos. |
| [ADR-04](./ADR-04.md) (antes ADR-03) | **Borrador:** stack, persistencia, datos de salud en Teleasistencia, Mensajería, bolsas en Pagos, BFF, outbox y fronteras verificadas. Falta que lo acepten ambos. |
| [Pendientes por etapa](./PENDIENTES.md) | Lo que falta de cada etapa del plan (decisiones, legal, código). Se actualiza en cada PR. |
| [Plan del backend](./PLAN_BACKEND_SENIORY.md) (M0–M11) | Completo. Planes detallados de [M0](./backend/M0-plataforma-y-compartido.md) y [M1](./backend/M1-identidad.md) **aprobados** (2026-10-22). |
| [Plan del frontend](./PLAN_FRONTEND_SENIORY.md) (F0–F9) | Completo. Planes detallados de [F0](./frontend/F0-base-de-integracion.md) y [F1](./frontend/F1-identidad.md) **propuestos**. |
| [Diseño de la base de datos](./backend/BASE_DE_DATOS.md) | Construido. Guía de estudio en PDF: [BASE_DE_DATOS-guia-de-estudio.pdf](./backend/BASE_DE_DATOS-guia-de-estudio.pdf). |
| Planes detallados de M2–M11 y F2–F9 | Pendientes. Se escriben por etapas, en pareja M*n*/F*n*. |

### Backend (`backend/`)

| Entrega | Contenido | Estado |
|---|---|---|
| M0 · PR 1 | Proyecto NestJS 12, TypeScript estricto, oxlint, Prettier, Vitest, Node 24, `/salud`. | ✅ commit `d8383f0` |
| M0 · PR 2 | Configuración validada con arranque seguro en producción, Postgres en Docker (puerto 5434), Drizzle y migrador. | ✅ commit `1b8b6b6` |
| Base de datos | 8 esquemas, 38 tablas, 11 migraciones, 3 triggers, 258 pruebas de restricciones. Se adelantó: estaba repartida entre los módulos. | ✅ commit `45e00b2` |
| M0 · PR 3 | Dominio compartido: `Dinero`, `FechaCivil`, `Id`, errores, puertos y sobre de eventos. | ✅ commit `e9eaaad` |
| M0 · PR 4 | Unidad de trabajo, outbox, despachador, sondeo y auditoría. | ✅ commit `1bfbc75` |
| M0 · PR 5 | Capa HTTP: problem+json, validación, `X-Request-Id`, autenticación que deniega por defecto, roles, límite de peticiones con IP real del BFF, `helmet`, CORS, logs con redacción, `/salud/listo` y Swagger. | ✅ commit `e417dbd` |
| M0 · PR 6 | Reglas de arquitectura (`dependency-cruiser`, 7 reglas con ejemplos que las rompen), CI en GitHub Actions y Dependabot. | ✅ commit `617491a` |
| M0 · PR 7 | `Dockerfile` y despliegue a staging. | **Bloqueado:** falta elegir el hosting |
| M0 · PR 8 | Borrador del ADR de stack (hoy ADR-04). | ✅ commit `f8f895c` |
| M1 · PR 1 | Dominio de Identidad: `Correo`, `Contrasena` (nunca se filtra), `Credencial` con bloqueo progresivo, `SesionDeRefresco` con detección de robo, `Usuario` con rol inmutable, `AdultoMayor`, `Vinculo` y `Consentimiento`. | ✅ commit `9577fba` |
| M1 · PR 2 | Repositorios de Identidad con Drizzle: conflictos traducidos a errores de dominio, bloqueo de fila para los intentos de inicio de sesión y las renovaciones simultáneas. | ✅ commit `3deb712` |
| M1 · PR 3 | Autenticación: registro, inicio de sesión, renovación y cierre (`/auth/*`), argon2id, tokens de acceso JWT y de refresco rotativos con detección de robo, bloqueo progresivo, lista de contraseñas comunes y `IdentidadModule`. | ✅ commit `a9d06c7` |
| M1 · PR 4 | Perfil (`/yo`), personas mayores, consentimientos y el primer puerto de entrada (`ConsultaDeIdentidad`), con eventos, auditoría y la matriz de autorización. | ✅ commit `5f5f7a2` (ya en `main`) |
| M1 · PR 5 | `npm run crear-admin`, `npm run semillas` (Andrea y Doña Carmen, solo fuera de producción) y README del módulo. | ✅ commit `f61d471` (ya en `main`) |
| M1 · PR 6 | Cambiar y recuperar la contraseña: `olvidé mi contraseña`, enlace de 30 minutos y un solo uso, cierre de todas las sesiones y puerto del canal de correo. | ✅ commit `d170900` (ya en `main`) |
| M1 · PR 7 | Ajustes para el BFF: verificación de `Origin` contra CSRF (las llamadas del BFF no lo traen y se aceptan). | ✅ commit `08103b6` (ya en `main`) |
| M1 · PR 8 | Exportar y eliminar cuenta (opcional; puede pasar a M10). | ⏭️ siguiente |
| M2 | Directorio: búsqueda con filtros y paginación por cursor, perfiles con reseñas, hoja de vida con dirección firmada, `CONSULTA_DE_DIRECTORIO`, reseñas desde el evento de Reservas, carga de cuidadores reales (`cuidadores:importar`), revisión diaria de vigencias, semillas de desarrollo y `CUENTAS_DE_CUIDADORES` en Identidad. Ver el [README del módulo](../backend/src/directorio/README.md). | ✅ commit `64c5a24` (ya en `main`) |
| M3 | Cotización: `calcularServicio` (función pura, pesos enteros), política de precios versionada, `POST /pagos/cotizaciones` (la familia no ve el pago al profesional), `COTIZADOR_DE_SERVICIOS` para Reservas y 150 vectores compartidos con el frontend. Ver el [README del módulo](../backend/src/pagos/README.md). | ✅ commit `c1d6f3f` (ya en `main`) |
| M4 | Reservas: la máquina de estados del servicio (solicitar, aceptar, rechazar, expirar, cancelar, iniciar, finalizar, calificar), sin doble reserva ni siquiera con solicitudes simultáneas, `Idempotency-Key`, vistas distintas para la familia y el cuidador, cuidador en turno, tarea de expiración y `CONSULTA_DE_RESERVAS`. Ver el [README del módulo](../backend/src/reservas/README.md). | ✅ commit `cc6b76f` (ya en `main`) |
| M5 | Notificaciones: aviso a la familia y al cuidador en cada cambio del servicio, canales como adaptadores (la campana de la aplicación es real; correo, SMS y WhatsApp esperan proveedor), reintentos con espera creciente, sin duplicados, prioridad alta por todos los canales a la vez y alarma de alerta sin entregar. Ver el [README del módulo](../backend/src/notificaciones/README.md). | ✅ commit `6c6fa83` (ya en `main`) |
| M6 | Teleasistencia: política de acceso en cada consulta (el cuidador solo con servicio activo; revocar el consentimiento o terminar el servicio corta el acceso al instante), medicamentos con tomas del día idempotentes, signos vitales con rangos, alertas con clave de idempotencia y medición E11, tarea de omisión, resumen en una consulta y datos clínicos que nunca salen en eventos ni avisos. Ver el [README del módulo](../backend/src/teleasistencia/README.md). | ✅ commit `5ebb78e` (ya en `main`) |
| M7 | Cobro: el servicio se cobra al confirmarse (con la pasarela o con la bolsa de horas), el aviso firmado de la pasarela es la única puerta para aprobar un pago (una sola vez, con el monto verificado, también si llega en paralelo), la bolsa es un libro de movimientos que nunca queda negativo, el dinero vuelve al cancelar, los pagos sin pagar vencen (preguntándole antes a la pasarela), el servicio no inicia sin pago y el cuidador queda con su liquidación. La pasarela y el dispersor reales esperan decisión: hoy hay adaptadores simulados (prohibidos en producción) y deshabilitados. Ver el [README del módulo](../backend/src/pagos/README.md). | ✅ commit `7920327` (ya en `main`) |
| M8 | Mensajería: el chat entre la familia y el cuidador (solo sus dos partes; se escribe mientras haya un servicio vivo y se lee siempre), mensajes en texto plano sin duplicados al reenviar, paginación por cursor, eventos en vivo (SSE) que se reconectan sin perder mensajes, tope de conexiones y apagado limpio, y aviso agrupado a la otra parte sin el texto. Ver el [README del módulo](../backend/src/mensajeria/README.md). | ✅ commit `33f70de` (ya en `main`) |
| M9 | Postulación y verificación de cuidadores: registro propio con rol `cuidador`, perfil en borrador, documentos validados por contenido, revisión de los tres controles por administradores (aprobar con vigencia o rechazar con motivo, sin carreras entre revisores), activación y visibilidad solo con los tres aprobados (E7), vencimiento y renovación, y hoja de vida pública aprobada aparte de los documentos privados. Ver el [README del módulo](../backend/src/directorio/README.md). | ✅ commit `095ebaf` (ya en `main`) |
| M10 | Endurecimiento: imagen de Docker (sin root, sin `.env` ni pruebas) y job de CI que comprueba que en producción se niega a iniciar con adaptadores simulados; rol de base de datos de la aplicación con permisos mínimos (`bd:permisos`) separado de la cuenta dueña de las migraciones; `GET /salud/operacion` con el estado del outbox para el monitor; guarda de que las migraciones no traigan datos de prueba; ensayo de restauración (`bd:probar-restauracion`); y las guías [OPERACION](./OPERACION.md) y [SEGURIDAD](./SEGURIDAD.md) (OWASP API Top 10 y ASVS 2 con lo que falta). Hosting, monitor externo, respaldos del proveedor y prueba de carga esperan decisión. | ✅ commit `5d0f0c3` (ya en `main`) |
| M11 | IA (opcional). | Pendiente |

**Cifras actuales:** backend, 2927 pruebas (unitarias y de arquitectura, y de integración y API contra Postgres real; las de integración corren un archivo tras otro porque comparten la base de datos), cobertura del 98 %, lint y compilación limpios y 0 vulnerabilidades en las dependencias de producción. Frontend, 304 pruebas unitarias, 38 de contrato y 20 recorridos de Playwright contra el backend local.

### Frontend (`frontend/`)

| Entrega | Estado |
|---|---|
| Prototipo del pitch (landing, directorio, contratación, teleasistencia, mensajes) con datos en `frontend/data/*.json` | Funciona en local; no es la aplicación final. |
| F0 · Base de integración con el backend | ✅ Construido: red de seguridad (Vitest y Playwright), servicios solo de servidor, acción de servidor para la contratación, cliente HTTP, `proxy.ts` y `error.tsx`. 94 pruebas unitarias y 2 recorridos. |
| Etapa 0 · Sistema de diseño | ✅ Construido: paleta de limpieza, seguridad, salud y precisión (contraste AA medido en claro, oscuro y alto contraste), `components/ui` con objetivos de 48 px y el componente `Aviso`. |
| Planes v2 | ✅ [Plan del frontend](./PLAN_FRONTEND_SENIORY.md) actualizado (orden por valor, cookies reescritas, contratos a mano, flujo con Claude Design) y [plan de integración](./INTEGRACION_FRONTEND_BACKEND.md) (entorno local, mapa de módulos, errores, tiempo real, pruebas, CI, riesgos). |
| F1 · Identidad | ✅ commit `6efb9ac` (ya en `main`): ingresar, registro, recuperar y restablecer contraseña, bienvenida (persona y autorización de salud), política de datos, «Mi cuenta» con cambio de contraseña, salir; sesión con cookies reescritas a `Path=/` y renovación en `proxy.ts`; `/app` exige familia con persona y autorización; áreas de cuidador y administrador con aviso honesto; `paciente.ts` sobre `GET /yo`. 222 pruebas unitarias, 15 de contrato y 10 recorridos contra el backend local. |
| F2 · Directorio | ✅ commit `0583de4` (ya en `main`): búsqueda en el servidor con filtros en la URL (texto sin tildes, especialidad, jornada, zona, tarifa) y «Ver más» por cursor; perfil con reseñas y verificación; hoja de vida servida por Next como PDF; **sin ningún dato de contacto** (H1) en HTML ni en lo que viaja al navegador; ids UUID. Se retiran `cuidadores.json` y las hojas de vida de ejemplo. 270 pruebas unitarias, 27 de contrato y 16 recorridos contra el backend local. |
| F3+F4 · Cotización y contratación | ⏳ En revisión (rama `feat/f4-contratacion`): el precio lo calcula el servidor (cada cambio de horas pide una cotización nueva); pedir un servicio con `Idempotency-Key` (la misma clave para el mismo envío, otra si cambian los datos) y fecha y franjas en hora de Colombia (no UTC); el resultado es una **solicitud**, no una «contratación confirmada»; «Mis servicios» y el detalle con cancelar y calificar; cuidador en turno real (el único lugar con teléfono); **área del cuidador** `/cuidador` para aceptar, rechazar, iniciar y finalizar, que ve lo que recibe y nunca lo que paga la familia. Se retiran `pricing.ts` y la confirmación simulada. 304 pruebas unitarias, 38 de contrato y 20 recorridos con dos personas contra el backend local. |
| F7–F10 | Pendientes, en el orden del plan v2. Cada F*n* conecta las pantallas al módulo M*n* y borra el JSON que reemplaza. |

### Ramas (todas en GitHub; las 4 últimas desde el 28 de octubre)

Cada rama parte de la anterior. Se revisan con un PR encadenado por entrega (la base de cada PR es la rama anterior) y se fusionan en orden, de arriba hacia abajo.

| # | Rama | Contiene |
|---|---|---|
| 1 | `refactor/estructura-frontend-backend-docs` | Reorganización en `frontend/`, `backend/` y `docs/`, y planes. |
| 2 | `feat/backend-m0` | M0 PR 1 y PR 2. |
| 3 | `feat/base-de-datos` | La base de datos completa. |
| 4 | `feat/m0-dominio-compartido` | M0 PR 3 y PR 4, y documentación de avance. |
| 5 | `feat/m0-capa-http` | M0 PR 5. |
| 6 | `feat/m0-arquitectura-y-ci` | M0 PR 6 (trae la CI). |
| 7 | `docs/adr-03` | M0 PR 8: borrador del ADR de stack (hoy ADR-04; la rama conserva el nombre antiguo). |
| 8 | `feat/m1-dominio` | M1 PR 1: dominio de Identidad. |
| 9 | `feat/m1-persistencia` | M1 PR 2: repositorios. |
| 10 | `feat/m1-autenticacion` | M1 PR 3: autenticación (ya está en `main`). |
| 11 | `feat/m1-perfil` | M1 PR 4 y un arreglo de dependencias (ya en `main`). |
| 12 | `feat/m1-fixtures-y-admin` | M1 PR 5 (ya en `main`). |
| 13 | `feat/m1-contrasena` | M1 PR 6 (ya en `main`). |
| 14 | `feat/m1-bff` | M1 PR 7 y el archivo de pendientes (ya en `main`). |
| 15 | `feat/m2-directorio` | M2: el directorio de cuidadores (ya en `main`). |
| 16 | `feat/m3-cotizacion` | M3: la cotización de servicios (ya en `main`). |
| 17 | `feat/m4-reservas` | M4: reservas (ya en `main`). |
| 18 | `feat/m5-notificaciones` | M5: notificaciones (ya en `main`). |
| 19 | `feat/m6-teleasistencia` | M6: teleasistencia (ya en `main`). |
| 20 | `feat/m7-cobro` | M7: cobro, bolsas y liquidación (ya en `main`). |
| 21 | `feat/m8-mensajeria` | M8: mensajería (ya en `main`). |
| 22 | `feat/m9-verificacion` | M9: registro y verificación de cuidadores (ya en `main`). |
| 23 | `feat/m10-endurecimiento` | M10: endurecimiento y despliegue (ya en `main`). |
| 24 | `feat/f-paleta` | Paleta nueva y Etapa 0 del sistema de diseño (ya en `main`). |
| 25 | `feat/f1-identidad` | Planes v2 del frontend y F1: identidad (ya en `main`). |
| 26 | `feat/f2-directorio` | F2: directorio de cuidadores (ya en `main`). |
| 27 | `feat/f4-contratacion` (actual) | F3+F4: cotización, contratación y área del cuidador. |

**La CI solo corre en el PR 6:** es la primera rama que tiene `.github/workflows/backend.yml`. Una vez fusionada en `main`, correrá en todos los PR que toquen `backend/`.

## Decisiones

### Tomadas

| Fecha | Decisión |
|---|---|
| 2026-10-22 | NestJS 12 con Express, `class-validator`, Vitest, oxlint y Drizzle; Node 24 LTS. |
| 2026-10-22 | Los datos de salud viven en Teleasistencia; Identidad guarda vínculos y consentimientos. Se agrega el módulo `mensajeria`. |
| 2026-10-24 | El frontend usa Next como BFF: el navegador no llama a la API directamente. |
| 2026-10-26 | **Seniory es una aplicación real, no una demo:** nada simulado ni datos de ejemplo en producción. |
| 2026-10-26 | Directorio solo con sesión; el cuidador acepta en 2 h (30 min si es para hoy) o la solicitud expira; franjas 06–12, 12–18 y 18–06; el cobro ocurre al aceptar el cuidador. |
| 2026-10-26 | La base de datos se construyó completa desde el principio. |
| 2026-10-31 | **Se construye todo el backend (M2 a M11) antes de seguir con el frontend.** Los datos reales llegan después. |
| 2026-10-31 | Los cuidadores reales entran por `npm run cuidadores:importar` (controles revisados fuera del sistema); las semillas son solo para desarrollo. El almacén de archivos local no se admite en producción. |

### Abiertas (bloquean módulos futuros)

| Decisión | Quién | Bloquea |
|---|---|---|
| Hosting de staging y producción | Equipo | M0 PR 7, M10 |
| Cuenta de Sentry (plan gratuito) y su `SENTRY_DSN` | Equipo | Reporte de errores antes de producción (M10) |
| **Proveedor de correo** (para recuperar la contraseña, y luego los avisos) | Equipo | **Lanzamiento**: sin él, `olvidé mi contraseña` responde 503 en producción (M5) |
| Pasarela de pagos (que acepte marketplace y pagos al cuidador) | Empresarial | M7 |
| Bolsa en pesos u horas, y sus paquetes y descuentos | Empresarial | M7 |
| Política de cancelación y reembolso | Empresarial + legal | M4, M7 |
| Quién consiente por la persona mayor, y textos legales (política de datos y consentimiento: hoy solo existe la versión `v1` como marcador) | Asesoría legal | Lanzamiento de M1 (no el desarrollo) |
| Bloqueo de cuenta: ¿caducan los fallos? ¿desbloqueo por correo? (decisión 7 de [M1](./backend/M1-identidad.md)) | Equipo | M10 |
| Rangos de signos vitales y tolerancia de medicamentos | Profesional de salud | M6 |
| Cifrado de columnas clínicas y plazos de retención | Equipo + legal | M6, M10 |
| Canal real de alertas (SMS o WhatsApp) | Equipo | M5, M6 |

## Pendientes fuera del orden de los PR

- Abrir los 6 PR encadenados en GitHub y fusionarlos en orden; abrir también los PR de las ramas 7 a 10 (ya están subidas).
- Integrar Sentry cuando haya cuenta.
- Renombrar `docs/backend/` y `docs/frontend/` para no confundirlas con las carpetas de código (propuesta: `docs/planes-backend/` y `docs/planes-frontend/`).
- Documento de aprendizajes (pedido y aún sin hacer).
- Aceptar el ADR-03 y el ADR-04 entre los dos y actualizar la imagen del diagrama de ADR-01 (datos de salud en Teleasistencia, Mensajería y outbox); el ADR-04 §3 ya trae la versión corregida.
- Revisar si los teléfonos de `frontend/data/cuidadores.json` son de personas reales, y la licencia de las fotos de la landing.
