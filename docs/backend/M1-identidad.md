# M1 — Identidad

| Campo | Valor |
|---|---|
| **Módulo** | M1 |
| **Bloque del diagrama** | Identidad y usuarios: «Registro, autenticación, roles y perfil del adulto mayor» |
| **Escenarios de ADR-01** | E6 (control de acceso por rol; el registro de accesos lo usa Teleasistencia) |
| **Rigor hexagonal** | Ligero, con la mayor cobertura de pruebas de seguridad del backend |
| **Tamaño** | L |
| **Depende de** | M0 |
| **Estado** | En construcción: PR 1 y 2 de 7 hechos (2026-10-28). Plan aprobado el 2026-10-22. |

---

## 1. Objetivo y alcance

Que cada persona entre a Seniory con su propia cuenta, con un rol, y que el sistema sepa **qué familiar está vinculado a qué adulto mayor y si existe consentimiento para tratar sus datos de salud**. Todos los módulos siguientes dependen de esto para decidir quién puede hacer qué.

**Entra**
- Registro de familiares, inicio y cierre de sesión, renovación de sesión.
- Perfil propio (`/yo`) y actualización de datos básicos.
- Registro del adulto mayor por parte de un familiar, con vínculo de responsable.
- Consentimiento para el tratamiento de datos de salud: otorgar y revocar.
- Aceptación de la política de tratamiento de datos del propio usuario (Ley 1581).
- Puertos de consulta que usarán Reservas, Teleasistencia, Mensajería y Notificaciones.
- Implementación del `VerificadorDeTokens` que el guard de M0 espera.
- Creación de administradores por línea de comandos.
- Pantallas del frontend: registro, inicio de sesión, alta del adulto mayor y consentimiento.

**No entra**
- **Datos clínicos** (medicamentos, signos vitales, condiciones): viven en Teleasistencia (decisión del 2026-10-22, [README](./README.md)).
- Registro de cuidadores (M9; aquí solo queda el puerto que lo permitirá).
- Invitar a otros familiares a un mismo adulto mayor (posterior).
- Recuperación de contraseña y verificación de correo: dependen de un canal de correo (M5). El modelo queda preparado (`correoVerificadoEn`).
- Inicio de sesión con Google u otros proveedores.

---

## 2. Relación con el diagrama y los ADR

| Diagrama / ADR | Cómo lo aplica M1 |
|---|---|
| «Registro, autenticación, roles» | Cuentas con rol, sesión con cookies y guard global de M0. |
| «Perfil del adulto mayor» | `AdultoMayor` con datos básicos (nombre, fecha de nacimiento, foto). |
| «Datos de salud aquí» (diagrama) | **Cambia:** los datos de salud van a Teleasistencia. Identidad guarda vínculos y consentimientos, que son la base del control de acceso de E6. Pendiente corregir el diagrama. |
| ADR-01 §4.4: «El módulo Identidad centraliza autenticación y control de acceso por rol» | Identidad responde *quién es* y *qué relación tiene* con el adulto mayor. La decisión final de acceso a datos de salud la toma Teleasistencia con su `PoliticaDeAcceso` (PLAN_BACKEND §4.4). |
| Actores del diagrama: familiar, adulto mayor, cuidador | Roles `familiar`, `adulto_mayor`, `cuidador` y `administrador`. |

---

## 3. Definición de preparado

- [ ] M0 terminado.
- [ ] **Decidido cómo llegan las cookies al frontend** (§7.1). Recomendado: reescrituras de Next hacia el backend.
- [ ] **Texto de la política de tratamiento de datos y del consentimiento de salud** en una primera versión (`v1`), aunque luego lo revise asesoría legal.
- [ ] **Decidido quién puede otorgar el consentimiento de salud** (§10, decisión 1). Si no hay respuesta, se implementa el modelo que soporta ambos casos y se usa «representante» solo en desarrollo y staging. **Sin esa decisión legal no se lanza a usuarios reales.**

---

## 4. Diseño

### 4.1 Modelo de dominio

**Objetos de valor**

| Objeto | Regla |
|---|---|
| `Correo` | Sin espacios, en minúsculas, formato válido, máximo 254 caracteres. |
| `Contrasena` | Entre 10 y 128 caracteres; sin reglas de composición (guía NIST 800-63B); se rechazan las de una lista de contraseñas comunes. Nunca se guarda: solo su hash. |
| `TelefonoE164` | Formato `+<código><número>` (ej. `+573001234567`). Opcional para familiares. |
| `NombrePersona` | Entre 1 y 100 caracteres, sin espacios sobrantes. |
| `Rol` | `familiar`, `adulto_mayor`, `cuidador`, `administrador`. |
| `Parentesco` | `hijo_hija`, `nieto_nieta`, `conyuge`, `hermano_hermana`, `otro`. |
| `FinalidadDeConsentimiento` | `datos_de_salud` (otras finalidades se agregan si hacen falta). |

**Agregados y entidades**

| Agregado | Contenido | Reglas |
|---|---|---|
| `Usuario` | `id`, `correo`, `nombre`, `telefono?`, `rol`, `estado` (`activo`, `eliminado`), `correoVerificadoEn?`, y su `Credencial` (`hash`, `intentosFallidos`, `bloqueadoHasta?`). | Correo único. Tras **5 intentos fallidos** se bloquea por 15 minutos (y se duplica en bloqueos seguidos, hasta 24 h). Un inicio de sesión exitoso reinicia el contador. Un usuario `eliminado` no puede iniciar sesión. Nadie cambia su propio rol. |
| `SesionDeRefresco` | `id`, `usuarioId`, `familiaId`, `hashDelToken`, `emitidaEn`, `expiraEn`, `reemplazadaEn?`, `revocadaEn?` | Cada renovación **reemplaza** el token por uno nuevo de la misma familia. Si alguien presenta un token reemplazado **hace más de 30 s** o revocado, se considera robado: **se revoca toda la familia** y se audita. Dentro de esos 30 s (ventana de gracia) se emite otro par nuevo de la misma familia, sin revocarla (no se puede devolver el par anterior porque solo se guarda el hash de cada token), porque el frontend puede renovar varias veces a la vez ([F1 §4.3](../frontend/F1-identidad.md)). |
| `AdultoMayor` | `id`, `nombre`, `fechaDeNacimiento`, `fotoUrl?`, `usuarioId?` (si algún día tiene cuenta propia), `creadoPor` | La edad **se calcula** con `Reloj` (no se guarda). Fecha de nacimiento en el pasado y edad máxima de 120 años. |
| `Vinculo` | `id`, `familiarId`, `adultoMayorId`, `parentesco`, `esResponsable`, `estado` (`activo`, `revocado`) | Solo un vínculo activo por pareja familiar–adulto mayor. Al registrar un adulto mayor, quien lo registra queda como responsable. |
| `Consentimiento` | `id`, `adultoMayorId`, `finalidad`, `otorgadoPor`, `calidad` (`titular` o `representante`), `versionDelTexto`, `otorgadoEn`, `revocadoEn?` | Solo un consentimiento vigente por adulto mayor y finalidad. Solo lo otorga un familiar vinculado (como representante) o el propio adulto mayor (como titular). Revocar es inmediato y emite un evento. |
| `AceptacionDePolitica` | `usuarioId`, `version`, `aceptadaEn` | Obligatoria para registrarse. |

