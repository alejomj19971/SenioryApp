# F7 — Pagos y bolsas en el frontend

| Campo | Valor |
|---|---|
| **Módulo** | F7 |
| **Requiere en el backend** | M7 (Pagos: cobro, bolsa, liquidación) |
| **Estado** | Construido (2026-11-01) |

## Qué hace
- **El pago de un servicio** (`/app/servicios/[id]`): preparando, falta pagar (con hora límite), recibido, devuelto, rechazado o vencido. «Pagar ahora» pide el enlace al servidor y manda a la pasarela.
- **«Mi bolsa de horas»** (`/app/bolsa`): saldo disponible y apartado, movimientos y compra de paquetes.
- **«Tus pagos»** del cuidador (`/cuidador/liquidaciones`): lo que recibirá y lo que ya se le pagó.
- **La landing** muestra las bolsas reales del catálogo.

## Decisiones
| Tema | Decisión |
|---|---|
| Quién aprueba un pago | **Solo el aviso firmado de la pasarela al backend.** Volver de la pasarela no cambia nada en la pantalla; el estado siempre sale del backend. |
| Pasarela simulada | No tiene página de pago. Las pruebas fabrican el aviso firmado (HMAC-SHA256 del cuerpo exacto) con `SECRETO_DE_PASARELA_DE_PRUEBA`. Se prohíbe en producción (el backend no arranca). |
| Redirección a la pasarela | Solo a direcciones `http(s)`: la acción descarta cualquier otra cosa (`javascript:`…). |
| Idempotencia | La compra de una bolsa lleva `Idempotency-Key`; reintentar el mismo paquete usa la misma clave. |
| Dinero | Del servidor. Solo se dice qué paquete; el cargo, el total y el crédito vienen del backend. La familia nunca ve lo que recibe el cuidador; el cuidador nunca ve lo que pagó la familia. |
| Catálogo vacío | Se dice con honestidad («todavía no hay paquetes»): nunca precios de ejemplo. La landing no se rompe si el backend no responde. |
| Reembolso | Cancelar un servicio pagado devuelve el dinero (hoy siempre todo; la política de cancelación tardía es una decisión de negocio abierta). |

## Pruebas
Unitarias (mapeo en lista blanca, acciones, estados del pago, tarjeta de paquete), de contrato (cobro al aceptar, enlace idempotente, aviso firmado, monto distinto, reembolso, bolsa: compra, crédito y apartado) y recorridos (pagar con aviso firmado, pago rechazado, comprar y usar la bolsa, pagos del cuidador y landing).
