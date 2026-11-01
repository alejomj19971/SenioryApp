# Módulo Reservas

Contratar a un cuidador y el ciclo de vida del servicio: solicitado → aceptado → en curso → finalizado (o cancelado). Plan: [docs/PLAN_BACKEND_SENIORY.md, M4](../../../docs/PLAN_BACKEND_SENIORY.md).

## Qué hace

- **Familia:** `POST /servicios` (con `Idempotency-Key`), `POST /servicios/:id/cancelar`, `POST /servicios/:id/calificacion`.
- **Cuidador:** `POST /servicios/:id/aceptar`, `/rechazar`, `/iniciar` y `/finalizar`.
- **Ambos:** `GET /servicios` (mis servicios, paginado, filtro por `estado`) y `GET /servicios/:id`.
- **Cuidador en turno:** `GET /adultos-mayores/:id/cuidador-en-turno` (solo la familia vinculada).
- **Tarea programada:** cancela con motivo «expirada» las solicitudes que el cuidador no respondió a tiempo.

## La máquina de estados (E9)

```text
(nuevo) ── solicitar (familia) ─────────▶ solicitado      o  aceptado, si el cuidador activó la aceptación automática
solicitado ── aceptar (cuidador) ───────▶ aceptado
solicitado ── rechazar (cuidador) ──────▶ cancelado  (motivo «rechazada»)
solicitado ── expirar (sistema) ────────▶ cancelado  (motivo «expirada»)
solicitado / aceptado ── cancelar (familia) ▶ cancelado  (motivo «cancelada_por_familia»)
aceptado ── cancelar_por_pago (sistema) ▶ cancelado  (motivo «pago_fallido»: el pago se rechazó o venció)
aceptado ── iniciar (cuidador) ─────────▶ en_curso
en_curso ── finalizar (cuidador) ───────▶ finalizado
```

Es una función pura sobre una tabla (`maquina-de-estados.ts`); una prueba la compara con esta misma tabla y comprueba que las otras 135 combinaciones de estado × acción × actor se rechazan (403 si ese actor nunca puede hacerlo, 409 si el estado no lo admite). `finalizado` y `cancelado` son finales. Cada transición deja una fila en `historial_de_estados`.

## Reglas que conviene saber

| Tema                 | Regla                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quién pone el precio | **El servidor.** El cliente nunca envía montos: se cotiza con Pagos y el desglose queda **congelado** en el servicio con la versión de la política (E10). Cualquier campo extra en el cuerpo se rechaza (400).                                                                                                                                                                        |
| Qué ve cada quien    | La familia ve lo que paga (subtotal, cargo y total) y nunca lo que recibe el cuidador. El cuidador ve lo que recibe y nunca lo que paga la familia. El teléfono de nadie sale, salvo en «cuidador en turno».                                                                                                                                                                          |
| Fecha y franja (H2)  | La fecha es un día civil de Colombia, nunca un instante UTC. No puede ser anterior a hoy ni pasar de 180 días; si es hoy, la franja no puede haber terminado (a las 8 p. m. queda solo la noche, aunque en UTC ya sea mañana). Franjas: mañana 06–12, tarde 12–18, noche 18–06.                                                                                                       |
| Cuidador             | Debe estar visible (Directorio) y atender esa jornada. Si no, 404 o 422.                                                                                                                                                                                                                                                                                                              |
| Familia              | Debe estar vinculada a la persona mayor, que debe tener consentimiento vigente de datos de salud. Una persona ajena responde **404**, igual que una inexistente, y el intento queda auditado.                                                                                                                                                                                         |
| Sin doble reserva    | Un cuidador no puede tener dos servicios activos (solicitado, aceptado o en curso) en la misma fecha y franja: índice único parcial en la base. Si dos familias piden a la vez, **una recibe 201 y la otra 409** (`servicio.franja_ocupada`).                                                                                                                                         |
| Idempotencia         | `Idempotency-Key` (8–100 caracteres) es obligatoria. El mismo reintento devuelve el mismo servicio (201 la primera vez, 200 después, aunque lleguen simultáneos); la misma clave con otra solicitud es 409.                                                                                                                                                                           |
| Aceptación           | Por defecto el cuidador debe aceptar, dentro de **2 horas** (30 minutos si el servicio es para hoy). Solo si el propio cuidador activó la aceptación automática nace aceptado. Pasado el plazo ya no puede aceptar, aunque la tarea no haya corrido.                                                                                                                                  |
| Iniciar              | Solo dentro de la franja del servicio, o hasta 30 minutos antes; con `REQUIERE_PAGO_APROBADO=true` además el **pago debe estar aprobado** (422 `servicio.pago_pendiente`). (Decisión abierta: check-in del cuidador, como hoy, o automático.)                                                                                                                                         |
| Cancelar             | La familia, mientras esté solicitado o aceptado. El evento lleva las horas de anticipación; Pagos devuelve el dinero (hoy siempre todo: la política de cancelación tardía es una decisión abierta).                                                                                                                                                                                   |
| Calificar            | Solo la familia que contrató, solo un servicio finalizado y una sola vez. Crea la reseña del cuidador (Directorio) y suma el servicio a su contador.                                                                                                                                                                                                                                  |
| Concurrencia         | Cada acción toma la fila con `FOR NO KEY UPDATE` y guarda con bloqueo optimista por `version`: dos acciones simultáneas sobre el mismo servicio se atienden una tras otra o la segunda recibe 409.                                                                                                                                                                                    |
| Pago                 | Pagos cobra al confirmarse el servicio y avisa con eventos: `pago_aprobado` hace que Reservas anote `pagado_en`; `pago_rechazado` (la pasarela lo rechazó, venció o la bolsa no alcanzó) cancela el servicio **aceptado** con motivo `pago_fallido`. Uno ya iniciado se deja terminar. Pagar con la bolsa exige saldo desde que se pide el servicio (422 `bolsa.saldo_insuficiente`). |
| Servicio ajeno       | Cada acción verifica quién es el actor y su relación con el servicio. Quien no es parte recibe **404**, igual que si no existiera.                                                                                                                                                                                                                                                    |