**Construido en el PR 1** (`backend/src/identidad/dominio/`, 97 % de cobertura solo con pruebas unitarias):

| Pieza | Cómo quedó |
|---|---|
| `Correo` | Se normaliza (sin espacios y en minúsculas). Solo ASCII: los correos internacionales casi no tienen soporte y se rechazan para no crear cuentas a las que no se podría escribir. |
| `Contrasena` | De 10 a 128 **caracteres** (no unidades de texto: 10 emojis bastan). Se normaliza a NFKC, para que la misma contraseña dé el mismo hash en cualquier teclado. Pide un `DiccionarioDeContrasenasComunes` (la lista la aporta la aplicación). `Contrasena.paraVerificar` no aplica las reglas de creación, para que una contraseña antigua siga entrando. **Nunca se filtra:** `toString`, `toJSON` y la inspección de Node ocultan el valor; solo `revelar()` lo entrega. |
| `NombrePersona` | Se normaliza a NFC y los tramos de espacios quedan en uno. Rechaza caracteres de control y los que invierten el sentido de lectura (U+202A–202E, U+2066–2069), con los que se puede mostrar un nombre distinto del guardado. |
| `Rol` | Se movió a `compartido/dominio/rol.ts`: el dominio de un módulo no puede importar la capa de aplicación de `compartido`. |
| `Credencial` | **Cada quinto fallo seguido** bloquea la cuenta: 15 min, 30, 60… hasta 24 h (fallos 5, 10, 15…). Los fallos durante un bloqueo no cuentan ni lo extienden. Solo un éxito reinicia el contador, y un éxito con la cuenta bloqueada **falla** aunque la contraseña sea correcta. Exige que el hash tenga formato PHC (`$argon2id$…`): atrapa el error de guardar la contraseña en claro. |
| `SesionDeRefresco` | `evaluarUso` devuelve `valida`, `en_gracia`, `expirada`, `reutilizada` o `revocada`. Revocada y reutilizada se evalúan **antes** que el vencimiento: un token viejo que reaparece es sospechoso aunque haya vencido. `rotar` en gracia **no** sobrescribe la primera marca, así renovar a la vez no extiende la ventana de 30 s. |
| `Usuario` | El rol se fija al crear la cuenta (`registrarFamiliar` o `crearAdministrador`) y no tiene forma de cambiarse. Actualizar el perfil no toca `actualizadoEn` si no hubo cambios reales; `telefono: null` lo borra. |
| `AdultoMayor` | `registrar` exige nacimiento anterior a hoy y como máximo 120 años; no exige edad mínima. La edad es `edadEn(hoy)`, con `FechaCivil.aniosCumplidosA` (nueva): quien nació un 29 de febrero cumple el 1 de marzo. |
| `Consentimiento` | `calidadDe(usuario, persona, vínculo)` decide quién puede actuar y con qué calidad (`titular` si es la propia persona con cuenta; `representante` si tiene vínculo activo). Sirve igual para otorgar y para revocar. `otorgar` exige que la calidad declarada coincida con la que le corresponde, y rechaza un segundo consentimiento vigente. Revisa el permiso **antes** que el conflicto, para que quien no puede actuar no averigüe si ya hay uno vigente. |

**Construido en el PR 2** (`identidad/aplicacion/puertos/salida/` y `identidad/infraestructura/salida/persistencia/`):

| Pieza | Cómo quedó |
|---|---|
| Puertos de salida | Seis, cada uno con su símbolo de inyección: `RepositorioUsuarios`, `RepositorioSesiones`, `RepositorioAdultosMayores`, `RepositorioVinculos`, `RepositorioConsentimientos` y `RepositorioAceptacionesDePolitica` (el plan listaba cinco; la aceptación de la política también se guarda). |
| Adaptadores Drizzle | Usan `ContextoTransaccional.conexion()`: si hay una unidad de trabajo en curso se unen a su transacción; si no, usan el pool. `Usuario` y su `Credencial` se guardan en una sola unidad: o quedan las dos filas o ninguna. |
| Errores | Las violaciones de unicidad se traducen a errores de dominio: `usuario.correo_ya_registrado`, `vinculo.ya_existe`, `consentimiento.ya_vigente`. La utilidad `errores-de-postgres.ts` (en `compartido`) recorre la cadena de causas, porque Drizzle envuelve el error de `pg`. Tras un conflicto, la transacción en curso queda abortada: el caso de uso debe dejar que se revierta. |
| Bloqueo de fila | `buscarPorCorreoParaActualizar` y `buscarPorHashDelToken` usan `FOR NO KEY UPDATE`. Así dos intentos de inicio de sesión de la misma cuenta, o dos renovaciones del mismo token, se atienden uno tras otro. Se probó con 12 inicios de sesión fallidos simultáneos: el contador termina en exactamente 5 y la cuenta queda bloqueada (sin el bloqueo terminaría en 1). No se usa `FOR UPDATE OF credenciales` porque Drizzle escribe la tabla con su esquema y Postgres lo rechaza. `NO KEY UPDATE` no estorba a quien inserte vínculos o consentimientos que apuntan al usuario. |
| Sesiones | `actualizar` usa `coalesce`: nunca sobrescribe la primera marca de reemplazo o revocación. `eliminarVencidasAntesDe` borra en una sola sentencia, y una cadena de reemplazos sale junta sin romper la clave foránea. |
| Constantes del dominio | Una prueba compara roles, parentescos, estados, finalidades y calidades con los `CHECK` de la base: si se agrega uno en un solo lado, falla. |

**Construido en el PR 3** (autenticación):

