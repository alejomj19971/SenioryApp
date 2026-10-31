# Módulo Pagos

Cuánto cuesta un servicio, cómo se reparte, cómo se cobra, la bolsa de horas prepago y lo que se le paga al cuidador. Plan: [docs/PLAN_BACKEND_SENIORY.md, M3 y M7](../../../docs/PLAN_BACKEND_SENIORY.md).

> **Ninguna pasarela de pagos ni dispersor real está elegido todavía** (decisión abierta, [docs/PENDIENTES.md](../../../docs/PENDIENTES.md)). Todo lo que habla con el proveedor es un **adaptador** de un puerto: hoy hay uno **simulado** (solo desarrollo, pruebas y staging; la configuración lo **prohíbe en producción**) y uno **deshabilitado** que responde «no disponible». Nada finge un cobro que no ocurrió.

## Qué hace

**Cotizar (M3)**

- `POST /pagos/cotizaciones` (familias): `{ cuidadorId, horas }` → costo con el cargo de servicio desglosado.
- `COTIZADOR_DE_SERVICIOS` (puerto de entrada): lo mismo con el desglose completo, para que Reservas congele los montos al contratar.

**Cobrar y devolver (M7)**

- **Al confirmarse un servicio** se cobra. Con la **pasarela** queda un pago _pendiente_ y se avisa a la familia; con la **bolsa** se aparta el saldo y el pago queda _aprobado_ de una vez.
- `POST /pagos/:id/enlace` (familias): pide a la pasarela el enlace para pagar. Es idempotente.
- `POST /pagos/webhook/:proveedor` (pública, **con firma**): el aviso con que la pasarela cuenta cómo terminó un pago. Es la **única** puerta por la que un pago pasa a aprobado.
- `GET /pagos` (familias): sus pagos, más recientes primero.
- **Al cancelarse el servicio** el dinero vuelve: se cierra el pago pendiente, se libera el saldo de la bolsa o se pide el reembolso a la pasarela.
- **Tarea programada de vencimientos:** cierra los pagos que la familia no pagó a tiempo (y recupera los avisos que se perdieron, ver abajo).

**Bolsa de horas (M7)**

- `GET /catalogo/bolsas` (pública): los paquetes a la venta. **Sin filas hasta que el negocio los apruebe**; mientras tanto la lista va vacía, nunca inventada.
- `GET /bolsa` (familias): saldo disponible y reservado, y los últimos movimientos.
- `POST /bolsa/compras` (familias, con `Idempotency-Key`): `{ paquete }` → pago pendiente + enlace. La bolsa se acredita **cuando la pasarela confirma**, nunca antes.

**Liquidación al cuidador (M7)**

- Al terminar el servicio queda una **liquidación** (una por servicio) con el pago al cuidador que se congeló al contratar.
- `GET /liquidaciones` (cuidadores): lo que se le debe y lo que ya se le pagó.
- **Tarea programada de dispersión:** le paga al cuidador de a una liquidación, fuera de cualquier transacción abierta por otra. Sin dispersor, **no hace nada** y las liquidaciones quedan pendientes, a la vista.

## Cómo se calcula

```text
subtotal          = tarifa por hora × horas
cargoFamilia      = subtotal × comisión de la familia           (redondeo: mitad hacia arriba)
totalFamilia      = subtotal + cargoFamilia
pagoProfesional   = subtotal − (subtotal × comisión del profesional)
ingresoPlataforma = totalFamilia − pagoProfesional              (≥ 0)
```

Con la política 1: **$20.000 × 1 h → la familia paga $21.600, el profesional recibe $18.000 y la plataforma se queda con $3.600.** Dinero siempre en pesos enteros; comisiones en puntos básicos (800 = 8 %).

## Reglas que conviene saber