## Lo que otros módulos pueden usar

`ReservasModule` exporta **solo** `CONSULTA_DE_RESERVAS` ([puerto](./aplicacion/puertos/entrada/consulta-de-reservas.ts)); una prueba lo verifica.

| Método                                                   | Quién lo usa                       | Devuelve                                                                                                                |
| -------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `obtenerServicio(id)`                                    | Pagos, Notificaciones, Mensajería  | IDs, estado, fecha, jornada y horas; **sin dinero ni datos personales**. `null` si no existe                            |
| `cuidadorTieneServicioActivo(cuidadorId, adultoMayorId)` | Teleasistencia, **en cada acceso** | Verdadero con un servicio en curso, o aceptado cuya franja es ahora. Terminar o cancelar corta el acceso de inmediato   |
| `obtenerParticipantes(id)`                               | Mensajería                         | La cuenta del familiar y la del cuidador que pueden hablar en ese servicio                                              |
| `hayServicioActivoEntre(familiarId, cuidadorId)`         | Mensajería, **en cada envío**      | Verdadero con un servicio solicitado, aceptado o en curso entre los dos. Terminado o cancelado, ya no se puede escribir |

Reservas usa: de Identidad, `esFamiliarVinculado`, `tieneConsentimientoVigente` y `obtenerAdultoMayor`; de Directorio, `obtenerCuidadorParaContratar`, `obtenerContactoDeCuidador` y `obtenerCuidadorPorUsuario`; de Pagos, `COTIZADOR_DE_SERVICIOS` y `CONSULTA_DE_PAGOS` (¿alcanza la bolsa?). Pagos **no** puede consultar a Reservas (Reservas ya depende de Pagos): por eso el evento `servicio_confirmado` lleva las condiciones de cobro.

## Eventos

Contratos en [`compartido/eventos/reservas.ts`](../compartido/eventos/reservas.ts). Solo IDs y valores cerrados.

| Evento                         | Cuándo                                                              | Quién reacciona                                              |
| ------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| `reservas.servicio_solicitado` | La familia pide el servicio                                         | Notificaciones avisa al cuidador (M5)                        |
| `reservas.servicio_confirmado` | El cuidador acepta (o nace aceptado); trae las condiciones de cobro | Pagos cobra (M7); Notificaciones avisa a la familia          |
| `reservas.servicio_iniciado`   | El cuidador marca que inició                                        | Notificaciones                                               |
| `reservas.servicio_finalizado` | El cuidador marca que terminó                                       | Directorio suma al contador del cuidador; Pagos liquida (M7) |
| `reservas.servicio_cancelado`  | Rechazo, expiración, cancelación de la familia o pago fallido       | Pagos devuelve el dinero (M7); Notificaciones                |
| `reservas.servicio_calificado` | La familia califica un servicio finalizado                          | Directorio crea la reseña y recalcula el promedio            |

Y Reservas **consume** `pagos.pago_aprobado` (anota `pagado_en`) y `pagos.pago_rechazado` (cancela por pago fallido).

## Variables de entorno

`INTERVALO_EXPIRACION_SERVICIOS_MS` (por defecto 60 000: cada minuto). 0 la apaga, **solo en pruebas**; la configuración lo prohíbe en producción. `REQUIERE_PAGO_APROBADO` (obligatoria en staging y producción) exige el pago aprobado para iniciar. Detalle en [`.env.ejemplo`](../../.env.ejemplo).

## Estructura

```text
reservas/
├─ dominio/                       ← Servicio, máquina de estados, franjas, Calificacion, cursor
├─ aplicacion/
│  ├─ casos-de-uso/               ← solicitar, acciones del cuidador, cancelar, calificar, expirar, consultar
│  ├─ servicios/                  ← acceso a servicios, ejecutor de acciones, vistas, eventos, consulta para otros módulos
│  └─ puertos/{entrada,salida}/
└─ infraestructura/
   ├─ entrada/{http,programado}/  ← controladores y la tarea de expiración
   └─ salida/persistencia/
```