| Pieza | Cómo quedó |
|---|---|
| `IdentidadModule` | Registra las piezas con fábricas (la capa de aplicación no usa decoradores de Nest) y **exporta solo `VERIFICADOR_DE_TOKENS`**; `CONSULTA_DE_IDENTIDAD` se suma en el PR 4. Reemplaza al verificador que rechazaba todo (se borró `verificador-que-rechaza-todo.ts`). La prueba `pruebas/arquitectura/exportaciones.spec.ts` comprueba que solo se exportan los símbolos permitidos, y que la regla detecta un módulo que exporta un repositorio. |
| Hash | `HashDeContrasenasArgon2` (`@node-rs/argon2`): argon2id, 19 MiB, 2 iteraciones, 1 hilo. Un hash ilegible cuenta como contraseña incorrecta, no tumba el inicio de sesión. `simularVerificacion` gasta el mismo tiempo cuando el correo no existe. |
| Tokens de acceso | `TokensJwt` (`jose`) es a la vez emisor y verificador: HS256, cabecera `kid` y `typ: at+jwt`, `iss`, `aud`, `sub`, `rol`, `jti`, 15 min. Rechaza otro algoritmo (incluido `none`), otra clave o `kid`, otro emisor, audiencia o tipo, y un rol que no existe. Usa el `Reloj` del sistema, así las pruebas lo adelantan sin esperar. Solo conoce **una** clave: cambiar el secreto o `ID_CLAVE_JWT` invalida los tokens de acceso vigentes (cada persona los renueva sola con su refresco, que no se ve afectado). Rotar sin ese salto exigiría aceptar una lista de claves. |
| Tokens de refresco | `GeneradorDeTokensOpacosAleatorio`: 32 bytes aleatorios en base64url; solo se guarda el SHA-256. |
| Contraseñas comunes | 9 218 contraseñas de 10 a 128 caracteres, tomadas de las listas «10k most common» y «100k NCSC» de SecLists (MIT; ver `contrasenas-comunes.LICENCIA.md`), en minúsculas y comparadas sin distinguir mayúsculas. Nest las copia a `dist/` (`assets` en `nest-cli.json`). El largo mínimo de 10 ya descarta las contraseñas más obvias. |
| `RegistrarFamiliar` | Valida con el dominio, **calcula el hash antes de abrir la transacción** (no se ocupa una conexión mientras trabaja la CPU) y, en una sola transacción, guarda usuario, aceptación de la política, sesión y el evento `identidad.usuario_registrado`. Exige que la versión de la política sea la vigente (`politica.version_no_vigente`). |
| `IniciarSesion` | Un rechazo se **devuelve** (no se lanza) para que el contador de fallos se confirme. Correo mal formado, sin cuenta, cuenta bloqueada o eliminada y contraseña errónea producen la **misma respuesta** y gastan el mismo tiempo; el motivo real solo queda en la auditoría. Durante un bloqueo no se mira la contraseña ni cuentan los intentos. |
| `RenovarSesion` | Bloquea la fila de la sesión. `reutilizada` o cuenta no disponible revocan la familia **y se confirma**; `revocada` y `expirada` solo rechazan. Relee rol y estado de la base. En la ventana de gracia entrega otro par de la misma familia. |
| `CerrarSesion` | **Pública con el token de refresco** (ver desviación abajo). Idempotente. |
| Endpoints | `/auth/registro` (5/min por IP), `/auth/login` (10/min), `/auth/refresh` y `/auth/logout`. Los tokens viajan solo en cookies, nunca en el cuerpo. El refresco inválido borra las cookies. El correo se recorta antes de validarlo (quien lo pega suele traer un espacio). |
| Variables nuevas | `SECRETO_JWT_ACCESO` (obligatoria en todos los entornos, 32 caracteres o más, distinta de `SECRETO_BFF`), `ID_CLAVE_JWT`, `DURACION_ACCESO_MIN`, `DURACION_REFRESCO_DIAS`, `COOKIES_SEGURAS` (debe ser `true` en staging y producción) y `VERSION_POLITICA_VIGENTE`. `VERSION_CONSENTIMIENTO_SALUD_VIGENTE` llega con el PR 4, que es quien la usa. |

**Desviaciones del plan en el PR 3**

| Plan | Lo construido | Por qué |
|---|---|---|
| `POST /auth/logout` exigía sesión (token de acceso) | Es público: lo que revoca es la familia del token de refresco que viaja en la cookie. | Con el token de acceso vencido (15 min) el usuario no podría cerrar sesión y las cookies quedarían puestas. Quien no tiene el refresco no puede revocar nada. |
| El token de acceso revocado se rechaza | Un token de acceso ya emitido **sigue valiendo hasta que venza** (máximo 15 min) aunque se cierre la sesión o cambie el rol. | El verificador no consulta la base en cada petición (sería una consulta por llamada). Es el compromiso habitual del acceso corto; la renovación sí relee rol y estado. |
| `/yo` en las pruebas «registro → /yo → cierre → /yo» | Se prueba con una ruta protegida de prueba. | `/yo` llega en el PR 4. |
| Pruebas de `Origin` y de matriz de autorización | Quedan para los PR 6 y 4. | Dependen de código que aún no existe. |
| Prueba de logs de punta a punta | Se prueba la redacción con las opciones reales de `opcionesDeLogs` sobre un servidor mínimo. | La salida estándar no se puede leer de forma fiable dentro de las pruebas. Se verificó que la prueba falla si se quita la redacción de `set-cookie` o de `contrasena`. |

**Construido en el PR 4** (perfil, personas mayores y consentimientos):

