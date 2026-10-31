# Seniory — Avance del proyecto

**Corte:** 28 de octubre de 2026 · Se actualiza al terminar cada PR o cuando se toma una decisión.

## Dónde vamos

> **Backend: M0 con 7 de 8 PR hechos (falta el despliegue a staging, que espera el hosting) y M1 (Identidad) en marcha: PR 7 de 8 hecho (… recuperación de contraseña y ajustes para el BFF).**
> Siguiente paso: **M1 · PR 8 (exportar y eliminar cuenta, opcional) o pasar a M2 (Directorio)**. Pendiente de ustedes: revisar y aceptar el [ADR-03](./ADR-03.md) (comunicación) y el [ADR-04](./ADR-04.md) (stack) y ver la CI en verde en GitHub.
>
> El frontend sigue siendo el prototipo del pitch con datos de ejemplo; su integración con el backend empieza en F0, después de M0.

```
Backend   M0 █████████████████▌░░  7 de 8 PR (falta el despliegue)
          M1 ██████████████████░░  PR 7 de 8 (… recuperar contraseña y ajustes para el BFF)   ← aquí
          M2 … M11                 pendientes
Frontend  F0 … F9                  planes F0 y F1 propuestos; nada construido
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
| M1 · PR 7 | Ajustes para el BFF: verificación de `Origin` contra CSRF (las llamadas del BFF no lo traen y se aceptan). | ✅ hecho, **sin commit** |
| M1 · PR 8 | Exportar y eliminar cuenta (opcional; puede pasar a M10). | ⏭️ siguiente |
| M2 → M11 | Directorio, pagos, reservas, notificaciones, teleasistencia, mensajería, verificación, despliegue, IA. | Pendientes, en ese orden |

**Cifras actuales:** 1062 pruebas (unitarias y de arquitectura, y de integración y API contra Postgres real), cobertura del 98 %, lint y compilación limpios y 0 vulnerabilidades en las dependencias de producción.

### Frontend (`frontend/`)

| Entrega | Estado |
|---|---|
| Prototipo del pitch (landing, directorio, contratación, teleasistencia, mensajes) con datos en `frontend/data/*.json` | Funciona en local; no es la aplicación final. |
| F0 · Base de integración con el backend | Plan propuesto; empieza cuando M0 tenga la capa HTTP. |
| F1–F9 | Pendientes. Cada F*n* conecta las pantallas al módulo M*n* y borra el JSON que reemplaza. |

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
| 14 | `feat/m1-bff` (actual) | M1 PR 7 y el archivo de pendientes. **Solo en local.** |

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
