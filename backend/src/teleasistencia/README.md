# Módulo Teleasistencia

Los medicamentos, los signos vitales y las alertas de las personas mayores. **Es el único módulo que guarda datos de salud** (Ley 1581, art. 6). Plan: [docs/PLAN_BACKEND_SENIORY.md, M6](../../../docs/PLAN_BACKEND_SENIORY.md).

> **Alcance:** Teleasistencia es una herramienta de **aviso a la familia y al cuidador en turno**. No es un servicio de emergencias médicas ni un dispositivo médico, y **no hay (ni se simula) una «línea de emergencia»**. La pantalla de la alerta debe decir siempre a quién se avisó y ofrecer llamar al 123 (la API devuelve `avisadosA`, y el aviso lo recuerda). Revisar el texto con asesoría legal antes de lanzar.

## Qué hace

- **Plan de medicamentos:** `GET`/`POST /adultos-mayores/:id/medicamentos`, `POST /medicamentos/:id/desactivar`. Las tomas del día se generan solas.
- **Tomas:** `PATCH /medicamentos/:id/tomas/:tomaId` con `{ estado: 'tomada' | 'pendiente' }` (marcar o deshacer).
- **Signos vitales:** `GET`/`POST /adultos-mayores/:id/signos-vitales`, `GET …/signos-vitales/ultima`, `PUT …/rangos-de-referencia`.
- **Alertas:** `POST /adultos-mayores/:id/alertas` (con `Idempotency-Key`) y `PATCH /alertas/:id/atendida`.
- **Resumen:** `GET /adultos-mayores/:id/resumen`, una sola consulta para el inicio y la barra inferior.
- **Tarea programada:** marca como omitidas las tomas que pasaron la tolerancia.
- No exporta nada: los demás módulos se enteran por eventos que **no llevan datos clínicos**.

## Quién puede ver qué (E6)

**Todo caso de uso empieza consultando la `PoliticaDeAcceso`.** Se pregunta en CADA acceso: nunca se guarda una respuesta, así que revocar el consentimiento o terminar un servicio corta el acceso de inmediato.

| Quién                                       | Leer y registrar                                                    | Cambiar el plan (medicamentos, rangos) | Pedir ayuda / atender alerta           |
| ------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------- | -------------------------------------- |
| Familiar **vinculado**, con consentimiento  | ✅                                                                  | ✅                                     | ✅                                     |
| Familiar vinculado, **sin** consentimiento  | ❌ (404)                                                            | ❌                                     | ✅ — pedir ayuda no es un dato clínico |
| Cuidador con servicio **activo** ahora      | ✅ (en curso, o aceptado y dentro de su franja), con consentimiento | ❌                                     | ✅                                     |
| Cuidador con servicio terminado o cancelado | ❌ (404, al instante)                                               | ❌                                     | ❌                                     |
| Familia ajena, otro cuidador, otro rol      | ❌ (404)                                                            | ❌                                     | ❌                                     |

Una negativa responde **404**, igual que si la persona no existiera (no se revela que existe), y queda en la auditoría junto con los accesos permitidos.

## Reglas que conviene saber