| Tema                       | Regla                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quién pone el precio       | **El servidor.** La tarifa sale del directorio, las comisiones de la política vigente y el precio de un paquete de la base. El cliente solo dice a quién, cuántas horas o qué paquete; cualquier otro campo se rechaza (400).                                                                                                                  |
| Qué ve la familia          | Subtotal, cargo, total, estado y vencimiento del pago. **Nunca** el pago al cuidador, el ingreso de la plataforma ni la referencia de la pasarela (lista blanca de campos + pruebas).                                                                                                                                                         |
| Se recalcula antes de cobrar | El evento de Reservas trae las condiciones con las que se contrató. Pagos las **recalcula** con la política de esa versión y **se niega a cobrar** si no cuadran (`pago.desglose_no_coincide`): el manejador falla y el evento queda a la vista en el outbox.                                                                              |
| Un cobro por servicio      | La clave de idempotencia del pago es `servicio:<id>`: confirmar dos veces (un evento repetido) no cobra dos veces. Para la bolsa, la clave la manda el cliente (`Idempotency-Key`); la misma clave con **otro paquete** es 409.                                                                                                             |
| El aviso de la pasarela    | (1) Firma verificada **sobre el cuerpo exacto** y en tiempo constante; sin firma válida, 401 y nada se guarda. (2) Se procesa **una sola vez** por (proveedor, id del aviso), también si llegan en paralelo. (3) El **monto** debe ser el del pago. (4) Solo **avanza**: no se aprueba un pago ya cerrado ni se devuelve uno aprobado a pendiente. |
| Qué se confirma con 200    | Todo lo que venga **firmado**: un aviso repetido, de un pago desconocido, de otro tipo o con monto distinto se confirma sin aplicarlo (la pasarela reintenta lo que no se confirma, y reintentar no lo arregla). El monto distinto y la aprobación tardía quedan en la **auditoría** como error.                                              |
| Aprobación tardía          | Si la pasarela aprueba un pago que ya habíamos cerrado (venció o se rechazó), **no se acredita nada**: se pide el reembolso. Si ese reembolso falla, queda en la auditoría (`pagos.reembolso_tardio_fallido`) para devolverlo a mano.                                                                                                       |
| Aviso perdido              | Antes de vencer un pago que ya tiene cobro en la pasarela, la tarea **le pregunta** cómo va: uno pagado se aprueba, uno rechazado se rechaza. Si la pasarela no responde, el pago **no se vence a ciegas**.                                                                                                                                 |
| Pago que vence o falla     | `pago_rechazado` → Reservas cancela el servicio con motivo `pago_fallido` y la familia recibe el aviso de la cancelación (uno solo).                                                                                                                                                                                                          |
| Iniciar exige el pago      | Con `REQUIERE_PAGO_APROBADO=true` (obligatorio en staging y producción) Reservas no deja iniciar un servicio sin el pago aprobado. Pagos avisa con `pago_aprobado`; Reservas anota `pagado_en`.                                                                                                                                              |
| La bolsa nunca queda negativa | Cada operación comprueba el saldo, la versión se guarda con bloqueo optimista y la base lo impide aunque el código falle (CHECK). Con muchas reservas simultáneas no se gasta dos veces el mismo peso.                                                                                                                                   |
| El libro de la bolsa       | `movimientos_de_bolsa` es de **solo inserción** (un trigger prohíbe editar y borrar). Compra, reserva, consumo y liberación; un servicio solo se aparta, se consume o se libera **una vez** (índice único). Repetir los movimientos desde cero reproduce el saldo (prueba de propiedades).                                                  |
| Crédito ≠ precio           | Al comprar un paquete la bolsa recibe su **crédito** (puede ser mayor que el precio, si hay descuento). Se lee el paquete aunque ya no esté a la venta: la compra es anterior.                                                                                                                                                               |
| Reembolso                  | Hoy **siempre se devuelve todo** al cancelar, sea cual sea la anticipación. La política de cancelación tardía es una decisión de negocio abierta (el evento ya trae `horasDeAnticipacion`). La petición lleva una clave propia del pago: repetirla no devuelve dos veces.                                                                    |
| Liquidación                | Solo de un pago **aprobado**, una por servicio (índice único), con lo congelado al contratar. Se paga de a una, cada una en su transacción con la fila bloqueada (`SKIP LOCKED`); la orden lleva el id de la liquidación, así que repetirla no paga dos veces. Un error pasajero del proveedor detiene la ronda; un rechazo definitivo la deja `fallida`. |
| Datos de tarjeta           | **Ninguno entra al sistema.** El aviso guardado no los lleva; el adaptador de cada pasarela real debe descartarlos antes de guardar el cuerpo.                                                                                                                                                                                              |

## Por qué los montos viajan en el evento

Reservas ya depende de Pagos (para cotizar), así que Pagos **no puede** consultar a Reservas sin crear un ciclo. Por eso `reservas.servicio_confirmado` lleva las [condiciones de cobro](../compartido/eventos/reservas.ts) (medio, horas, tarifa, versión de la política, total y pago al cuidador) y Pagos las verifica. A cambio Reservas solo se entera del pago por eventos (`pago_aprobado`, `pago_rechazado`) y por `CONSULTA_DE_PAGOS`.

## Lo que otros módulos pueden usar

`PagosModule` exporta **solo** `COTIZADOR_DE_SERVICIOS` y `CONSULTA_DE_PAGOS` ([puertos](./aplicacion/puertos/entrada/)); una prueba lo verifica.

| Método                                | Quién lo usa | Devuelve                                                                                                 |
| ------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------- |
| `cotizar(cuidadorId, horas)`          | Reservas     | El desglose completo, con la versión de la política                                                      |
| `bolsaAlcanzaPara(familiarId, monto)` | Reservas     | ¿Alcanza el saldo **disponible** para pedir un servicio con la bolsa? (la reserva real se hace al confirmar) |

Pagos usa de Directorio `CONSULTA_DE_DIRECTORIO` (`obtenerCuidadorParaContratar`, `obtenerCuidadorPorUsuario`).

