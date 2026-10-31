# Módulo Identidad

Quién es cada persona, cómo entra y a quién puede ver. Plan completo: [docs/backend/M1-identidad.md](../../../docs/backend/M1-identidad.md).

## Qué hace

- **Cuentas y sesión:** registro de familiares, inicio y cierre de sesión, renovación del acceso (`/auth/*`).
- **Perfil:** `GET` y `PATCH /yo`.
- **Personas mayores:** las registra un familiar, que queda como su responsable (`/adultos-mayores`).
- **Consentimiento** para tratar sus datos de salud (Ley 1581): se otorga y se revoca (`/consentimientos`).

Los datos clínicos **no** viven aquí (están en Teleasistencia). Identidad solo guarda **quién puede acceder**: vínculos y consentimientos.

## Reglas que conviene saber

| Tema | Regla |
|---|---|
| Rol | Se fija al crear la cuenta y no se cambia. El registro público siempre crea un `familiar`; un administrador solo se crea con `npm run crear-admin`. |
| Contraseña | De 10 a 128 caracteres, sin reglas de composición; se rechazan las 9 218 más comunes. Solo se guarda su hash argon2id. |
| Bloqueo | Cada 5 fallos seguidos: 15 min, luego el doble, hasta 24 h. Los intentos durante el bloqueo no cuentan. |
| Sesión | Acceso: JWT de 15 min. Refresco: opaco, 30 días, rota en cada uso; si un token ya usado reaparece pasados 30 s, se revoca toda su familia. |
| Acceso a una persona | Solo el familiar con vínculo activo. Quien no lo tiene recibe **404**, igual que si no existiera, y el intento queda auditado. |
| Consentimiento | Un solo consentimiento vigente por persona y finalidad. Revocar es inmediato. |

## Lo que otros módulos pueden usar

Solo esto sale del módulo (`IdentidadModule` exporta estos dos símbolos y nada más; una prueba lo verifica):

| Símbolo | Para qué |
|---|---|
| `CONSULTA_DE_IDENTIDAD` ([puerto](./aplicacion/puertos/entrada/consulta-de-identidad.ts)) | Consultas con IDs y datos mínimos |
| `VERIFICADOR_DE_TOKENS` | El guard global de autenticación |

`ConsultaDeIdentidad`:

| Método | Quién lo usa | Devuelve |
|---|---|---|
| `obtenerContacto(usuarioId)` | Notificaciones | Nombre, correo y teléfono; `null` si la cuenta no existe o fue eliminada |
| `obtenerAdultoMayor(id)` | Reservas, Teleasistencia | Nombre, edad y foto; `null` si no existe |
| `esFamiliarVinculado(usuarioId, adultoMayorId)` | Reservas, Teleasistencia | `boolean` |
| `tieneConsentimientoVigente(adultoMayorId, finalidad)` | Teleasistencia, **en cada acceso** | `boolean` |
| `listarFamiliaresVinculados(adultoMayorId)` | Teleasistencia | IDs de a quién avisar de una alerta |

## Eventos que publica

Contratos en [`compartido/eventos/identidad.ts`](../compartido/eventos/identidad.ts). Solo IDs, nunca nombres, correos ni teléfonos.

| Evento | Datos | Quién reacciona |
|---|---|---|
| `identidad.usuario_registrado` | `usuarioId`, `rol` | Notificaciones (bienvenida, cuando haya correo) |
| `identidad.adulto_mayor_registrado` | `adultoMayorId`, `registradoPor` | — |
| `identidad.vinculo_creado` | `vinculoId`, `familiarId`, `adultoMayorId` | — |
| `identidad.consentimiento_otorgado` | `adultoMayorId`, `finalidad` | — |
| `identidad.consentimiento_revocado` | `adultoMayorId`, `finalidad` | Teleasistencia (cierra accesos abiertos) |

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run crear-admin` | Crea un administrador. Lee `ADMIN_NOMBRE`, `ADMIN_CORREO` y `ADMIN_CONTRASENA` del entorno (la contraseña no va como argumento: quedaría en el historial). Sirve en todos los entornos. |
| `npm run semillas` | Crea una familia de ejemplo: Andrea (`andrea@prueba.seniory.invalid`) y Doña Carmen, vinculadas y con consentimiento. Pide `CONTRASENA_DE_PRUEBA` (nunca se guarda en el repositorio), se puede repetir sin duplicar nada y **se niega a correr en producción**. |

## Variables de entorno

`SECRETO_JWT_ACCESO` (obligatoria), `ID_CLAVE_JWT`, `DURACION_ACCESO_MIN`, `DURACION_REFRESCO_DIAS`, `COOKIES_SEGURAS`, `VERSION_POLITICA_VIGENTE` y `VERSION_CONSENTIMIENTO_SALUD_VIGENTE`. Detalle en [`.env.ejemplo`](../../.env.ejemplo).

## Estructura

```text
identidad/
├─ dominio/                       ← Usuario, Credencial, SesionDeRefresco, AdultoMayor, Vinculo, Consentimiento…
├─ aplicacion/
│  ├─ casos-de-uso/               ← registrar, iniciar sesión, renovar, perfil, consentimientos, crear administrador
│  ├─ servicios/                  ← piezas que comparten varios casos de uso
│  └─ puertos/{entrada,salida}/
└─ infraestructura/
   ├─ entrada/{http,consola}/     ← controladores y comandos
   └─ salida/{persistencia,seguridad,contrasenas}/
```

## Pendiente

Cambiar y recuperar la contraseña, verificar el correo (necesita el canal de correo, M5), autenticación en dos pasos para administradores (M10), vincular a un segundo familiar (necesita una decisión de producto y legal) y exportar o eliminar la cuenta (PR 7, opcional).
