# Módulo Mensajería

El chat entre una familia y un cuidador. Plan: [docs/PLAN_BACKEND_SENIORY.md, M8](../../../docs/PLAN_BACKEND_SENIORY.md).

> **Alcance:** solo se guardan y entregan mensajes. **No hay presencia ni «Escribiendo…»** (H11). Las conversaciones no son un canal para datos de salud: ningún dato clínico entra ni sale de este módulo.

## Qué hace

- `POST /conversaciones` (familias) `{ cuidadorId }`: obtiene o crea la conversación con ese cuidador (201 si la creó, 200 si ya existía).
- `GET /conversaciones`: mis conversaciones, la de la última charla primero, con el nombre y la foto de la otra parte y si hoy se puede escribir.
- `GET /conversaciones/:id/mensajes?antes=&limite=`: del más reciente al más antiguo, paginado por cursor (hasta 100).
- `POST /conversaciones/:id/mensajes` `{ texto, idDeCliente }`: escribe (201) o reenvía uno ya enviado (200).
- `GET /mensajeria/eventos` (SSE): los mensajes nuevos de todas mis conversaciones, en vivo.

## Reglas que conviene saber

| Tema                     | Regla                                                                                                                                                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quién entra              | **Solo las dos partes.** Cualquier otra persona recibe **404**, igual que una conversación inexistente, y el intento queda auditado (`mensajeria.acceder_conversacion`).                                                                                        |
| Quién puede escribir     | Las dos partes, **solo mientras haya un servicio vivo entre ellas** (solicitado, aceptado o en curso; lo pregunta a Reservas en cada envío). Con el servicio terminado o cancelado, escribir da 422; **leer lo ya escrito siempre se puede**.                   |
| Abrir                    | Solo la familia, y solo con un servicio vivo con ese cuidador. Una conversación ya existente se devuelve siempre. Dos aperturas a la vez devuelven la misma.                                                                                                    |
| Reenvíos                 | `idDeCliente` lo genera la interfaz para cada mensaje. Reenviar el mismo (mala conexión, también si llegan a la vez) devuelve el mismo mensaje y no lo duplica, aunque el servicio haya terminado. Otra persona con el mismo `idDeCliente` es otro mensaje.     |
| El texto                 | **Texto plano**, de 1 a 1000 caracteres (un emoji cuenta uno), sin espacios ni saltos de línea sobrantes en los extremos. Se rechazan los caracteres de control (el NUL ni cabe en Postgres). Nunca se interpreta como HTML: la interfaz lo muestra como texto. |
| Lo que sale              | Solo nombre y foto de la otra parte. **Ni teléfono ni correo.** Cada mensaje dice si es `yo` u `otro`, y solo los míos traen `idDeCliente`.                                                                                                                     |
| Paginación               | Cursor `(hora, id)`: un mensaje que entra mientras se pagina no descuadra las páginas, y los del mismo instante conservan un orden estable.                                                                                                                     |
| Límites                  | Escribir: 60 por minuto y por IP. Abrir: 30. Eventos en vivo: 20 conexiones por minuto y **5 abiertas por persona** (lo hace cumplir `ConexionesDeFlujos`, antes de empezar a transmitir).                                                                      |
| Sin texto en los eventos | `mensajeria.mensaje_enviado` lleva solo ids. El aviso a Notificaciones tampoco dice el texto ni quién escribió.                                                                                                                                                 |

## Eventos en vivo (SSE)

Cada mensaje sale como `event: mensaje` con `id` = su posición en la línea de tiempo y `data` = el mensaje. Cada 20 segundos sin novedades sale `event: latido`.

- **Reconexión sin perder nada:** el navegador se reconecta con `Last-Event-ID` y el flujo sigue desde ahí. Un `Last-Event-ID` que no es nuestro da 400 antes de transmitir.
- **Al menos una vez:** tras reconectar, o por una ventana de seguridad de 10 s (un mensaje se confirma un poco después de ponerle la hora), puede repetirse un mensaje de los últimos segundos. **La interfaz debe reconocer los mensajes por su `id`.**
- **Sin estado en memoria:** cada conexión consulta la base cada 2 s y se despierta al instante cuando este servidor se entera de un mensaje. Con varias instancias funciona igual (las demás se enteran en su siguiente revisión).
- **Acceso vigente:** las conversaciones se vuelven a leer en cada vuelta; quien deja de ser parte de una deja de recibirla de inmediato.
- **Vida máxima de 10 minutos:** la conexión se cierra sola y la interfaz se reconecta, así la sesión se vuelve a verificar. Tras 3 fallos seguidos también se cierra.
- **Apagado limpio:** al detener el servidor se cierran todas las conexiones abiertas (si no, nunca terminaría de apagarse).

La infraestructura genérica (`compartido/infraestructura/sse/conexiones-de-flujos.ts`) sirve también para el flujo en vivo de Teleasistencia, que está pendiente.

## Lo que otros módulos pueden usar

`MensajeriaModule` **no exporta nada**; una prueba lo verifica. Usa de Reservas `hayServicioActivoEntre`, de Directorio `obtenerContactoDeCuidador` y `obtenerCuidadorPorUsuario`, y de Identidad `obtenerContacto`.

## Eventos

Contrato en [`compartido/eventos/mensajeria.ts`](../compartido/eventos/mensajeria.ts).

| Evento                       | Dirección | Datos                                                      | Quién reacciona                                                                                                                       |
| ---------------------------- | --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `mensajeria.mensaje_enviado` | Publica   | `mensajeId`, `conversacionId`, `autorId`, `destinatarioId` | Notificaciones avisa a la otra parte, **agrupado** (una vez cada 5 min por conversación); Mensajería despierta las conexiones en vivo |

El plan decía que Mensajería también consumiría `ServicioCancelado`: no hace falta, porque el permiso de escribir se pregunta a Reservas en cada envío.

## Estructura

```text
mensajeria/
├─ dominio/                       ← Conversacion, Mensaje (texto plano), cursor
├─ aplicacion/
│  ├─ casos-de-uso/               ← abrir, listar conversaciones, enviar, listar mensajes, mensajes nuevos
│  ├─ manejadores/                ← despertar las conexiones en vivo
│  ├─ servicios/                  ← acceso a conversaciones, vistas, eventos
│  └─ puertos/salida/             ← repositorios y avisador de flujos
└─ infraestructura/
   ├─ entrada/{http,sse}/         ← controlador, flujo en vivo y concentrador
   └─ salida/persistencia/        ← Drizzle
```
