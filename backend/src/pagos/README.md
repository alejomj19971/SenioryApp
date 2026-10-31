# Módulo Pagos

Cuánto cuesta un servicio y cómo se reparte. En esta etapa (**M3**) solo **cotiza**; el cobro, las bolsas de horas y la liquidación llegan con M7. Plan: [docs/PLAN_BACKEND_SENIORY.md, M3](../../../docs/PLAN_BACKEND_SENIORY.md).

## Qué hace

- **`POST /pagos/cotizaciones`** (solo familiares): recibe `{ cuidadorId, horas }` y devuelve el costo con el cargo de servicio desglosado.
- **`COTIZADOR_DE_SERVICIOS`** (puerto de entrada): lo mismo, pero con el desglose completo, para que Reservas (M4) guarde el servicio con los montos con los que se cotizó.

## Reglas que conviene saber

| Tema                 | Regla                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Quién pone el precio | **El servidor.** La tarifa sale del directorio y las comisiones de la política vigente; el cliente solo dice a quién y cuántas horas. Cualquier otro campo en el cuerpo se rechaza (400).                                                        |
| Horas                | Enteras, de 1 a 8 (el mismo rango que el CHECK de la base de datos).                                                                                                                                                                             |
| Cuidador             | Si no existe o no está visible, 404 (igual en los dos casos): no se cotiza a quien una familia no puede contratar.                                                                                                                               |
| Dinero               | Pesos colombianos **enteros**; comisiones en puntos básicos (800 = 8 %). La mitad se redondea hacia arriba. Nada de decimales.                                                                                                                   |
| Qué ve la familia    | Subtotal, cargo de servicio (con su porcentaje), total y la versión de la política. **Nunca** el pago al profesional ni el ingreso de la plataforma (lista blanca de campos + prueba de instantánea).                                            |
| Pago al profesional  | `subtotal − comisión del profesional`, no `subtotal × 90 %`: así el redondeo de la mitad no regala ni pierde un peso entre el profesional y la plataforma (`subtotal = pago + comisión` siempre).                                                |
| Política versionada  | Cada cotización dice con qué versión se calculó. Cambiar las comisiones es insertar una política **nueva** con otra versión y fecha de inicio: los servicios ya contratados conservan la suya. La versión 1 (8 % y 10 %) viene de una migración. |
| Sin política vigente | No se inventan comisiones: responde 503 `cotizacion.sin_politica`.                                                                                                                                                                               |

## Cómo se calcula

```text
subtotal          = tarifa por hora × horas
cargoFamilia      = subtotal × comisión de la familia           (redondeo: mitad hacia arriba)
totalFamilia      = subtotal + cargoFamilia
pagoProfesional   = subtotal − (subtotal × comisión del profesional)
ingresoPlataforma = totalFamilia − pagoProfesional              (≥ 0)
```

Con la política 1: **$20.000 × 1 h → la familia paga $21.600, el profesional recibe $18.000 y la plataforma se queda con $3.600.**

## Vectores compartidos con el frontend

[`pruebas/vectores/precios.json`](../../pruebas/vectores/precios.json) trae 150 casos (tarifas de $18.000 a $35.000 por 1 a 8 horas, bordes del redondeo y otras comisiones). El backend los verifica en `calculo-de-servicio.spec.ts`; **el frontend debe verificar contra el mismo archivo** su `lib/pricing.ts` (F3). El archivo se regenera con una cuenta independiente (enteros, sin `Dinero`).

⚠️ Hoy `frontend/lib/pricing.ts` calcula el pago al profesional como `round(subtotal × 0,9)`; con tarifas múltiplos de $1.000 da lo mismo, pero con 5 pesos da 5 y el backend 4. En F3 debe pasar a `subtotal − round(subtotal × 0,1)`.

## Lo que otros módulos pueden usar

`PagosModule` exporta **solo** `COTIZADOR_DE_SERVICIOS` ([puerto](./aplicacion/puertos/entrada/cotizador-de-servicios.ts)); una prueba lo verifica. Pagos usa de Directorio `CONSULTA_DE_DIRECTORIO` (`obtenerCuidadorParaContratar`).

## Estructura

```text
pagos/
├─ dominio/                       ← PoliticaDePrecios, calcularServicio (función pura)
├─ aplicacion/
│  ├─ casos-de-uso/               ← cotizar servicio
│  └─ puertos/{entrada,salida}/
└─ infraestructura/
   ├─ entrada/http/               ← POST /pagos/cotizaciones
   └─ salida/persistencia/        ← políticas de precios (las tablas de cobro y bolsas llegan con M7)
```
