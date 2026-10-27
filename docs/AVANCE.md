# Seniory — Avance del proyecto

**Corte:** 27 de octubre de 2026 · Se actualiza al terminar cada PR o cuando se toma una decisión.

## Dónde vamos

> **Backend, módulo M0 (plataforma y compartido): PR 5 de 8 terminado.**
> Siguiente paso: **PR 6, reglas de arquitectura y CI** (`dependency-cruiser` para que la CI rompa si un módulo cruza fronteras, y GitHub Actions que corra lint, pruebas, build y auditoría en cada PR).
>
> El frontend sigue siendo el prototipo del pitch con datos de ejemplo; su integración con el backend empieza en F0, después de M0.

```
Backend   M0 ████████████▌░░░░░░░  PR 5/8   ← aquí
          M1 … M11                 pendientes
Frontend  F0 … F9                  planes F0 y F1 propuestos; nada construido
Base de datos  ████████████████████  completa (adelantada)
```

## Lo que llevamos

### Documentación y planes

| Documento | Estado |
|---|---|
| [ADR-01](./ADR-01.md) y [ADR-02](./ADR-02.md) | Vigentes. Pendiente registrar los cambios en un ADR-03 (ver «Pendientes»). |
| [Plan del backend](./PLAN_BACKEND_SENIORY.md) (M0–M11) | Completo. Planes detallados de [M0](./backend/M0-plataforma-y-compartido.md) y [M1](./backend/M1-identidad.md) **aprobados** (2026-10-22). |
| [Plan del frontend](./PLAN_FRONTEND_SENIORY.md) (F0–F9) | Completo. Planes detallados de [F0](./frontend/F0-base-de-integracion.md) y [F1](./frontend/F1-identidad.md) **propuestos**. |
| [Diseño de la base de datos](./backend/BASE_DE_DATOS.md) | Construido. Guía de estudio en PDF: [BASE_DE_DATOS-guia-de-estudio.pdf](./backend/BASE_DE_DATOS-guia-de-estudio.pdf). |
| Planes detallados de M2–M11 y F2–F9 | Pendientes. Se escriben por etapas, en pareja M*n*/F*n*. |

### Backend (`backend/`)

| Entrega | Contenido | Estado |
|---|---|---|
| M0 · PR 1 | Proyecto NestJS 12, TypeScript estricto, oxlint, Prettier, Vitest, Node 24, `/salud`. | ✅ commit `d8383f0` |
| M0 · PR 2 | Configuración validada con arranque seguro en producción, Postgres en Docker (puerto 5434), Drizzle y migrador. | ✅ commit `1b8b6b6` |
| Base de datos | 8 esquemas, 37 tablas, 10 migraciones, 3 triggers, 253 pruebas de restricciones. Se adelantó: estaba repartida entre los módulos. | ✅ commit `45e00b2` |
| M0 · PR 3 | Dominio compartido: `Dinero`, `FechaCivil`, `Id`, errores, puertos y sobre de eventos. | ✅ commit `e9eaaad` |
| M0 · PR 4 | Unidad de trabajo, outbox, despachador, sondeo y auditoría. | ✅ commit `1bfbc75` |
| M0 · PR 5 | Capa HTTP: problem+json, validación, `X-Request-Id`, autenticación que deniega por defecto, roles, límite de peticiones con IP real del BFF, `helmet`, CORS, logs con redacción, `/salud/listo` y Swagger. | ✅ hecho, **sin commit** |
| M0 · PR 6 | Reglas de arquitectura (`dependency-cruiser`) y CI en GitHub Actions. | ⏭️ siguiente |
| M0 · PR 7 | `Dockerfile` y despliegue a staging. | **Bloqueado:** falta elegir el hosting |
| M0 · PR 8 | Borrador del ADR-03. | Pendiente |
| M1 → M11 | Identidad, directorio, pagos, reservas, notificaciones, teleasistencia, mensajería, verificación, despliegue, IA. | Pendientes, en ese orden |

**Cifras actuales:** 471 pruebas (156 unitarias y 315 de integración y API contra Postgres real), cobertura del 97 %, lint y compilación limpios y 0 vulnerabilidades en las dependencias de producción.

### Frontend (`frontend/`)

| Entrega | Estado |
|---|---|
| Prototipo del pitch (landing, directorio, contratación, teleasistencia, mensajes) con datos en `frontend/data/*.json` | Funciona en local; no es la aplicación final. |
| F0 · Base de integración con el backend | Plan propuesto; empieza cuando M0 tenga la capa HTTP. |
| F1–F9 | Pendientes. Cada F*n* conecta las pantallas al módulo M*n* y borra el JSON que reemplaza. |

### Ramas (nada del backend está en GitHub todavía)

| Rama | Contiene | En GitHub |
|---|---|---|
| `main` | Prototipo del pitch. | Sí (con un commit local sin subir) |
| `refactor/estructura-frontend-backend-docs` | Reorganización en `frontend/`, `backend/` y `docs/`, más el plan del backend. | Sí, salvo el último commit |
| `feat/backend-m0` | M0 PR 1 y PR 2. | No |
| `feat/base-de-datos` | La base de datos completa. | No |
| `feat/m0-dominio-compartido` | M0 PR 3 y PR 4, más docs. | No |
| `feat/m0-capa-http` (actual) | M0 PR 5, sin commit. | No |

Cada rama parte de la anterior. Falta decidir cuándo subirlas y fusionarlas en `main`.

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
| Pasarela de pagos (que acepte marketplace y pagos al cuidador) | Empresarial | M7 |
| Bolsa en pesos u horas, y sus paquetes y descuentos | Empresarial | M7 |
| Política de cancelación y reembolso | Empresarial + legal | M4, M7 |
| Quién consiente por la persona mayor, y textos legales | Asesoría legal | M1 |
| Rangos de signos vitales y tolerancia de medicamentos | Profesional de salud | M6 |
| Cifrado de columnas clínicas y plazos de retención | Equipo + legal | M6, M10 |
| Canal real de alertas (SMS o WhatsApp) | Equipo | M5, M6 |

## Pendientes fuera del orden de los PR

- Commit del PR 5 (espera aprobación).
- Integrar Sentry cuando haya cuenta.
- Renombrar `docs/backend/` y `docs/frontend/` para no confundirlas con las carpetas de código (propuesta: `docs/planes-backend/` y `docs/planes-frontend/`).
- Documento de aprendizajes (pedido y aún sin hacer).
- Corregir el diagrama de arquitectura (mover «Datos de salud» a Teleasistencia y agregar Mensajería) y registrar todos los cambios en el ADR-03.
- Revisar si los teléfonos de `frontend/data/cuidadores.json` son de personas reales, y la licencia de las fotos de la landing.