| Tema                     | Regla                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tomas del día (H6)       | Una por medicamento, día y hora (restricción única): generarlas es idempotente, también con consultas simultáneas. Se marcan o deshacen **solo el día que corresponde**, en hora de Colombia: la de las 11:30 p. m. se marca ese día aunque en UTC ya sea otro. Deshacer queda en la auditoría.                                                                                            |
| Omisión                  | Una toma pendiente pasada la **tolerancia** (60 min por defecto, `TOLERANCIA_DE_TOMA_MINUTOS`; decisión abierta) queda `omitida` y se avisa a la familia. Una omitida que sí se tomó se puede registrar ese mismo día. Un medicamento desactivado no genera omisiones.                                                                                                                     |
| Concurrencia             | Marcar y deshacer desde dos pantallas a la vez: bloqueo de fila + `version`; una gana y la otra recibe 409.                                                                                                                                                                                                                                                                                |
| Lecturas                 | Las medidas son opcionales (H8), pero la presión va completa; valores **plausibles** (detectan errores de digitación, no condiciones clínicas); no del futuro ni de hace más de 30 días. Sin lecturas, las listas van vacías, nunca un error.                                                                                                                                              |
| Fuera de rango           | Se compara con los rangos de la persona (o los generales). Si sale de rango se anuncia `lectura_fuera_de_rango` **sin decir cuál medida ni cuánto**, y la familia y el cuidador reciben un aviso de prioridad alta que solo manda a abrir Seniory.                                                                                                                                         |
| Alertas (H7, E11)        | La clave de idempotencia la genera el cliente: un reintento (también simultáneo) devuelve la misma alerta. Los destinatarios (familiares vinculados y cuidador en turno) se resuelven aquí y viajan en el evento. Notificaciones avisa por **todos los canales a la vez**. Al entregarse el primer aviso, la alerta pasa a `notificada` y queda `primera_entrega_en` (E11: menos de 30 s). |
| Sin datos clínicos fuera | Los eventos llevan solo IDs; los avisos solo dicen que hay algo que mirar (la alerta lleva el nombre de la persona, sin el cual no se sabría de quién es). Ningún dato clínico en logs, eventos ni avisos: pruebas lo verifican.                                                                                                                                                           |

## Rangos de referencia

⚠️ **Los umbrales clínicos los define un profesional de salud, no el equipo de desarrollo.** Los de [`RANGOS_POR_DEFECTO`](./dominio/signos.ts) (presión 90–140 / 60–90, pulso 50–100, glucosa 70–180) son **provisionales**, de uso general, y existen para que la función no quede muerta. Hay que revisarlos con un profesional **antes de lanzar**; lo ideal es que cada persona tenga los suyos (`PUT …/rangos-de-referencia`, que hoy carga la familia con lo que indique el médico).

## Eventos

Contratos en [`compartido/eventos/teleasistencia.ts`](../compartido/eventos/teleasistencia.ts). **Solo IDs.**

| Evento                                  | Dirección | Datos                                                                  | Quién reacciona                                     |
| --------------------------------------- | --------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| `teleasistencia.alerta_generada`        | Publica   | `alertaId`, `adultoMayorId`, `origen`, `generadaPor`, `destinatarios`  | Notificaciones avisa (prioridad alta)               |
| `teleasistencia.alerta_atendida`        | Publica   | `alertaId`, `adultoMayorId`, `atendidaPor`                             | —                                                   |
| `teleasistencia.medicamento_omitido`    | Publica   | `tomaId`, `medicamentoId`, `adultoMayorId`                             | Notificaciones avisa (normal)                       |
| `teleasistencia.lectura_fuera_de_rango` | Publica   | `lecturaId`, `adultoMayorId`                                           | Notificaciones avisa (alta)                         |
| `notificaciones.notificacion_entregada` | Consume   | `notificacionId`, `destinatarioId`, `canal`, `alertaId`, `entregadaEn` | Manejador `teleasistencia.marcar_alerta_notificada` |

## Variables de entorno

`TOLERANCIA_DE_TOMA_MINUTOS` (por defecto 60) e `INTERVALO_OMISION_TOMAS_MS` (por defecto 60 000; 0 lo apaga, **solo en pruebas**: la configuración lo prohíbe en producción). Detalle en [`.env.ejemplo`](../../.env.ejemplo).

## Estructura

```text
teleasistencia/
├─ dominio/                       ← Medicamento, Toma, LecturaDeSignos y rangos, Alerta
├─ aplicacion/
│  ├─ casos-de-uso/               ← medicamentos, tomas (marcar, deshacer, omitir), signos, alertas, resumen
│  ├─ manejadores/                ← marcar la alerta como notificada
│  ├─ servicios/                  ← eventos de Teleasistencia
│  └─ puertos/salida/             ← repositorios y PoliticaDeAcceso
└─ infraestructura/
   ├─ entrada/http/               ← controladores
   └─ salida/{persistencia,acceso}/   ← Drizzle y la política armada con Identidad, Reservas y Directorio
```
