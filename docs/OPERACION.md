# Seniory — Operación del backend

Cómo se despliega, se vigila, se respalda y se revierte la API. Está escrito **antes** de elegir hosting: lo que depende del proveedor está marcado con 🚀 y se completa cuando se elija. Lo demás ya funciona y está probado.

> **Estado:** la imagen, el arranque seguro, el rol de base de datos de mínimos permisos, el ensayo de restauración y el estado del outbox están construidos. El entorno de producción, el monitor externo, los respaldos del proveedor y la prueba de carga **no existen todavía** (🚀). Ver [PENDIENTES](./PENDIENTES.md#m10--endurecimiento-y-producción).

## 1. La imagen

`backend/Dockerfile` (tres etapas: compilar, dependencias de producción, imagen final). La imagen final:

- corre como el usuario `node` (**sin privilegios**), con `NODE_ENV=production`;
- **no trae** `.env`, pruebas, código fuente ni compilador (`.dockerignore`);
- incluye las migraciones (`drizzle/`) para aplicarlas en el despliegue;
- tiene `HEALTHCHECK` contra `/salud`.

La versión de Node de la imagen es la de `.nvmrc`; la CI lo comprueba, y también que un contenedor con configuración de producción **y un adaptador simulado se niega a iniciar**.

## 2. Variables y secretos

Todo llega por variables de entorno del hosting; **nada** vive en el repositorio. El detalle de cada variable está en [`backend/.env.ejemplo`](../backend/.env.ejemplo). La aplicación valida todo al arrancar y **no inicia** si algo está mal (mensaje con TODOS los problemas).

| En producción… | …la aplicación se niega a arrancar si |
| --- | --- |
| Pagos | la pasarela o el dispersor son simulados; `REQUIERE_PAGO_APROBADO` no es `true` |
| Notificaciones | los canales están simulados |
| Archivos | el almacén es el local (el disco del contenedor se pierde al desplegar) |
| Sesión | las cookies no son seguras, falta `SECRETO_BFF` (32+) o `SECRETO_JWT_ACCESO` (32+), o son iguales |
| Origen | `ORIGENES_PERMITIDOS` incluye `localhost`, un comodín o `http://` |
| Tareas | algún intervalo (outbox, expiraciones, avisos, tomas, pagos, liquidaciones) está en 0 |
| Recuperación | el canal de recuperación de contraseña es `consola` |
| Logs | el nivel es `debug` o `trace` (podrían registrar datos personales) |

Además, las migraciones **no pueden traer datos de prueba**: una prueba revisa que solo inserten los datos de referencia aprobados (política de precios y franjas horarias).

**Rotar un secreto:** cambiar el valor en el hosting y reiniciar. `SECRETO_JWT_ACCESO`: cambiar también `ID_CLAVE_JWT`; las sesiones abiertas se renuevan con el token de refresco. Rotar `SECRETO_BFF` exige hacerlo a la vez en el frontend. 🚀 Definir la periodicidad (propuesta: cada 6 meses y ante cualquier sospecha).

## 3. Base de datos: dos cuentas

| Cuenta | Para qué | Permisos |
| --- | --- | --- |
| **Dueña** (`URL_BASE_DE_DATOS_MIGRACIONES`) | Aplicar las migraciones y los permisos en el despliegue | Dueña de las tablas |
| **De la aplicación** (`seniory_app`, `URL_BASE_DE_DATOS`) | La API | Solo leer y escribir datos |

El rol de la aplicación **no puede** crear, alterar ni borrar tablas, índices o triggers, ni vaciar tablas, ni leer el historial de migraciones; y no edita ni borra los libros de solo inserción (`compartido.auditoria`, `pagos.movimientos_de_bolsa`). Si alguien explota una inyección de SQL, el daño queda limitado a los datos. Una prueba con un rol real en un Postgres real lo comprueba.

```text
# En cada despliegue, con la cuenta dueña, ANTES de arrancar la nueva versión:
npm run bd:migrar      # aplica las migraciones pendientes
npm run bd:permisos    # crea/actualiza el rol de la aplicación (idempotente; vuelve a cubrir las tablas nuevas)
```

🚀 Pendiente: **un rol por módulo** (el plan lo propone). Hoy los módulos comparten transacciones (una cuenta de cuidador y su perfil se guardan juntos; los manejadores de eventos escriben en su esquema y en `compartido`), así que separar los roles pide antes rediseñar esas transacciones: necesita su propio ADR.

## 4. Desplegar

1. Construir la imagen y publicarla en el registro del hosting 🚀.
2. Con la **cuenta dueña**: `bd:migrar` y `bd:permisos` (arriba). Las migraciones son **solo hacia adelante** (ver §7).
3. Arrancar la nueva versión con la cuenta de la aplicación.
4. Esperar a que `/salud/listo` responda 200 (la base responde) antes de recibir tráfico.
5. Mirar `/api/v1/salud/operacion` (§5) unos minutos: sin retraso en el outbox ni fallos nuevos.

Al recibir `SIGTERM` la API deja de aceptar peticiones, termina las que van, cierra las conexiones en vivo y el sondeo del outbox, y cierra el pool: un despliegue sin cortes necesita dar al contenedor unos 30 segundos de gracia.

Varias instancias a la vez son seguras: los eventos, los avisos, las liquidaciones y las expiraciones se reclaman con `FOR UPDATE SKIP LOCKED` y cada trabajo corre en una sola. La única diferencia es que el despertar inmediato de las conexiones en vivo (chat) solo llega a la instancia que procesó el evento; las demás lo hacen en su revisión de cada 2 segundos.

## 5. Vigilar

| Qué | Dónde | Alerta propuesta (🚀 el monitor) |
| --- | --- | --- |
| La API está viva | `GET /salud` | no responde 200 en 1 minuto |
| Puede atender | `GET /salud/listo` (503 si la base no responde) | 503 por más de 1 minuto |
| **Retraso del outbox** | `GET /api/v1/salud/operacion` → `outbox.retrasoMaximoSegundos` | **> 60 s** (cobros, avisos y alertas dependen de él) |
| Eventos que agotaron reintentos | `outbox.fallidosEnLaSemana` | **> 0** (alguien debe revisarlos) |
| Eventos en reintento | `outbox.conReintentos` | > 10 sostenido |
| Errores 5xx | logs de la API (pino, con id de correlación) y Sentry 🚀 | tasa > 1 % durante 5 minutos |
| Alertas de teleasistencia sin entregar | log `ALERTA SIN ENTREGAR` (E11) y auditoría | cualquiera |
| Cobros | auditoría `pagos.aprobacion_tardia` y `pagos.reembolso_tardio_fallido`; liquidaciones `fallida` | cualquiera |

`/api/v1/salud/operacion` exige el encabezado `X-Seniory-Operacion` con la clave `SECRETO_DE_OPERACION` (32+ caracteres); sin ella la ruta no existe (404). Devuelve solo conteos, ningún dato de ninguna persona. No está en el prefijo público del BFF: el monitor la consulta directo.

## 6. Respaldos y restauración

🚀 Los respaldos automáticos los da el proveedor de la base (propuesta: diario con retención de 30 días y recuperación a un punto en el tiempo). Un respaldo que nunca se restauró no es un respaldo, así que **se ensaya**:

```text
npm run bd:probar-restauracion
```

Saca un respaldo con `pg_dump`, lo restaura en una base nueva con `pg_restore` y compara, tabla por tabla, que las filas sean exactamente las mismas; borra la base de ensayo al terminar. En producción se hace el mismo ensayo con el respaldo del proveedor, **antes del lanzamiento y cada trimestre**, y se anota la fecha y el resultado.

**Restaurar de verdad (incidente):** restaurar el respaldo en una base nueva, verificar, apuntar `URL_BASE_DE_DATOS` a ella y reiniciar. Los eventos del outbox pendientes al momento del respaldo se vuelven a entregar (cada manejador es idempotente); los pagos pendientes se concilian con la pasarela (la tarea de vencimientos le pregunta el estado antes de vencerlos).

## 7. Revertir un despliegue

- **Código:** volver a desplegar la imagen anterior. Es inmediato.
- **Base de datos:** las migraciones son **solo hacia adelante** (no hay "deshacer"). Para que volver al código anterior sea siempre posible, cada migración debe ser compatible con la versión anterior: se agregan columnas nuevas (con valor por defecto o nulas) y tablas nuevas **primero**; se quita lo viejo en un despliegue posterior, cuando nadie lo usa. Nunca se renombra ni se borra una columna en el mismo despliegue que deja de usarla.
- Si una migración dañó datos: restaurar el respaldo (§6) y repetir el despliegue corregido.

## 8. Incidentes

🚀 Definir con el equipo: quién está de guardia, cómo se comunica una caída a las familias y a los cuidadores, y el contacto con la SIC ante un incidente de seguridad con datos personales (Ley 1581; ver [SEGURIDAD](./SEGURIDAD.md)). Primer paso siempre: mirar `/salud/listo` y `/api/v1/salud/operacion`, luego los logs por id de correlación.

## 9. Suspender a un cuidador

El dominio ya sabe hacerlo (`Cuidador.suspender`: lo oculta de inmediato). Falta la **pantalla o el comando de administrador** para pedirlo, y que Reservas reaccione a `cuidador_oculto` reasignando o cancelando sus servicios futuros. Hasta entonces: ver PENDIENTES.