| Pieza | Cómo quedó |
|---|---|
| Endpoints | `GET /yo` (perfil y personas mayores vinculadas, con edad, parentesco, responsabilidad y si hay consentimiento de salud); `PATCH /yo` (nombre y teléfono; `null` borra el teléfono); `POST /adultos-mayores`; `GET /adultos-mayores/:id`; `POST /adultos-mayores/:id/consentimientos`; `DELETE /consentimientos/:id`. El id del perfil sale siempre del token, nunca de la ruta. |
| Registrar una persona mayor | Crea la persona y el vínculo de responsable **en una sola transacción**, con los eventos `adulto_mayor_registrado` y `vinculo_creado`. La edad se calcula con la fecha de hoy en Bogotá. |
| IDOR | Una persona o un consentimiento ajenos responden **404 idéntico** al de uno que no existe (misma respuesta, sin el nombre), y el intento queda auditado como `denegado`. Un rol que no usa la ruta recibe 403; un id que no es UUID, 400. |
| Consentimiento | Lo otorga un familiar vinculado (como `representante`) o la propia persona (`titular`). Exige la versión vigente del texto (`VERSION_CONSENTIMIENTO_SALUD_VIGENTE`) y que la calidad declarada sea la que le corresponde. Revocarlo es inmediato; después se puede otorgar uno nuevo. |
| Concurrencia | Dos consentimientos simultáneos dejan uno vigente y un 409. Dos revocaciones simultáneas dejan una revocación y **un solo** evento (el consentimiento se lee con `FOR NO KEY UPDATE`). Cambiar el perfil lee al usuario con el mismo bloqueo: sin él, guardar la credencial leída borraría un intento fallido de inicio de sesión ocurrido en medio. Las dos pruebas de concurrencia se verificaron quitando los bloqueos: fallan. |
| `ConsultaDeIdentidad` | Primer puerto de entrada de Identidad: `obtenerContacto`, `obtenerAdultoMayor`, `esFamiliarVinculado`, `tieneConsentimientoVigente` y `listarFamiliaresVinculados`. Solo IDs y datos mínimos. `IdentidadModule` ya exporta `CONSULTA_DE_IDENTIDAD` y `VERIFICADOR_DE_TOKENS`, y nada más. Una cuenta eliminada no tiene contacto. |
| Eventos | `adulto_mayor_registrado`, `vinculo_creado`, `consentimiento_otorgado` y `consentimiento_revocado`, con sus tipos en `compartido/eventos/identidad.ts`. Solo IDs y la finalidad. Un servicio común (`EventosDeIdentidad`) arma el sobre. |
| Auditoría | `actualizar_perfil` (solo qué campos cambiaron), `registrar_adulto_mayor`, `crear_vinculo`, `consultar_adulto_mayor` (solo los denegados), `otorgar_consentimiento` y `revocar_consentimiento` (permitidos y denegados). Nunca valores personales. |
| Matriz de autorización | Sin sesión → 401; cuidador y administrador en rutas de familiares → 403; familiar ajeno → 404. Se prueba ruta por ruta. |
| Variable nueva | `VERSION_CONSENTIMIENTO_SALUD_VIGENTE` (por defecto `v1`; la política legal real la redactará un abogado). |

**Desviaciones del plan en el PR 4**

| Plan | Lo construido | Por qué |
|---|---|---|
| `POST /vinculos` | No existe en este PR. El único vínculo que se crea es el de responsable al registrar a la persona. | Vincular a otro familiar necesita una invitación o aprobación del responsable (quién autoriza es una decisión de producto y legal, decisión 1 de §10). Los PR siguientes no lo necesitan para empezar. |
| Los contratos `openapi.json` y AsyncAPI versionados (ADR-03) | Quedan para un PR aparte. | Piden activar el plugin de `@nestjs/swagger`, un script de exportación que corra sobre lo compilado y un paso en la CI; es trabajo propio y no depende de este. |

**Corrección en la infraestructura de pruebas:** las pruebas de integración fallaban de forma intermitente («connection timeout») porque los archivos corren en paralelo y cada aplicación abre hasta 10 conexiones: con las 100 que Postgres permite por defecto no alcanzaba. El contenedor de pruebas ahora admite 400.

**Construido en el PR 5** (datos de ejemplo, administradores y README del módulo):

| Pieza | Cómo quedó |
|---|---|
| `npm run crear-admin` | Caso de uso `CrearAdministrador` (mismas reglas de contraseña que el registro) más un comando de consola que levanta la aplicación sin servidor HTTP. Lee `ADMIN_NOMBRE`, `ADMIN_CORREO` y `ADMIN_CONTRASENA` del entorno: la contraseña **no** va como argumento (quedaría en el historial y en la lista de procesos). Queda auditado con actor `null` (lo hace el servidor, no una persona). No tiene ruta en la API. |
| `npm run semillas` | Crea a Andrea (`andrea@prueba.seniory.invalid`), a Doña Carmen, su vínculo de responsable, la aceptación de la política y el consentimiento `v1`. Los IDs son UUID v5 derivados de `f-andrea` y `am-carmen`: siempre los mismos, y repetir el comando no duplica nada ni toca la contraseña de Andrea. Exige `CONTRASENA_DE_PRUEBA` (sin valor por defecto, y con las mismas reglas de contraseña) y **se niega a correr con `NODE_ENV=production`**. |
| Prueba de punta a punta | Los dos comandos se corrieron desde la consola contra una base temporal: crear, repetir, variables que faltan y correo repetido. Las pruebas de integración cubren la lógica con la aplicación completa. |
| README del módulo | `backend/src/identidad/README.md`: reglas, `ConsultaDeIdentidad`, eventos, comandos y estructura. |

**Desviaciones del plan en el PR 5**

| Plan | Lo construido | Por qué |
|---|---|---|
| Administrador con contraseña de un solo uso que se cambia al primer ingreso | La contraseña que se da al crearlo es la definitiva. | No existe cambio de contraseña en M1 (ni recuperación: necesita el canal de correo, M5). Falta decidirlo: hay que agregar «cambiar contraseña» y una marca de «debe cambiarla» antes de producción. |
| Autenticación en dos pasos | Sin cambios: sigue siendo la decisión 4, antes de producción (M10). | — |
| `npm run semillas` para todos los módulos | Hoy solo siembra Identidad. | Cada módulo siembra lo suyo; un comando general los llamará cuando existan (M2 en adelante). |

**Construido en el PR 6** (cambiar y recuperar la contraseña):

