# Módulo Directorio

Los cuidadores que las familias buscan, y la garantía de que **solo se muestra a quien tiene sus tres controles al día**. Plan: [docs/PLAN_BACKEND_SENIORY.md, M2](../../../docs/PLAN_BACKEND_SENIORY.md).

## Qué hace

- **Búsqueda y perfiles** (solo con sesión): `GET /cuidadores`, `/cuidadores/filtros`, `/cuidadores/:id`.
- **Hoja de vida:** `GET /cuidadores/:id/hoja-de-vida` redirige a una dirección firmada que vence a los 5 minutos.
- **Reseñas:** nacen del evento `reservas.servicio_calificado` (cuando Reservas exista); el promedio se recalcula con cada una.
- **Carga de cuidadores reales:** `npm run cuidadores:importar` (el registro autónomo llega con M9).
- **Revisión diaria:** `npm run cuidadores:revisar-vigencias` oculta a quien se le venció un control.

## Reglas que conviene saber

| Tema               | Regla                                                                                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visibilidad (E7)   | Un cuidador se muestra solo si está **activo** y tiene **antecedentes, títulos y psicotécnica** aprobados y vigentes. Lo hace cumplir el dominio (`Cuidador.esVisible`) **y** un trigger de la base de datos.               |
| No verificado      | `GET /cuidadores/:id` responde **404**, igual que si no existiera, aunque se adivine el id. Lo mismo con su hoja de vida.                                                                                                   |
| Vencimiento        | Cuando un control vence, el perfil deja de verse **ese mismo día** (la lectura comprueba la vigencia de hoy); la revisión diaria además lo marca oculto y avisa con `directorio.cuidador_oculto`.                           |
| Teléfono (H1)      | **Nunca** sale en la API del directorio. Las vistas son una lista blanca de campos y una prueba de instantánea vigila que no crezca. Solo `obtenerContactoDeCuidador` (para otros módulos) lo entrega.                      |
| Búsqueda           | Texto sin tildes ni mayúsculas («jose» encuentra «José»), coincidencia parcial; `%` y `_` escritos por la persona no son comodines. La zona se compara de una sola forma (H9).                                              |
| Orden y paginación | Mejor calificación, luego menor tarifa, luego id. Cursor por clave (no por número de página): si entra alguien mientras se pagina, nadie se repite ni se salta. 20 por página, 50 máximo.                                   |
| Calificación       | Es **derivada**: se calcula de las reseñas (promedio con un decimal; `null` si no tiene, no «0 estrellas»). Nadie la edita.                                                                                                 |
| Reseñas            | Una por servicio (idempotente aunque el evento llegue dos veces). El autor se muestra abreviado («Andrea G.»). Si el cuidador no existe, el evento queda **fallido** en el outbox para que alguien lo revise, no se pierde. |
| Hoja de vida (H10) | Es un archivo distinto de los documentos privados de verificación (cédula, antecedentes…), que **no tienen salida** por la API. Solo se entrega la marcada como pública y aprobada.                                         |
| Archivos           | Nunca con enlace permanente: dirección firmada (HMAC-SHA256) que vence en 5 minutos; cualquier falla responde igual (404), sin pistas. Con el almacén `deshabilitado`, la hoja de vida responde **503** en vez de fingir.   |
| Vaciado masivo     | Todo el directorio exige sesión y pasa por el límite de peticiones global.                                                                                                                                                  |

## Lo que otros módulos pueden usar

`DirectorioModule` exporta **solo** `CONSULTA_DE_DIRECTORIO` ([puerto](./aplicacion/puertos/entrada/consulta-de-directorio.ts)); una prueba lo verifica.

| Método                             | Quién lo usa                   | Devuelve                                                                                                                |
| ---------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `obtenerCuidadorParaContratar(id)` | Reservas                       | Nombre, tarifa, zona y si acepta solo; `null` si no existe o **no está visible** (no se contrata a quien no se muestra) |
| `obtenerContactoDeCuidador(id)`    | Notificaciones, Teleasistencia | Cuenta, nombre y teléfono; **no** exige que esté visible (un servicio ya contratado se atiende)                         |

Directorio usa de Identidad: `CONSULTA_DE_IDENTIDAD` (el nombre de quien reseña) y `CUENTAS_DE_CUIDADORES` (crear la cuenta de un cuidador cargado por el equipo; nace con una contraseña aleatoria que nadie conoce, y la persona define la suya con «olvidé mi contraseña»).

## Eventos

Contratos en [`compartido/eventos/directorio.ts`](../compartido/eventos/directorio.ts) y [`reservas.ts`](../compartido/eventos/reservas.ts). Solo IDs.

| Evento                         | Dirección | Datos                                                                  | Quién reacciona                            |
| ------------------------------ | --------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| `directorio.cuidador_visible`  | Publica   | `cuidadorId`                                                           | —                                          |
| `directorio.cuidador_oculto`   | Publica   | `cuidadorId`                                                           | Reservas revisa sus servicios futuros (M4) |
| `reservas.servicio_calificado` | Consume   | `servicioId`, `cuidadorId`, `familiarId`, `calificacion`, `comentario` | Manejador `directorio.registrar_resena`    |

## Comandos

| Comando                                    | Qué hace                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run cuidadores:importar -- ruta.json` | Carga cuidadores **reales** cuyos tres controles el equipo ya revisó fuera del sistema. Por cada uno, todo o nada: cuenta con rol `cuidador`, perfil activo y visible, controles aprobados con su vigencia y, si hay, la hoja de vida (PDF de hasta 5 MB). Se puede repetir: el correo que ya existe se informa como «ya existía». Formato en [`comando-importar-cuidadores.ts`](./infraestructura/entrada/consola/comando-importar-cuidadores.ts); `revisadoPor` es el id del administrador (lo muestra `npm run crear-admin`). |
| `npm run cuidadores:revisar-vigencias`     | Oculta a quien tenga un control vencido y avisa. **Programarlo una vez al día** cuando haya hosting (cron).                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `npm run semillas`                         | Además de la familia de ejemplo de Identidad, crea **9 cuidadores de ejemplo** (correos `.invalid`, teléfonos inventados `+57300000000N`). Solo para desarrollo y pruebas; **se niega a correr en producción**.                                                                                                                                                                                                                                                                                                                  |

## Variables de entorno

`ALMACEN_DE_ARCHIVOS` (`local` o `deshabilitado`, por defecto `deshabilitado`), `DIRECTORIO_DE_ARCHIVOS`, `SECRETO_DE_ARCHIVOS` (32 caracteres o más; obligatorio con `local`) y `URL_PUBLICA_DE_LA_API`. El almacén **local** guarda en una carpeta del servidor y **no se admite en producción** (los discos de los hosting pierden los archivos al desplegar). Detalle en [`.env.ejemplo`](../../.env.ejemplo).

## Estructura

```text
directorio/
├─ dominio/                       ← Cuidador (esVisible), Verificacion, Resena, filtros y cursor, texto de búsqueda
├─ aplicacion/
│  ├─ casos-de-uso/               ← listar, obtener, filtros, hoja de vida, importar, revisar vigencias
│  ├─ manejadores/                ← reacción al evento «servicio calificado»
│  ├─ servicios/                  ← eventos de Directorio y lo que se ofrece a otros módulos
│  └─ puertos/{entrada,salida}/
└─ infraestructura/
   ├─ entrada/{http,consola}/     ← controladores (cuidadores, archivos) y comandos
   └─ salida/{persistencia,archivos}/
```
