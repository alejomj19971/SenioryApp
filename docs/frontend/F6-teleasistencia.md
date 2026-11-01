# F6 — Teleasistencia en el frontend

| Campo | Valor |
|---|---|
| **Módulo** | F6 |
| **Requiere en el backend** | M6 (Teleasistencia, el único módulo con datos de salud) |
| **Estado** | Construido (2026-11-01) |

## Qué hace
- **Inicio** y barra inferior con el resumen real (próximo medicamento, última lectura, alertas sin atender).
- **`/app/teleasistencia`:** pedir ayuda, las tomas de hoy (marcar y deshacer), los signos vitales con su gráfica y «Registrar signos».
- **`/app/teleasistencia/medicamentos`:** agregar un medicamento con sus horas y «dejar de tomar».

## Decisiones
| Tema | Decisión |
|---|---|
| Pedir ayuda (H7) | Cuenta regresiva de 5 s contra toques sin querer; la alerta se envía de verdad con `Idempotency-Key` (reintentar usa la misma y no avisa dos veces). **La pantalla dice a quién se avisó** (lo que responde el backend) y siempre ofrece llamar al **123**. No existe ni se simula una «línea de emergencia», y se quitó «Monitoreo activo» (no hay monitoreo en vivo). Si falla, dice que **no se avisó a nadie**. |
| Tomas | El estado es el del backend. Al marcar, la pantalla responde de inmediato (`useOptimistic`) y, si el servidor no lo acepta (otra pantalla ya la cambió, el día no corresponde), vuelve a como estaba, lo explica y se actualiza. Las horas son de Colombia. |
| Datos de salud | Solo la familia vinculada con autorización (y un cuidador con servicio activo). La persona sale de la **sesión**, nunca de la URL ni del formulario; una persona ajena recibe 404. Nada de esto se guarda en el navegador. |
| «Fuera de rango» | El backend no dice cuál medida ni cuánto; la pantalla solo dice «fuera del rango esperado, consulta con su médico». No interpreta nada clínico. |
| Medidas faltantes | Cada medida es opcional (la presión va completa o no va): la gráfica y las tarjetas muestran la última que sí se tomó y «—» si nunca hubo, nunca 0. |
| Tiempo real | El backend aún no tiene flujo en vivo: la pantalla se actualiza sola cada 15 s **solo mientras está a la vista** (y al volver a la pestaña). |
| Fechas | Siempre en hora de Colombia (`lib/format.ts`, `lib/fecha-colombia.ts`), también en el servidor, que en un hosting suele estar en UTC. |

## Pruebas
Unitarias (validaciones, mapeo, acciones, tomas optimistas, alerta con clave repetida y a quién se avisó, gráfica con medidas nulas), de contrato (resumen vacío, tomas, signos con presión completa y rangos, alerta con idempotencia, 404 para lo ajeno) y recorridos (estados vacíos honestos, agregar y marcar medicamentos, registrar signos, pedir ayuda y llamar al 123).