| Pieza | Cómo quedó |
|---|---|
| Endpoints | `POST /auth/olvide-contrasena` (3/min por IP), `POST /auth/restablecer-contrasena` (5/min) y `PATCH /yo/contrasena` (5/min, con sesión). |
| Tabla nueva | `identidad.tokens_de_recuperacion` (migración 0010): solo el SHA-256 del token (`CHECK` de 32 bytes: guardar el token en claro es imposible), `expira_en > creado_en`, único por hash. Quedan 38 tablas. |
| Olvidé mi contraseña | Responde **202 exista o no la cuenta** (y también con un correo mal escrito): si no, serviría para averiguar qué correos tienen cuenta. El enlace tiene un token de 256 bits, **vence a los 30 minutos**, sirve **una sola vez** y pedir otro invalida el anterior. No manda otro correo antes de un minuto (no sirve para llenar un buzón ajeno). El envío no se espera (un correo lento delataría las cuentas que existen); si falla, queda auditado como `error`. |
| Restablecer | El enlace vencido, usado, inventado o de una cuenta eliminada responde **exactamente lo mismo** (400 `recuperacion.enlace_no_valido`); el motivo real solo queda en la auditoría. Una contraseña débil se rechaza **sin gastar** el enlace. Al terminar: se **cierran todas las sesiones** de la cuenta, se levanta el bloqueo por intentos fallidos y se gastan los demás enlaces pendientes. No inicia sesión. Dos usos simultáneos del mismo enlace: uno gana, el otro recibe 400. |
| Cambiar con la contraseña actual | Cierra las sesiones de todos los dispositivos y deja una nueva para quien la cambió. Equivocarse con la actual **cuenta como intento fallido** de inicio de sesión: este endpoint no sirve para adivinar la contraseña con una sesión robada (5 errores bloquean la cuenta). La nueva no puede ser igual a la actual. |
| Canal de envío | Puerto `EnviadorDeRecuperacion`. `CANAL_DE_RECUPERACION`: `consola` escribe el enlace en el log (**solo desarrollo y pruebas; la configuración lo rechaza en producción**) y `deshabilitado` (por defecto) responde **503** a todas las cuentas hasta que exista un correo real (M5). Nada se simula en producción. |
| Error nuevo | `ServicioNoDisponible` (503) en `compartido`: una función que hoy no puede cumplirse se dice, no se finge. |
| Auditoría | `solicitar_recuperacion` (permitido, denegado con motivo o error de envío), `restablecer_contrasena` y `cambiar_contrasena`. Nunca el token ni las contraseñas. |

**Desviaciones y límites del PR 6**

| Tema | Decisión |
|---|---|
| Contraseña de un solo uso del administrador, a cambiar al primer ingreso | **Sigue pendiente (M10, junto con la autenticación en dos pasos).** Exigirlo en el servidor obligaría a que el guard global conozca esa marca en cada token. Mientras tanto un administrador puede cambiarla con `PATCH /yo/contrasena`. |
| Correo real | **Falta.** No hay proveedor de correo elegido: sin él, en producción `/auth/olvide-contrasena` responde 503. Es el requisito para lanzar (decisión abierta del equipo). |
| El token en el outbox | El enlace **no** viaja como evento: un evento no puede llevar un secreto. Cuando exista Notificaciones (M5) el envío se moverá allí con reintentos (hoy, si el canal falla, la persona vuelve a pedir otro enlace). |
| Limpieza de enlaces vencidos | El repositorio ya trae `eliminarVencidosAntesDe`; la tarea programada diaria (junto con la de sesiones) llega en M10. |

**Para quien ya tenga un `.env` local (PR 3):** hay que agregar `SECRETO_JWT_ACCESO` (genera uno con el comando de `.env.ejemplo`) y `COOKIES_SEGURAS=false`; sin ellos la aplicación no arranca.

### 4.2 Casos de uso

| Caso de uso | Quién | Entrada | Resultado | Errores |
|---|---|---|---|---|
| `RegistrarFamiliar` | público | nombre, correo, contraseña, teléfono opcional, versión de la política aceptada | usuario `familiar` y sesión iniciada | 400 datos; 409 correo ya registrado |
| `IniciarSesion` | público | correo, contraseña | sesión (cookies) | 401 genérico, también si la cuenta está bloqueada |
| `RenovarSesion` | público con cookie de refresco | token de refresco | nuevos tokens | 401; si el token ya fue usado, revoca la familia |
| `CerrarSesion` | público con cookie de refresco | token de refresco | familia de sesiones revocada, cookies borradas | — |
| `ObtenerPerfilPropio` | autenticado | — | usuario y adultos mayores vinculados (con edad y si hay consentimiento de salud) | — |
| `ActualizarPerfilPropio` | autenticado | nombre o teléfono | perfil actualizado | 400 |
| `RegistrarAdultoMayor` | familiar | nombre, fecha de nacimiento, parentesco | adulto mayor y vínculo de responsable, en una transacción | 400 |
| `OtorgarConsentimiento` | familiar vinculado o el adulto mayor | finalidad, versión del texto, calidad | consentimiento vigente | 404 si no hay vínculo; 409 si ya hay uno vigente |
| `RevocarConsentimiento` | quien puede otorgarlo | id del consentimiento | revocado | 404 |
| `SolicitarRecuperacion` | público, 3/min por IP | correo | 202 siempre (503 si no hay canal) |
| `RestablecerContrasena` | público con el enlace del correo | token, contraseña nueva | contraseña cambiada y todas las sesiones cerradas | 400 enlace no válido o contraseña débil |
| `CambiarContrasena` | autenticado | contraseña actual y nueva | contraseña cambiada, demás sesiones cerradas y una sesión nueva | 400 contraseña actual incorrecta |
| `CrearAdministrador` | línea de comandos | nombre, correo, contraseña desde variables de entorno | usuario `administrador` | 409 |

Los derechos de exportar y suprimir datos (Ley 1581) se diseñan aquí, pero se pueden implementar en M10 si el tiempo aprieta: `ExportarMisDatos` y `EliminarMiCuenta` (anonimiza nombre, correo y teléfono, revoca sesiones y vínculos, emite `CuentaEliminada`).

### 4.3 Puertos

**Puerto de entrada que usan otros módulos** (`identidad/aplicacion/puertos/entrada/consulta-de-identidad.ts`):

```ts
export interface ConsultaDeIdentidad {
  obtenerContacto(usuarioId: string): Promise<Contacto | null>;          // Notificaciones
  obtenerAdultoMayor(id: string): Promise<AdultoMayorResumen | null>;    // Reservas, Teleasistencia
  esFamiliarVinculado(usuarioId: string, adultoMayorId: string): Promise<boolean>;
  tieneConsentimientoVigente(adultoMayorId: string, finalidad: 'datos_de_salud'): Promise<boolean>;
  listarFamiliaresVinculados(adultoMayorId: string): Promise<string[]>;  // destinatarios de alertas
}

export interface Contacto { usuarioId: string; nombre: string; correo: string; telefono: string | null; }
export interface AdultoMayorResumen { id: string; nombre: string; edad: number; fotoUrl: string | null; }
```

Se agrega en M9: `RegistrarUsuarioCuidador(datos)` para que Directorio cree la cuenta del cuidador.

**Lo que exporta `IdentidadModule`** (y nada más):

