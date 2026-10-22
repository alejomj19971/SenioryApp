# Planes del backend por módulo

Cada archivo de esta carpeta es el **plan detallado de un módulo**: lo que se construye, con qué archivos, interfaces, tablas, endpoints, pruebas y pull requests. Se implementan **en orden** y cada uno termina con una revisión del equipo.

El marco general (stack, reglas de arquitectura, estándares y orden) está en [PLAN_BACKEND_SENIORY.md](../PLAN_BACKEND_SENIORY.md). La arquitectura de referencia es [ADR-01](../ADR-01.md) y su diagrama.

## Estado

| # | Módulo | Bloque del diagrama | Plan | Estado |
|---|---|---|---|---|
| M0 | Plataforma y compartido | `compartido/`, API REST, eventos internos, base de datos | [M0-plataforma-y-compartido.md](./M0-plataforma-y-compartido.md) | Plan aprobado (2026-10-22) |
| M1 | Identidad | Identidad y usuarios | [M1-identidad.md](./M1-identidad.md) | Plan aprobado (2026-10-22) |
| M2 | Directorio (lectura) | Directorio y verificación | — | Pendiente |
| M3 | Pagos I: cotización | Pagos | — | Pendiente |
| M4 | Reservas | Reservas (máquina de estados) | — | Pendiente |
| M5 | Notificaciones | Notificaciones | — | Pendiente |
| M6 | Teleasistencia | Teleasistencia | — | Pendiente |
| M7 | Pagos II: cobro, bolsas y liquidación | Pagos + pasarela de pagos | — | Pendiente |
| M8 | Mensajería | *(no está en el diagrama, ver abajo)* | — | Pendiente |
| M9 | Directorio II: registro y verificación | Directorio y verificación | — | Pendiente |
| M10 | Endurecimiento y despliegue | — | — | Pendiente |
| M11 | IA (opcional) | IA + proveedor de IA | — | Pendiente |

## Decisiones tomadas al construir los planes

| Fecha | Decisión | Motivo | Pendiente en otros documentos |
|---|---|---|---|
| 2026-10-22 | **Los datos de salud viven en Teleasistencia.** Identidad guarda quién puede acceder (vínculos y consentimientos), no datos clínicos. | ADR-01 exige que los datos de salud vivan en un solo módulo, y los medicamentos y signos vitales ya son de Teleasistencia. | El diagrama pone «Datos de salud aquí» en Identidad y el escenario E6 de ADR-01 nombra a Identidad como artefacto. Mover la etiqueta del diagrama a Teleasistencia y registrar el cambio en el ADR-03. |
| 2026-10-22 | El evento que publica Reservas al pasar a `Aceptado` se llama **`ServicioConfirmado`**, como en el diagrama. | Mantener el lenguaje del diagrama y de ADR-01. | — |
| 2026-10-22 | **NestJS 12 con sus valores por defecto:** Express, `class-validator`, Vitest, oxlint y ESM (al crear el proyecto se confirmó que Nest 12 ya no genera Jest ni ESLint). Node 24 LTS. Se mantiene Drizzle. Cada `@Module` exporta solo sus puertos de entrada. | Menor curva de aprendizaje: la documentación oficial y los tutoriales usan esas opciones. Drizzle se mantiene porque un esquema por módulo hace visible E13. Los `exports` mínimos hacen que Nest falle al arrancar si un módulo inyecta algo ajeno. | Registrar en el ADR-03. |
| 2026-10-22 | Se agrega el módulo **`mensajeria`**. | La mensajería es una funcionalidad de ADR-01 §1 y existe en el frontend, pero no aparece como módulo en el diagrama ni en ADR-01 §4.7. | Agregarlo al diagrama y al ADR-03. |

## Plantilla de cada plan

1. **Objetivo y alcance**: qué entra y qué no.
2. **Relación con el diagrama y los ADR**.
3. **Definición de preparado**: qué debe estar resuelto antes de empezar.
4. **Diseño**: dominio, casos de uso, puertos, API, eventos y datos.
5. **Seguridad**: amenazas y controles.
6. **Pruebas**: lista concreta por capa.
7. **Integración con el frontend**.
8. **Pull requests**: el trabajo partido en entregas pequeñas y revisables.
9. **Definición de terminado** del módulo (además de la común, [PLAN_BACKEND §6.3](../PLAN_BACKEND_SENIORY.md)).
10. **Decisiones abiertas**.
