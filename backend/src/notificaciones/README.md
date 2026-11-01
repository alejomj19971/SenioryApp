# Módulo Notificaciones

Convierte lo que pasa en el sistema en avisos para las personas. Hoy avisa de cada cambio del servicio (E9) a la familia y al cuidador; las alertas de teleasistencia (E11) se enchufan en M6. Plan: [docs/PLAN_BACKEND_SENIORY.md, M5](../../../docs/PLAN_BACKEND_SENIORY.md).

## Qué hace

- **Reacciona a eventos** de Reservas (solicitado, confirmado, iniciado, finalizado y cancelado) de Teleasistencia (alerta, toma omitida y lectura fuera de rango) y de Pagos (pago requerido, reembolso, compra de bolsa), y crea el aviso de cada parte, con su propio texto.
- **Los envía** con una tarea programada (cada 2 s): tomar, enviar, guardar el resultado; reintenta lo que falla.
- **La campana:** `GET /notificaciones` (cualquier persona con sesión ve solo los suyos).
- No exporta nada: nadie lo llama, solo reacciona a eventos.

## Canales

| Canal                               | Estado hoy                                                                                                                                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app` (la campana)                  | **Real.** El aviso guardado ES el mensaje; se entrega al instante.                                                                                                                                                                                                |
| `correo`, `sms`, `whatsapp`, `push` | **Sin proveedor** (decisión abierta). No se registran: no se finge que existen. Con `CANALES_DE_NOTIFICACION_SIMULADOS=true` (solo desarrollo y pruebas) se simulan escribiendo el título en el log; la configuración **no deja arrancar en producción** con eso. |

Un canal es un adaptador intercambiable (`CanalDeNotificacion`); agregar el real es escribir uno y registrarlo en el módulo.

## Reglas que conviene saber

| Tema                     | Regla                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un aviso por canal       | Cada canal es una notificación aparte, con su estado (`pendiente` → `enviada` / `entregada` / `fallida`), sus intentos y su reintento.                                                                                                                                                                                                  |
| Normal vs. alta          | Un aviso **normal** sale por la aplicación y el correo. Una **alerta** (prioridad alta) sale por **todos** los canales disponibles **a la vez**, para que llegue por al menos uno. SMS y WhatsApp cuestan por mensaje y se reservan para alertas.                                                                                       |
| Sin duplicados           | La base ignora un aviso con el mismo evento, destinatario, tipo y canal: reprocesar un evento no repite nada (y el despachador ya entrega cada evento una vez por manejador).                                                                                                                                                           |
| Reintentos               | Hasta 5 intentos, con espera creciente (30 s, 2 min, 10 min, 30 min). Agotados, queda `fallida`. Un fallo que reintentar no arregla (la persona no tiene teléfono) queda `fallida` de una vez.                                                                                                                                          |
| Alerta sin entregar      | Si una alerta queda `fallida` en **todos** sus canales y por ninguno salió, se deja constancia (`notificaciones.alerta_sin_entregar` en la auditoría y un error en el log; Sentry cuando exista). Un aviso por alerta, no uno por canal.                                                                                                |
| Envío sin transacción    | El envío NUNCA ocurre con una transacción abierta: se toma el aviso (reservándolo, `FOR UPDATE SKIP LOCKED`), se envía, y se guarda el resultado. Un proveedor lento no retiene la base, y varias instancias no se pisan.                                                                                                               |
| Minimización (Ley 1581)  | Los textos solo dicen **fecha, franja y horas**, o que hay algo que mirar: nada de salud, porque SMS, correo y WhatsApp no son confiables para datos clínicos. La **única excepción** es la alerta, que lleva el nombre de la persona (sin él no se sabría de quién es). Texto plano, sin HTML. Una prueba revisa todas las plantillas. |
| Límite                   | Máximo 60 avisos **normales** por persona y hora (un error en un manejador no debe inundar a nadie). Las alertas nunca se descartan.                                                                                                                                                                                                    |
| Privacidad de la campana | El destinatario sale de la sesión, nunca de un parámetro: un parámetro `destinatarioId` se rechaza (400).                                                                                                                                                                                                                               |

## Los avisos de Teleasistencia

| Evento                                  | A quién                               | Prioridad | Texto                                                            |
| --------------------------------------- | ------------------------------------- | --------- | ---------------------------------------------------------------- |
| `teleasistencia.alerta_generada`        | Los destinatarios que trae el evento  | **Alta**  | «Alerta de {nombre}» … «Si es una emergencia, llama al 123.»     |
| `teleasistencia.medicamento_omitido`    | Familia vinculada y cuidador en turno | Normal    | «Hay una toma sin registrar» (sin decir cuál medicamento)        |
| `teleasistencia.lectura_fuera_de_rango` | Familia vinculada y cuidador en turno | **Alta**  | «Hay un registro para revisar» (sin decir cuál medida ni cuánto) |

Cuando sale el primer aviso de una alerta, Notificaciones publica `notificaciones.notificacion_entregada` (solo para avisos de alertas): con él Teleasistencia marca la alerta como «notificada» y mide E11.

## Los avisos de Mensajería

| Evento                       | A quién       | Texto                                         |
| ---------------------------- | ------------- | --------------------------------------------- |
| `mensajeria.mensaje_enviado` | La otra parte | «Tienes un mensaje nuevo»: ábrela para leerlo |

**Agrupado:** si a esa persona ya se le avisó de esa conversación en los últimos 5 minutos, no se repite (al abrir la aplicación ve todos). El aviso **no lleva el texto ni el nombre** de quien escribió: por correo o SMS no hay privacidad para una conversación.

## Los avisos de Pagos

Los avisos de pago **no llevan montos**: dicen que hay algo por hacer y mandan a abrir Seniory.

| Evento                   | A quién                                         | Texto                                                              |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------ |
| `pagos.pago_requerido`   | La familia que paga                             | «Falta pagar tu servicio»: está confirmado, págalo para asegurarlo |
| `pagos.pago_reembolsado` | La familia                                      | «Te devolvimos tu pago»                                            |
| `pagos.pago_rechazado`   | La familia, **solo si era una compra de bolsa** | «No se completó tu compra» (distingue vencida de rechazada)        |
| `pagos.bolsa_comprada`   | La familia                                      | «Tu bolsa ya tiene saldo»                                          |

Cuando falla el pago de un **servicio** no hay un aviso de pago aparte: Reservas lo cancela con motivo `pago_fallido` y el aviso de la cancelación ya lo explica a las dos partes (dos avisos por lo mismo serían ruido).

## Los avisos de cada cambio del servicio

| Evento                         | A la familia                                  | Al cuidador                   |
| ------------------------------ | --------------------------------------------- | ----------------------------- |
| `reservas.servicio_solicitado` | «Solicitud enviada»                           | «Nueva solicitud de servicio» |
| `reservas.servicio_confirmado` | «Servicio confirmado»                         | «Servicio confirmado»         |
| `reservas.servicio_iniciado`   | «El servicio comenzó»                         | «Iniciaste el servicio»       |
| `reservas.servicio_finalizado` | «Servicio finalizado» (invita a calificar)    | «Servicio finalizado»         |
| `reservas.servicio_cancelado`  | Según el motivo: rechazada, venció, o canceló | Según el motivo               |

Los textos viven en [`dominio/plantillas.ts`](./dominio/plantillas.ts), con un tipo `evento:rol` (por ejemplo `servicio_confirmado:familia`).

## Variables de entorno

`INTERVALO_ENTREGA_NOTIFICACIONES_MS` (por defecto 2 000; 0 apaga el envío, **solo en pruebas**) y `CANALES_DE_NOTIFICACION_SIMULADOS` (por defecto `false`). Ambas se validan al arrancar: en producción no se admite 0 ni `true`. Detalle en [`.env.ejemplo`](../../.env.ejemplo).

## Para agregar un aviso nuevo (por ejemplo, las alertas de M6)

1. Una plantilla en `dominio/plantillas.ts` (sin datos clínicos).
2. Un manejador del evento que llame a `CrearAvisos` con `prioridad: 'alta'` si es una alerta.
3. Registrarlo en `notificaciones.module.ts`.

El envío, los reintentos y la alarma de «sin entregar» ya funcionan para cualquier aviso.

## Estructura

```text
notificaciones/
├─ dominio/                       ← Notificacion (estados, reintentos), plantillas en español
├─ aplicacion/
│  ├─ casos-de-uso/               ← crear avisos, entregar pendientes, listar mis notificaciones
│  ├─ manejadores/                ← reacción a los eventos de Reservas
│  └─ puertos/salida/             ← canales y repositorio
└─ infraestructura/
   ├─ entrada/http/               ← GET /notificaciones
   └─ salida/{canales,persistencia}/
```