| Símbolo | Quién lo inyecta |
|---|---|
| `CONSULTA_DE_IDENTIDAD` | Reservas, Teleasistencia, Mensajería, Notificaciones |
| `VERIFICADOR_DE_TOKENS` | El guard global registrado en `AppModule` (reemplaza al `VerificadorQueRechazaTodo` de M0) |

Repositorios, hash y emisor de tokens quedan privados del módulo: si otro módulo intenta inyectarlos, Nest falla al arrancar.

**Puertos de salida**

| Puerto | Adaptador |
|---|---|
| `RepositorioUsuarios`, `RepositorioSesiones`, `RepositorioAdultosMayores`, `RepositorioVinculos`, `RepositorioConsentimientos` | Drizzle, esquema `identidad`. |
| `HashDeContrasenas` | `@node-rs/argon2` con **argon2id, 19 MiB de memoria, 2 iteraciones, paralelismo 1** (recomendación de OWASP). Trae binarios para Windows, sin compilar. |
| `EmisorDeTokens` | JWT de acceso firmado (HS256 con secreto de al menos 256 bits y `kid` para poder rotarlo). También implementa el `VerificadorDeTokens` de M0. |
| `GeneradorDeTokensOpacos` | 32 bytes aleatorios de `crypto.randomBytes` para los tokens de refresco; se guarda solo su SHA-256. |
| `ListaDeContrasenasComunes` | Archivo local con las 10 000 contraseñas más comunes. |
| `Reloj`, `GeneradorDeIds`, `UnidadDeTrabajo`, `PublicadorDeEventos`, `Auditoria` | Los de M0. |

### 4.4 Sesión y tokens

| Elemento | Valor |
|---|---|
| Token de acceso | JWT con `sub` (id), `rol`, `iat`, `exp`, `jti`. Dura **15 minutos**. |
| Token de refresco | Opaco, dura **30 días**, rota en cada uso. |
| Cookie de acceso | `seniory_acceso`: `HttpOnly`, `Secure` (salvo en local), `SameSite=Lax`, `Path=/`. |
| Cookie de refresco | `seniory_refresco`: igual, pero `Path=/api/v1/auth`, para que solo viaje a las rutas de sesión. |
| Rol actualizado | El rol se lee de la base al renovar, así un cambio de rol se aplica en máximo 15 minutos. |
| CSRF | `SameSite=Lax` más verificación de `Origin` en toda petición que no sea `GET` **cuando trae ese encabezado** (las llamadas del BFF de Next son de servidor a servidor y no lo traen; los navegadores sí lo envían en `POST` entre sitios). |

Variables de entorno nuevas: `SECRETO_JWT_ACCESO`, `ID_CLAVE_JWT`, `DURACION_ACCESO_MIN` (15), `DURACION_REFRESCO_DIAS` (30), `COOKIES_SEGURAS` (`true` fuera de local), `VERSION_POLITICA_VIGENTE` y, en el PR 4, `VERSION_CONSENTIMIENTO_SALUD_VIGENTE`.

### 4.5 API

Todas bajo `/api/v1`. Respuestas de error en `problem+json` (M0).

| Método y ruta | Acceso | Cuerpo | Respuesta |
|---|---|---|---|
| `POST /auth/registro` | público, límite 5/min por IP | `{ nombre, correo, contrasena, telefono?, versionPolitica }` | 201 `{ usuario }` + cookies |
| `POST /auth/login` | público, límite 10/min por IP | `{ correo, contrasena }` | 200 `{ usuario }` + cookies |
| `POST /auth/refresh` | cookie de refresco | — | 204 + cookies nuevas |
| `POST /auth/logout` | público con cookie de refresco | — | 204, cookies borradas |
| `POST /auth/olvide-contrasena` | público, límite 3/min por IP | `{ correo }` | 202 (siempre igual) · 503 sin canal de correo |
| `POST /auth/restablecer-contrasena` | público, límite 5/min por IP | `{ token, contrasenaNueva }` | 204 · 400 enlace no válido |
| `PATCH /yo/contrasena` | autenticado, límite 5/min por IP | `{ contrasenaActual, contrasenaNueva }` | 204 + cookies nuevas |
| `GET /yo` | autenticado | — | 200 (ejemplo abajo) |
| `PATCH /yo` | autenticado | `{ nombre?, telefono? }` | 200 `{ usuario }` |
| `POST /adultos-mayores` | familiar | `{ nombre, fechaDeNacimiento, parentesco }` | 201 `{ adultoMayor }` |
| `GET /adultos-mayores/:id` | familiar vinculado | — | 200 `{ adultoMayor }`; 404 si no hay vínculo |
| `POST /adultos-mayores/:id/consentimientos` | familiar vinculado o el titular | `{ finalidad, versionDelTexto, calidad }` | 201 `{ consentimiento }` |
| `DELETE /consentimientos/:id` | quien puede otorgarlo | — | 204 |

El registro **no acepta `rol`**: siempre crea un `familiar`. El `ValidationPipe` global (`forbidNonWhitelisted`) rechaza el campo porque el DTO no lo declara:

```ts
export class RegistroDto {
  @IsString() @Length(1, 100, { message: 'El nombre debe tener entre 1 y 100 caracteres' })
  nombre!: string;

  @IsEmail({}, { message: 'El correo no es válido' }) @MaxLength(254)
  correo!: string;

  @IsString() @Length(10, 128, { message: 'La contraseña debe tener entre 10 y 128 caracteres' })
  contrasena!: string;

  @IsOptional() @Matches(/^\+[1-9]\d{7,14}$/, { message: 'El teléfono debe tener formato internacional, ej. +573001234567' })
  telefono?: string;

  @IsString()
  versionPolitica!: string;
}
```

El DTO solo verifica la forma. Las reglas (contraseña común, correo ya registrado) las aplica el dominio y el caso de uso.

Ejemplo de `GET /yo`:

```json
{
  "usuario": { "id": "0192…", "nombre": "Andrea", "correo": "andrea@ejemplo.co", "rol": "familiar" },
  "adultosMayores": [
    {
      "id": "0192…",
      "nombre": "Doña Carmen",
      "edad": 78,
      "fotoUrl": null,
      "parentesco": "hijo_hija",
      "esResponsable": true,
      "consentimientoDeSalud": true
    }
  ]
}
```

### 4.6 Eventos

