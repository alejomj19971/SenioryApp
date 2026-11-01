# F3+F4 — Cotización y contratación en el frontend

| Campo | Valor |
|---|---|
| **Módulo** | F3 (cotización) y F4 (contratación y área del cuidador) |
| **Requiere en el backend** | M3 (Pagos: cotización), M4 (Reservas) |
| **Estado** | Construido (2026-11-01) |

## Qué hace
- `/app/contratar/[id]`: elegir día, franja y horas; **el servidor cotiza** (cada cambio de horas pide una cotización nueva, y una respuesta vieja no pisa a la nueva); pagar con la bolsa si alcanza; **enviar solicitud**.
- `/app/servicios` y `/app/servicios/[id]`: mis servicios con su estado, el detalle con el desglose, cancelar (con confirmación) y calificar un servicio terminado.
- Cuidador en turno en teleasistencia: el único lugar donde la familia recibe el teléfono de un cuidador.
- `/cuidador`: el área del cuidador — por responder, en curso, próximos y anteriores; aceptar, rechazar, iniciar y finalizar. Ve lo que **recibe**, nunca lo que paga la familia.

## Decisiones
| Tema | Decisión |
|---|---|
| El resultado es una **solicitud** | El cuidador la acepta o no (2 horas; 30 minutos si es para hoy). La pantalla dice «Esperando al cuidador», no «contratación confirmada», y aclara que no se cobra nada hasta que acepte. |
| Dinero | Solo del servidor. El navegador nunca envía montos (el backend rechaza campos de más) y `lib/pricing.ts` se eliminó: ya no hay dos fórmulas que puedan divergir. |
| Fecha y franjas | En hora de Colombia, decididas en el servidor (`lib/fecha-colombia.ts`): a las 8 p. m. la tarde de hoy ya terminó y la noche no. El prototipo usaba la fecha UTC del navegador (H2). |
| Idempotencia | La clave se genera en el formulario y **cambia si cambian los datos** (la misma clave con otros datos es 409); reenviar el mismo envío usa la misma y el backend devuelve el mismo servicio. |
| La persona a cuidar | Sale de la **sesión**, no del formulario. |
| Dos vistas del dinero | La familia: subtotal, cargo y total. El cuidador: lo que recibe. Cada mapeo es una lista blanca; una prueba falla si uno recibe lo del otro. |
| Roles | `exigirRol('cuidador')` lleva a cada persona a su área; el backend vuelve a verificar. |
| Pruebas con cuidadores | Los cuidadores de las semillas no tienen contraseña conocida: las pruebas crean uno **por el flujo real de M9** (registro, perfil, documentos, revisión de un administrador local con `ADMIN_DE_PRUEBA_*`). |

## Pruebas
Unitarias (fecha y franjas, mensajes, mapeo de vistas, acciones y el formulario), de contrato (cotización, solicitar con idempotencia, vistas por rol, doble reserva, 404 idéntico para lo ajeno, cursor) y recorridos con **dos personas a la vez** (la familia pide, el cuidador acepta o rechaza, la familia cancela; otra familia choca con la franja ocupada).
