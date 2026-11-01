# F5 — Notificaciones en el frontend

| Campo | Valor |
|---|---|
| **Módulo** | F5 |
| **Requiere en el backend** | M5 (Notificaciones: la campana, `GET /notificaciones`) |
| **Estado** | Construido (2026-11-01) |

## Qué hace
- **Campana** en el encabezado de la familia y del cuidador, con un punto cuando hay avisos que la persona aún no ha visto **en ese dispositivo**.
- **`/app/avisos`** y **`/cuidador/avisos`:** los avisos de la persona, del más reciente al más antiguo, con «Ver avisos anteriores». Los **nuevos** llevan «Nuevo», las alertas llevan «Importante», y cada aviso lleva a su pantalla (servicios, bolsa, mensajes, teleasistencia) cuando existe en esa área.

## Decisiones
| Tema | Decisión |
|---|---|
| Qué es «nuevo» | El backend **no guarda «leído»** (no hay ruta para marcarlo). Lo «nuevo» se decide en el dispositivo: una cookie (`seniory_avisos_vistos`, solo del servidor, 1 año) guarda la fecha del aviso más reciente que la persona vio. Abrir los avisos la actualiza y **nunca retrocede**; una cookie dañada no esconde avisos. Consecuencia, dicha con honestidad: otro dispositivo de la misma persona lo verá como nuevo. No se muestra un número, solo el punto. |
| La campana no rompe nada | El punto se calcula en cada pantalla; si el backend no responde, simplemente no hay punto. |
| Qué dicen | Los textos los escribe el backend (por rol: la familia y el cuidador reciben cada uno el suyo) y **no llevan datos de salud**, ni montos, ni el texto de los mensajes. El frontend no los reescribe; muestra lo que llega. |
| Lista blanca | Solo `id`, `tipo`, `titulo`, `cuerpo`, `prioridad` y `creadaEn`; cualquier otro campo del backend se descarta. |
| Enlaces | `tipo` («evento:rol») decide a dónde lleva. Un tipo desconocido se muestra **sin enlace**, nunca roto; en el área del cuidador no hay teleasistencia ni bolsa, así que esos avisos no enlazan. |
| Tiempo real | Los avisos se entregan con una tarea del backend (cada 2 s) y se ven al abrir o recargar la pantalla; no hay flujo en vivo de avisos. Los mensajes nuevos sí llegan en vivo dentro del chat (F8). |

## Pruebas
Unitarias (lo «nuevo» según la cookie y cookies dañadas, validación de fechas y cursores, a dónde lleva cada tipo, lista blanca, la campana que nunca rompe la pantalla, marcar como visto sin retroceder, «ver anteriores» sin repetidos y con error), de contrato (sin sesión 401, cada parte recibe el suyo con su forma, nadie ve avisos ajenos, orden y cursor, límites y cursores inválidos, un destinatario que llegue de afuera se rechaza) y recorridos (la familia y el cuidador reciben cada uno su texto, «Servicio confirmado» llega a la familia al aceptar, y el punto aparece y se apaga).