| Evento | Datos | Quién reacciona |
|---|---|---|
| `identidad.usuario_registrado` | `usuarioId`, `rol` | Notificaciones (bienvenida, cuando exista correo) |
| `identidad.adulto_mayor_registrado` | `adultoMayorId`, `registradoPor` | — |
| `identidad.vinculo_creado` | `vinculoId`, `familiarId`, `adultoMayorId` | — |
| `identidad.consentimiento_otorgado` | `adultoMayorId`, `finalidad` | — |
| `identidad.consentimiento_revocado` | `adultoMayorId`, `finalidad` | Teleasistencia (corta accesos), Notificaciones |
| `identidad.cuenta_eliminada` | `usuarioId` | Todos los módulos con datos del usuario |

Los contratos viven en `compartido/eventos/identidad.ts`. Ningún evento lleva correo, teléfono ni nombre: solo IDs.

### 4.7 Datos (esquema `identidad`)

| Tabla | Columnas | Restricciones |
|---|---|---|
| `usuarios` | `id`, `correo` (`citext`), `nombre`, `telefono`, `rol`, `estado`, `correo_verificado_en`, `creado_en`, `actualizado_en` | `UNIQUE (correo)`; `CHECK` de `rol` y `estado`; `CHECK` de formato E.164 en `telefono` |
| `credenciales` | `usuario_id` (PK, FK), `hash`, `intentos_fallidos`, `bloqueado_hasta`, `actualizado_en` | `CHECK (intentos_fallidos >= 0)` |
| `sesiones_refresco` | `id`, `usuario_id`, `familia_id`, `hash_del_token` (`bytea`), `emitida_en`, `expira_en`, `reemplazada_en`, `revocada_en` | `UNIQUE (hash_del_token)`; índices por `familia_id` y `usuario_id` |
| `adultos_mayores` | `id`, `nombre`, `fecha_de_nacimiento` (`date`), `foto_url`, `usuario_id`, `creado_por`, `creado_en` | `UNIQUE (usuario_id)` cuando no es nulo |
| `vinculos` | `id`, `familiar_id`, `adulto_mayor_id`, `parentesco`, `es_responsable`, `estado`, `creado_en`, `revocado_en` | Único parcial `(familiar_id, adulto_mayor_id)` donde `estado = 'activo'` |
| `consentimientos` | `id`, `adulto_mayor_id`, `finalidad`, `otorgado_por`, `calidad`, `version_del_texto`, `otorgado_en`, `revocado_en` | Único parcial `(adulto_mayor_id, finalidad)` donde `revocado_en IS NULL` |
| `aceptaciones_de_politica` | `usuario_id`, `version`, `aceptada_en` | PK `(usuario_id, version)` |

Una tarea programada diaria borra las sesiones vencidas hace más de 30 días.

### 4.8 Datos iniciales

**Producción no recibe usuarios de ejemplo.** Las cuentas reales entran así:

| Cuenta | Cómo se crea |
|---|---|
| Familiares | Registro por la aplicación. |
| Administradores | `npm run crear-admin` en cada entorno, con contraseña de un solo uso que se cambia al primer ingreso y autenticación en dos pasos (decisión 4). |
| Cuidadores | Los crea el administrador al importar cuidadores verificados ([M2](../PLAN_BACKEND_SENIORY.md), `npm run cuidadores:importar`); luego, registro propio (M9). |

**Fixtures de desarrollo** (solo local, pruebas y staging; `npm run semillas` se niega a correr en producción):

| Dato | Valor |
|---|---|
| Familiar de prueba | Andrea (`andrea@prueba.seniory.invalid`), con la contraseña de la variable `CONTRASENA_DE_PRUEBA`, nunca en el repositorio. |
| Adulto mayor | Doña Carmen, fecha de nacimiento que da 78 años, vínculo de responsable con Andrea. |
| Consentimiento | `datos_de_salud` vigente, otorgado por Andrea como representante, versión `v1`. |

Los IDs se derivan con UUID v5 de `f-andrea` y `am-carmen` (los ids de `frontend/data/familia.json`), así se mantienen estables. El dominio `.invalid` está reservado y nunca recibe correo real.

---

## 5. Seguridad

| Amenaza | Control |
|---|---|
| Robo de credenciales por fuerza bruta o listas filtradas | Argon2id; bloqueo progresivo por cuenta; límite por IP en `/auth/login` y `/auth/registro`; lista de contraseñas comunes. |
| Enumeración de cuentas | Mismo mensaje para «no existe» y «contraseña errónea»; si el correo no existe se verifica contra un hash ficticio para igualar el tiempo de respuesta. El registro con correo existente responde 409, aceptado como compromiso de usabilidad y mitigado con el límite por IP. |
| Robo de sesión | Cookies `HttpOnly`; acceso de 15 minutos; refresco rotativo con detección de reutilización. |
| CSRF | `SameSite=Lax` y verificación de `Origin`. |
| Escalada de privilegios | Registro sin campo `rol`; administradores solo por línea de comandos; rol releído de la base en cada renovación. |
| Acceso a un adulto mayor ajeno (IDOR) | Toda ruta con `:id` verifica el vínculo; sin vínculo responde 404. |
| Datos personales en logs | Redacción de M0 más pruebas que lo verifican. |
| Consentimiento ignorado | Revocar emite un evento y Teleasistencia lo consulta en cada acceso (M6). |

**Auditoría** (con el servicio de M0): registro, inicio de sesión exitoso y fallido, bloqueo, reutilización de refresco, cierre de sesión, registro de adulto mayor, vínculos, consentimientos otorgados y revocados, creación de administradores.

---

## 6. Pruebas obligatorias

