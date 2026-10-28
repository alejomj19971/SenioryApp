# Planes del frontend por módulo

Cada archivo es el plan detallado de cómo una parte del frontend pasa de los datos de prueba (`frontend/data/`) al backend real. El marco general está en [PLAN_FRONTEND_SENIORY.md](../PLAN_FRONTEND_SENIORY.md). Cada módulo F*n* se construye cuando su módulo M*n* del backend está listo ([docs/backend/](../backend/README.md)).

## Estado

| # | Módulo | Requiere en el backend | Plan | Estado |
|---|---|---|---|---|
| F0 | Base de integración | M0 (solo `/salud`) | [F0-base-de-integracion.md](./F0-base-de-integracion.md) | Propuesta |
| F1 | Identidad | M1 | [F1-identidad.md](./F1-identidad.md) | Propuesta |
| F2 | Directorio | M2 | — | Pendiente |
| F3 | Cotización | M3 | — | Pendiente |
| F4 | Contratación | M4 | — | Pendiente |
| F5 | Notificaciones | M5 | — | Pendiente |
| F6 | Teleasistencia | M6 | — | Pendiente |
| F7 | Pagos y bolsas | M7 | — | Pendiente |
| F8 | Mensajería | M8 | — | Pendiente |
| F9 | Cuidadores y administración | M9 | — | Pendiente |

## Decisiones tomadas al construir los planes

| Fecha | Decisión | Motivo | Pendiente en otros documentos |
|---|---|---|---|
| 2026-10-24 | **Next actúa como BFF:** el navegador solo habla con Next; los componentes de servidor y las acciones de servidor llaman al backend. Reemplaza la idea de reescrituras (`rewrites`) de M1 §7.1. | Es lo que recomienda la documentación de Next 16: leer en componentes de servidor directamente desde la fuente y escribir con acciones de servidor, que traen protección CSRF y pueden escribir cookies. El backend no queda expuesto al navegador. | M1 §7 actualizado. |
| 2026-10-26 | **Ya no hay demo: es la aplicación real.** Se elimina el adaptador y el modo `semilla` (`SENIORY_FUENTE_DATOS`). Cada módulo F reimplementa su servicio sobre la API y **borra el JSON que reemplaza**; `data/` desaparece al terminar F8. Reemplaza la decisión del 2026-10-24 de conservar el modo `semilla`. | Un interruptor entre datos de prueba y reales no tiene lugar en producción, y mantener dos caminos duplica pruebas y errores. | Staging es solo para el equipo hasta F8. Ver [PLAN_FRONTEND §1 y §7](../PLAN_FRONTEND_SENIORY.md). |
| 2026-10-24 | Ajustes al backend: ventana de gracia de 30 s al renovar el token, verificación de `Origin` solo si viene el encabezado, IP del cliente vía `X-Cliente-IP` con secreto compartido. | Con un BFF, las peticiones llegan desde los servidores de Vercel, sin `Origin` y desde pocas IP, y varias pueden renovar la sesión a la vez. | M0 §4.10 y M1 §4.4 y §5 actualizados. |