## Eventos

Contratos en [`compartido/eventos/pagos.ts`](../compartido/eventos/pagos.ts). **Solo IDs** y valores cerrados: nunca montos de la cuenta del cuidador ni datos de tarjeta.

| Evento                        | Dirección | Quién reacciona                                                          |
| ----------------------------- | --------- | ------------------------------------------------------------------------ |
| `reservas.servicio_confirmado` | Consume   | `pagos.cobrar_servicio_confirmado`: crea el pago y cobra                 |
| `reservas.servicio_cancelado`  | Consume   | `pagos.reembolsar_servicio_cancelado`: cierra, libera o reembolsa        |
| `reservas.servicio_finalizado` | Consume   | `pagos.liquidar_servicio_finalizado`: consume la bolsa y crea la liquidación |
| `pagos.pago_requerido`        | Publica   | Notificaciones avisa a la familia que debe pagar                         |
| `pagos.pago_aprobado`         | Publica   | Reservas anota `pagado_en` (con él puede iniciar)                        |
| `pagos.pago_rechazado`        | Publica   | Reservas cancela el servicio (`pago_fallido`); Notificaciones, si era una bolsa |
| `pagos.pago_reembolsado`      | Publica   | Notificaciones avisa a la familia                                        |
| `pagos.bolsa_comprada`        | Publica   | Notificaciones avisa a la familia                                        |
| `pagos.liquidacion_realizada` | Publica   | — (quedó anotado lo que se le debe al cuidador)                          |

## Variables de entorno

| Variable                                            | Qué hace                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `PASARELA_DE_PAGOS` · `SECRETO_DE_PASARELA`         | `simulada` (con su secreto de 32+ caracteres) o `deshabilitada`. La simulada **no se admite en producción**.   |
| `DISPERSOR_DE_PAGOS`                                | `simulado` o `deshabilitado`. El simulado **no se admite en producción**.                                     |
| `REQUIERE_PAGO_APROBADO`                            | Si el servicio necesita el pago aprobado para iniciar. **Obligatorio en staging y producción.**               |
| `MINUTOS_PARA_PAGAR`                                | Plazo de la familia para pagar (por defecto 120).                                                             |
| `INTERVALO_EXPIRACION_PAGOS_MS` · `INTERVALO_LIQUIDACION_MS` | Cada cuánto corren las tareas (por defecto 60 000). 0 las apaga, **solo en pruebas**: producción lo prohíbe. |

Detalle en [`.env.ejemplo`](../../.env.ejemplo).

## Para conectar una pasarela real

Implementar [`PasarelaDePagos`](./aplicacion/puertos/salida/pasarela-de-pagos.ts) (crear el cobro con el id del pago como referencia, consultar su estado, reembolsar con clave de idempotencia, **verificar la firma sobre el cuerpo crudo** e interpretar el aviso a un `AvisoDeLaPasarela`) y registrarla en `PagosModule`; con eso el resto no cambia. Lo mismo para [`DispersorDePagos`](./aplicacion/puertos/salida/dispersor-de-pagos.ts). El aviso se guarda tal cual llega: **el adaptador debe quitarle cualquier dato de tarjeta antes**.

## Vectores compartidos con el frontend

[`pruebas/vectores/precios.json`](../../pruebas/vectores/precios.json) trae 150 casos (tarifas de $18.000 a $35.000 por 1 a 8 horas, bordes del redondeo y otras comisiones). El backend los verifica en `calculo-de-servicio.spec.ts`; **el frontend debe verificar contra el mismo archivo** su `lib/pricing.ts` (F3).

⚠️ Hoy `frontend/lib/pricing.ts` calcula el pago al profesional como `round(subtotal × 0,9)`; con tarifas múltiplos de $1.000 da lo mismo, pero con 5 pesos da 5 y el backend 4. En F3 debe pasar a `subtotal − round(subtotal × 0,1)`.

## Estructura

```text
pagos/
├─ dominio/                       ← PoliticaDePrecios, calcularServicio, Pago, Bolsa (libro de movimientos), Liquidacion
├─ aplicacion/
│  ├─ casos-de-uso/               ← cotizar, enlace de pago, comprar bolsa, aviso de la pasarela, vencimientos, dispersión, consultas
│  ├─ manejadores/                ← cobrar, reembolsar y liquidar (reaccionan a Reservas)
│  ├─ servicios/                  ← eventos de Pagos y la resolución de un pago (aprobar / rechazar / vencer)
│  └─ puertos/{entrada,salida}/   ← cotizador, consulta de pagos; pasarela, dispersor y repositorios
└─ infraestructura/
   ├─ entrada/http/               ← cotizaciones, bolsa, pagos, webhook y liquidaciones
   └─ salida/{persistencia,pasarela,dispersion}/   ← Drizzle, pasarela simulada y deshabilitada, dispersor simulado y deshabilitado
```