| Capa | Prueba |
|---|---|
| Unitarias | `Correo`, `Contrasena`, `TelefonoE164`, `NombrePersona`: casos válidos e inválidos. |
| Unitarias | `Credencial`: el 5.º fallo bloquea 15 min; el bloqueo siguiente dura 30; un éxito reinicia el contador; con `RelojFalso`, el bloqueo expira. |
| Unitarias | `SesionDeRefresco`: rotar marca el anterior como reemplazado; presentar uno reemplazado revoca la familia. |
| Unitarias | `AdultoMayor.edad()`: el día antes y el día del cumpleaños, con `RelojFalso`. |
| Unitarias | `Consentimiento`: un familiar sin vínculo no puede otorgarlo; no puede haber dos vigentes. |
| Integración | Correo único sin distinguir mayúsculas (`Andrea@` y `andrea@`). |
| Integración | Único parcial de vínculos y de consentimientos vigentes. |
| Integración | `RegistrarAdultoMayor` crea adulto mayor, vínculo y evento juntos, o nada. |
| API | Registro → `/yo` → cierre de sesión → `/yo` responde 401. |
| API | Registro con `rol: "administrador"` en el cuerpo → 400. |
| Arquitectura | `IdentidadModule` exporta solo `CONSULTA_DE_IDENTIDAD` y `VERIFICADOR_DE_TOKENS`. |
| API | Inicio de sesión con usuario inexistente y con contraseña errónea: mismo estado y mismo mensaje. |
| API | Refresco reutilizado después de 30 s → 401 y la sesión legítima también queda revocada. |
| API | Dos renovaciones simultáneas con el mismo token (dentro de 30 s) → ambas reciben un par válido de la misma familia y la sesión sigue activa. |
| API | `POST` sin encabezado `Origin` (llamada del BFF) se acepta; con `Origin` no permitido se rechaza. |
| API | Petición `POST` con `Origin` no permitido → rechazada. |
| API | **Matriz de autorización:** un familiar no ve ni consiente sobre el adulto mayor de otro (404); un cuidador no puede registrar adultos mayores (403); sin sesión → 401. |
| API | Ninguna respuesta incluye `hash`, `intentos_fallidos` ni tokens en el cuerpo. |
| Logs | Tras un inicio de sesión, los logs no contienen la contraseña, el correo ni la cookie. |

---

## 7. Integración con el frontend

El trabajo del frontend tiene su propio plan: **[F1 — Identidad en el frontend](../frontend/F1-identidad.md)**, construido sobre [F0](../frontend/F0-base-de-integracion.md).

**Decisión (2026-10-24): Next actúa como *backend for frontend* (BFF).** El navegador solo habla con Next; los componentes de servidor y las acciones de servidor de Next llaman a esta API de servidor a servidor. Las cookies de sesión viven en el dominio del frontend: Next las escribe a partir de los `Set-Cookie` que devuelve `/auth/*`. Reemplaza la opción de reescrituras que se había propuesto aquí, porque sigue la recomendación de la documentación de Next 16 y no expone esta API al navegador.

Consecuencias para este módulo (ya incorporadas en §4.4 y §5):
- Ventana de gracia de 30 s para un token de refresco recién reemplazado.
- Verificación de `Origin` solo cuando la petición trae ese encabezado.
- Límite por IP usando `X-Cliente-IP` cuando `X-Seniory-BFF` trae el secreto correcto (M0 §4.10).

Ya no hay una versión de demostración: el recorrido que sigue el frontend es el de la aplicación real ([F1](../frontend/F1-identidad.md)).

---

## 8. Pull requests

| PR | Contenido |
|---|---|
| 1 ✅ | Dominio: objetos de valor, `Usuario` con `Credencial`, `SesionDeRefresco`, `AdultoMayor`, `Vinculo`, `Consentimiento`, con pruebas unitarias. |
| 2 ✅ | Persistencia: esquema `identidad`, migración, repositorios y pruebas de integración. El esquema y la migración ya existían (base de datos construida por adelantado): este PR agrega los repositorios. |
| 3 ✅ | Autenticación: hash, tokens, `VerificadorDeTokens`, casos de uso de registro, inicio, renovación y cierre de sesión, endpoints de `/auth`, límites por ruta y pruebas de API. |
| 4 ✅ | Perfil, adultos mayores, consentimientos, `ConsultaDeIdentidad`, eventos, auditoría y matriz de autorización. |
| 5 ✅ | Fixtures de desarrollo, `crear-admin` y documentación del módulo. |
| 6 ✅ | Cambiar y recuperar la contraseña (`olvidé mi contraseña`), con el puerto del canal de envío. |
| 7 | Ajustes para el BFF: ventana de gracia del refresco, `Origin` opcional y `X-Cliente-IP` (con pruebas). El trabajo de pantallas va en [F1](../frontend/F1-identidad.md). |
| 8 | *(Opcional, o en M10)* Exportar y eliminar cuenta. |

---

## 9. Definición de terminado de M1

Además de la definición común ([PLAN_BACKEND §6.3](../PLAN_BACKEND_SENIORY.md)):

- [ ] En staging: registro → alta de Doña Carmen → consentimiento → `/app` muestra «Hola, Andrea» con datos de la sesión, sin leer `familia.json` para el familiar ni el adulto mayor.
- [ ] Matriz de autorización completa en verde; los recursos ajenos responden 404.
- [ ] Un refresco reutilizado revoca la familia de sesiones y queda auditado.
- [ ] La CI verifica que los logs no contienen contraseñas, correos ni cookies.
- [ ] `ConsultaDeIdentidad` documentada en el README del módulo, con sus pruebas.
- [ ] Dos renovaciones simultáneas del mismo token no cierran la sesión.

---

## 10. Decisiones abiertas

| # | Decisión | Recomendación |
|---|---|---|
| 1 | **Quién otorga el consentimiento de salud.** La Ley 1581 hace titular al adulto mayor; un familiar solo puede hacerlo si lo representa. | Modelo con `calidad` (`titular` o `representante`). Consultar asesoría legal antes de producción; para el adulto mayor autovalente, lo ideal es que consienta él mismo. |
| 2 | Si el adulto mayor tiene cuenta propia. | Todavía no; el modelo lo permite con `usuarioId`. |
| 3 | Verificación de correo obligatoria. | Sí, cuando exista el canal de correo (M5); hasta entonces, cuentas sin verificar con todas las funciones. |
| 4 | Autenticación en dos pasos para administradores. | Sí antes de producción (M10). |
| 5 | ~~Reescrituras de Next o subdominios.~~ | **Resuelta (2026-10-24):** Next como BFF ([F1](../frontend/F1-identidad.md)). |
| 6 | ¿Volver a pedir consentimiento si cambia el texto? | Sí ante cambios de fondo; se maneja comparando `versionDelTexto` con la vigente. |
| 7 | **El bloqueo de cuenta permite una denegación de servicio:** quien conoce el correo de otra persona puede bloquearla (15 min, y hasta 24 h si insiste). Además, el contador solo se reinicia con un éxito: 4 errores de hace meses más uno hoy bloquean. | Aceptado en M1: el límite por IP frena el abuso y la alternativa (sin bloqueo) deja la cuenta expuesta a adivinar contraseñas. Evaluar en M10 que los fallos caduquen tras un tiempo y desbloquear por correo cuando exista el canal (M5). |
