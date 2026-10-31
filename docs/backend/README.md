# Planes del backend por módulo

Cada archivo de esta carpeta es el **plan detallado de un módulo**: lo que se construye, con qué archivos, interfaces, tablas, endpoints, pruebas y pull requests. Se implementan **en orden** y cada uno termina con una revisión del equipo.

El marco general (stack, reglas de arquitectura, estándares y orden) está en [PLAN_BACKEND_SENIORY.md](../PLAN_BACKEND_SENIORY.md). La arquitectura de referencia es [ADR-01](../ADR-01.md) y su diagrama.

**Diseño de la base de datos** (los 8 esquemas y 38 tablas de todos los módulos, **ya construida**): [BASE_DE_DATOS.md](./BASE_DE_DATOS.md).

## Estado

| # | Módulo | Bloque del diagrama | Plan | Estado |
|---|---|---|---|---|
| M0 | Plataforma y compartido | `compartido/`, API REST, eventos internos, base de datos | [M0-plataforma-y-compartido.md](./M0-plataforma-y-compartido.md) | **En construcción:** PR 1–4 de 8 hechos ([avance](../AVANCE.md)) |
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
| 2026-10-22 | **Los datos de salud viven en Teleasistencia.** Identidad guarda quién puede acceder (vínculos y consentimientos), no datos clínicos. | ADR-01 exige que los datos de salud vivan en un solo módulo, y los medicamentos y signos vitales ya son de Teleasistencia. | El diagrama pone «Datos de salud aquí» en Identidad y el escenario E6 de ADR-01 nombra a Identidad como artefacto. Mover la etiqueta del diagrama a Teleasistencia y registrar el cambio en el ADR-04: hecho en el [ADR-04](../ADR-04.md) (borrador), D3. |
| 2026-10-22 | El evento que publica Reservas al pasar a `Aceptado` se llama **`ServicioConfirmado`**, como en el diagrama. | Mantener el lenguaje del diagrama y de ADR-01. | — |
| 2026-10-22 | **NestJS 12 con sus valores por defecto:** Express, `class-validator`, Vitest, oxlint y ESM (al crear el proyecto se confirmó que Nest 12 ya no genera Jest ni ESLint). Node 24 LTS. Se mantiene Drizzle. Cada `@Module` exporta solo sus puertos de entrada. | Menor curva de aprendizaje: la documentación oficial y los tutoriales usan esas opciones. Drizzle se mantiene porque un esquema por módulo hace visible E13. Los `exports` mínimos hacen que Nest falle al arrancar si un módulo inyecta algo ajeno. | Registrado en el [ADR-04](../ADR-04.md) (borrador). |
| 2026-10-24 | **El frontend usa Next como BFF** ([PLAN_FRONTEND](../PLAN_FRONTEND_SENIORY.md)). Ajustes al backend: ventana de gracia de 30 s al renovar el token (M1), `Origin` verificado solo si viene (M1), IP del cliente por `X-Cliente-IP` con secreto compartido (M0). | El navegador ya no llama a la API; lo hacen los servidores de Next. | Registrado en el [ADR-04](../ADR-04.md) (borrador). |
| 2026-10-26 | **Es la aplicación real, no una demo.** (1) Los adaptadores simulados y los datos de ejemplo existen solo para desarrollo y pruebas; en producción el arranque los rechaza. (2) Producción recibe datos de **referencia** por migración, administradores por línea de comandos y cuidadores reales por importación verificada. (3) Sin «línea de emergencia» simulada: la alerta avisa a la familia y al cuidador. (4) El cuidador acepta los servicios él mismo (vista mínima en F4) y la solicitud expira. (5) Nueva sección de requisitos legales, operativos y de negocio para lanzar. | Una aplicación con datos de salud y dinero real no puede prometer ni simular lo que no hace. | [PLAN_BACKEND §1 y §12](../PLAN_BACKEND_SENIORY.md), [BASE_DE_DATOS §9](./BASE_DE_DATOS.md). Registrado en el [ADR-04](../ADR-04.md) (borrador). |
| 2026-10-26 | **La base de datos completa se construyó por adelantado** (8 esquemas, 37 tablas, 10 migraciones, 253 pruebas de restricciones), en vez de módulo por módulo. Se añaden 3 triggers de integridad (auditoría y libro de la bolsa de solo inserción; cuidador visible solo con las tres verificaciones). | Tener la base completa y probada desde el principio permite que cada módulo se apoye en ella; los cambios posteriores van en migraciones nuevas. | Ver [BASE_DE_DATOS.md](./BASE_DE_DATOS.md). Política: las migraciones se pueden aplanar antes del primer despliegue a producción. |
| 2026-10-22 | Se agrega el módulo **`mensajeria`**. | La mensajería es una funcionalidad de ADR-01 §1 y existe en el frontend, pero no aparece como módulo en el diagrama ni en ADR-01 §4.7. | Registrado en el [ADR-04](../ADR-04.md) (borrador), D4; falta actualizar la imagen del diagrama. |

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
