# F2 — Directorio en el frontend

| Campo | Valor |
|---|---|
| **Módulo** | F2 |
| **Requiere en el backend** | M2 (Directorio) y M9 (hoja de vida) |
| **Estado** | Construido (2026-11-01) |

## Qué hace
- `/app/cuidadores`: búsqueda **en el servidor** con filtros en la URL (`busqueda`, `especialidad`, `jornada`, `zona`, `tarifaMaxima`); se pueden compartir y «atrás» funciona. «Ver más» pide la página siguiente con el cursor del backend (acción de servidor `cargarMasCuidadores`).
- `/app/cuidadores/[id]`: perfil con verificación, reseñas y el enlace a la hoja de vida solo si existe.
- `/api/cuidadores/[id]/hoja-de-vida`: el servidor de Next entrega el PDF ([INTEGRACION §7](../INTEGRACION_FRONTEND_BACKEND.md)).

## Decisiones
| Tema | Decisión |
|---|---|
| Datos de contacto (H1) | Ninguno: el backend no los entrega y el mapeo es una lista blanca. Una prueba revisa el HTML y lo que viaja al navegador. `CuidadorEnTurno` es un tipo aparte y es el único que trae teléfono (F4). |
| Ids | UUID. Un id que no lo sea es «no encontrado» sin llegar al backend. |
| Calificación | `null` se dice «Sin reseñas todavía», nunca «0 estrellas». |
| Estrellas | Ámbar (`warning`): el verde (`accent`) significa salud y verificación. |
| Remontar | La búsqueda **no** se remonta al filtrar (se perdería el foco y el panel abierto): las páginas de «Ver más» se guardan con la búsqueda a la que pertenecen. |
| Hoja de vida | La vista no dice si existe; se pregunta (302/404). Pendiente en el backend: `tieneHojaDeVida`. |

## Pruebas
Unitarias (filtros, servicio, buscador), de contrato contra el backend local (forma exacta, sin contacto, cursor, filtros, 404/400, hoja de vida) y recorridos de Playwright (búsqueda, filtro, perfil sin contacto, 404, PDF de la hoja de vida, sin sesión).
