# F8 — Mensajería en el frontend

| Campo | Valor |
|---|---|
| **Módulo** | F8 |
| **Requiere en el backend** | M8 (Mensajería: conversaciones, mensajes y eventos en vivo) |
| **Estado** | Construido (2026-11-01) |

## Qué hace
- **Familia:** `/app/mensajes` (sus conversaciones, la de la última charla primero) y `/app/mensajes/[id]` (el chat). Se llega con **«Escribir a …»** desde el detalle de un servicio (pedido, aceptado o en curso) o desde la ficha del cuidador en turno, y con el ícono de mensajes del encabezado.
- **Cuidador:** `/cuidador/mensajes` y `/cuidador/mensajes/[id]`, desde su panel. **Solo la familia abre** una conversación; el cuidador contesta las que le abren.

## Decisiones
| Tema | Decisión |
|---|---|
| Honestidad (H11) | El sistema solo guarda y entrega mensajes: **no hay «en línea» ni «escribiendo…»** porque no sabe nada de eso. Lo único que dice del estado de la conexión es «Reconectando…» o «Sin conexión en vivo». |
| Tiempo real | El navegador abre un `EventSource` a `/api/mensajeria/eventos`; el servidor de Next reenvía los eventos del backend (el navegador **nunca habla con el backend**). El backend cierra cada conexión a los 10 min por diseño: el navegador retoma solo con `Last-Event-ID`. Si la conexión muere del todo, se reabre con espera creciente y `?desde=`; tras 3 fallos seguidos pasa a **respaldo**: consulta los mensajes cada 10 s mientras sigue intentando volver. |
| Entrega «al menos una vez» | El mismo mensaje puede llegar por el flujo, por la lista o por la respuesta de enviar: se reconoce por su `id` (`fusionarMensajes`) y no se repite. |
| Enviar | El mensaje aparece de inmediato («Enviando…»). Cada mensaje lleva un `idDeCliente` generado en la pantalla: si falla, se dice («No se envió») y **Reintentar usa el mismo** — no se duplica aunque la primera sí hubiera llegado. «Descartar» lo quita. Al llegar el del servidor, sustituye al local. |
| Límites | Texto plano, hasta 1000 caracteres (contador desde 900), sin caracteres de control. Se valida en la pantalla y de nuevo en la acción del servidor. |
| Servicio terminado | Leer siempre se puede; escribir solo con un servicio vivo. Si el servicio termina mientras se escribe, el chat pasa a solo lectura con la explicación. |
| Privacidad | De la otra parte solo se muestra el **nombre y la foto** (no el teléfono ni el correo, aunque el backend los mandara: lista blanca). El teléfono sigue saliendo únicamente del cuidador en turno. Una conversación ajena es 404, igual que si no existiera. |
| Anteriores | Se cargan de 50 en 50 con «Ver mensajes anteriores» (cursor del backend, validado antes de reenviarlo). |

## Pruebas
Unitarias (fusión sin duplicados y orden, validación de lo que llega por la red, lista blanca de la conversación, acciones con validación previa y servicio terminado, chat con mensajes en vivo repetidos, envío/fallo/reintento con el mismo `idDeCliente`, límites, solo lectura, anteriores y reconexión), de contrato (conversaciones, mensajes con paginación, idempotencia, 404 para lo ajeno y flujo SSE contra el backend real) y recorridos con **dos navegadores a la vez** (familia y cuidador conversan y los mensajes llegan sin recargar ni repetirse; un cuidador ajeno recibe 404).
