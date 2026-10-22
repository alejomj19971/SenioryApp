# M0 — Plataforma y compartido

| Campo | Valor |
|---|---|
| **Módulo** | M0 (primero del orden de [PLAN_BACKEND §7](../PLAN_BACKEND_SENIORY.md)) |
| **Bloques del diagrama** | `compartido/`, API REST (adaptadores de entrada), eventos de dominio internos, base de datos con un esquema por módulo |
| **Escenarios de ADR-01** | E1, E2 (base de operación), E12, E13, E14 (reglas que hace cumplir) |
| **Tamaño** | M |
| **Depende de** | — |
| **Estado** | Plan aprobado (2026-10-22) |

---

## 1. Objetivo y alcance

Construir el **esqueleto que todos los módulos usan**: un backend NestJS que arranca, se conecta a PostgreSQL, publica eventos de forma confiable, responde errores en un formato único, se prueba, verifica sus propias reglas de arquitectura y se despliega a staging. **No incluye lógica de negocio.**

**Entra**
- Proyecto, herramientas de calidad y scripts.
- Configuración validada por entorno.
- Base de datos local, migraciones y convención de esquemas.
- `compartido/`: objetos de valor, puertos base, errores, unidad de trabajo, outbox, auditoría y guards de seguridad.
- Capa HTTP transversal: prefijo, seguridad, CORS, límites, errores, correlación, logs, salud y documentación.
- Infraestructura de pruebas, reglas de arquitectura, CI, Docker y despliegue a staging.

**No entra**
- Usuarios, tokens o inicio de sesión (M1). El guard de autenticación queda listo, pero sin verificador de tokens: todo lo que no sea público responde 401.
- Tablas de cualquier módulo de negocio.

---

## 2. Relación con el diagrama

| Elemento del diagrama | Qué construye M0 |
|---|---|
| `compartido/`: «eventos de dominio base, tipos (Dinero, Id), errores» | `src/compartido/` con esos tipos y nada más que lo común. |
| Regla «un módulo usa los puertos de entrada de otro, nunca su dominio ni sus tablas (E13)» | Reglas de `dependency-cruiser` que rompen la CI si se violan. |
| «Eventos de dominio internos» | Outbox transaccional y despachador en proceso. |
| API REST: «adaptadores de entrada (controladores)» | Prefijo `/api/v1`, filtros de errores, guards y validación comunes. |
| «Base de datos · un esquema por módulo» | Convención de esquemas y migraciones; el esquema `compartido` es el primero. |
| «Anatomía de cada módulo (hexagonal)» | Plantilla de carpetas que copia cada módulo. |
| «Pruebas del dominio con dobles de los puertos (E14)» | Dobles base: `RelojFalso`, `GeneradorDeIdsSecuencial`, publicador de eventos en memoria. |

---

## 3. Definición de preparado

- [ ] Node.js 24 LTS y Docker Desktop instalados en las máquinas de ambos desarrolladores (Testcontainers y la base local lo necesitan; en Windows, Docker Desktop con WSL 2).
- [ ] **Hosting de staging elegido** (Railway, Render o Fly.io) y cuenta creada. Si no se decide, M0 termina sin el despliegue y se marca como pendiente.
- [ ] Versión de PostgreSQL acordada: la misma versión mayor que ofrezca el hosting (17 por defecto).
- [ ] Repositorio con `main` protegido: CI obligatoria y una revisión antes de fusionar.

---

## 4. Diseño

### 4.1 Estructura de archivos

```
backend/
├─ src/
│  ├─ main.ts                              ← arranque: Express, prefijo, seguridad, ValidationPipe, Swagger
│  ├─ app.module.ts                        ← compone CompartidoModule y los módulos; registra el guard global
│  ├─ configuracion/
│  │  ├─ variables-de-entorno.ts           ← clase con class-validator; la valida @nestjs/config
│  │  └─ configuracion.module.ts
│  ├─ salud/
│  │  └─ salud.controller.ts               ← /salud y /salud/listo
│  └─ compartido/
│     ├─ dominio/
│     │  ├─ dinero.ts
│     │  ├─ fecha-civil.ts
│     │  ├─ id.ts
│     │  └─ errores.ts                     ← jerarquía de errores de dominio
│     ├─ aplicacion/puertos/
│     │  ├─ reloj.ts
│     │  ├─ generador-de-ids.ts
│     │  ├─ unidad-de-trabajo.ts
│     │  ├─ publicador-de-eventos.ts
│     │  ├─ auditoria.ts
│     │  └─ verificador-de-tokens.ts       ← lo implementa identidad en M1
│     ├─ eventos/
│     │  └─ evento-de-integracion.ts       ← sobre común; cada módulo agrega aquí sus contratos
│     ├─ infraestructura/
│     │  ├─ base-de-datos/                 ← conexión, contexto transaccional, unidad de trabajo
│     │  ├─ outbox/                        ← esquema, publicador, despachador y sondeo
│     │  ├─ auditoria/                     ← esquema y adaptador
│     │  ├─ reloj-del-sistema.ts
│     │  └─ generador-de-ids-uuid-v7.ts
│     ├─ http/
│     │  ├─ filtro-de-errores.ts           ← errores → problem+json
│     │  ├─ validacion.ts                  ← opciones del ValidationPipe y formato de errores por campo
│     │  ├─ correlacion.ts                 ← X-Request-Id
│     │  ├─ guard-de-autenticacion.ts      ← deniega por defecto
│     │  ├─ guard-de-roles.ts
│     │  └─ decoradores.ts                 ← @Publico(), @Roles(), @UsuarioActual()
│     └─ compartido.module.ts
├─ pruebas/
│  ├─ unitarias/compartido/
│  ├─ integracion/compartido/
│  ├─ api/
│  └─ soporte/                             ← Testcontainers, dobles, fábricas
├─ drizzle/                                ← migraciones generadas
├─ semillas/
├─ .dependency-cruiser.cjs
├─ docker-compose.yml
├─ Dockerfile
├─ drizzle.config.ts
├─ jest.config.ts                          ← proyectos `unitarias` e `integracion`
├─ nest-cli.json                           ← plugin de Swagger (documenta los DTOs automáticamente)
├─ .env.ejemplo
└─ package.json
```

**Plantilla para cada módulo de negocio** (se documenta en M0 y se copia desde M1):

```
src/<modulo>/
├─ dominio/
├─ aplicacion/{casos-de-uso,puertos/{entrada,salida}}/
├─ infraestructura/{entrada/rest,salida/persistencia}/
├─ README.md
└─ <modulo>.module.ts                     ← `exports` contiene SOLO los símbolos de sus puertos de entrada
```

Ejemplo del cableado de un módulo:

```ts
@Module({
  imports: [CompartidoModule],
  controllers: [AuthController, PerfilController],
  providers: [
    RegistrarFamiliar, IniciarSesion,                                // casos de uso
    { provide: REPOSITORIO_USUARIOS, useClass: RepositorioUsuariosDrizzle },
    { provide: HASH_DE_CONTRASENAS, useClass: HashArgon2 },
    { provide: CONSULTA_DE_IDENTIDAD, useClass: ConsultaDeIdentidadServicio },
  ],
  exports: [CONSULTA_DE_IDENTIDAD],   // lo único que otros módulos pueden inyectar
})
export class IdentidadModule {}
```

Si otro módulo intenta inyectar `REPOSITORIO_USUARIOS`, **Nest falla al arrancar** porque ese proveedor no está exportado. Es la primera barrera de E13; `dependency-cruiser` es la segunda.

### 4.2 Dependencias

Se instala la versión estable más reciente y se fija con `package-lock.json`. Cualquier dependencia nueva fuera de esta lista se consulta antes.

| Paquete | Para qué |
|---|---|
| `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` | Framework con Express, el servidor por defecto de Nest (el de la documentación oficial y los tutoriales). |
| `@nestjs/config` | Variables de entorno, validadas al arrancar. |
| `class-validator`, `class-transformer` | Validación de DTOs con decoradores (`@IsEmail()`, `@Length()`), como las anotaciones de validación de Java. |
| `helmet`, `cookie-parser` | Cabeceras de seguridad y lectura de cookies. |
| `@nestjs/throttler` | Límite de peticiones. |
| `@nestjs/event-emitter` | Bus de eventos en proceso. |
| `@nestjs/schedule` | Sondeo del outbox y tareas programadas. |
| `@nestjs/swagger` | OpenAPI (solo fuera de producción). Con el plugin del CLI, los DTOs se documentan solos. |
| `drizzle-orm`, `drizzle-kit`, `pg` | Acceso a datos y migraciones. Drizzle no tiene módulo oficial de Nest: se expone con un *provider* propio (`BASE_DE_DATOS`) en `compartido/infraestructura/base-de-datos`. |
| `nestjs-pino`, `pino`, `pino-http` | Logs JSON. |
| `@sentry/nestjs` | Reporte de errores (opcional en local). |
| `uuid` | UUID v7. |
| Desarrollo: `jest`, `ts-jest`, `@nestjs/testing` | Pruebas. Es lo que genera el CLI de Nest y funciona con decoradores sin configuración extra. |
| Desarrollo: `@testcontainers/postgresql`, `supertest`, `fast-check` | Integración con Postgres real, API y pruebas de propiedades. |
| Desarrollo: `dependency-cruiser`, `eslint`, `typescript-eslint`, `prettier` | Calidad y arquitectura. |

### 4.3 Scripts de `package.json`

| Script | Qué hace |
|---|---|
| `dev` | Arranca con recarga. |
| `build` | Compila a `dist/`. |
| `lint` | ESLint + verificación de tipos (`tsc --noEmit`). |
| `arquitectura` | `dependency-cruiser` con las reglas de §4.9. |
| `test` | Unitarias (sin Docker). |
| `test:integracion` | Integración y API (con Testcontainers). |
| `test:cobertura` | Cobertura con umbrales. |
| `bd:generar` | Genera una migración desde los esquemas Drizzle. |
| `bd:migrar` | Aplica migraciones pendientes. |
| `semillas` | Carga datos de prueba (idempotente). |

### 4.4 Configuración

Las variables se declaran en una clase con decoradores de `class-validator` y `@nestjs/config` las valida al arrancar (función `validate`); **si falta una o es inválida, la aplicación no inicia** y el error dice cuál. `.env.ejemplo` lista todas sin valores secretos.

| Variable | Ejemplo | Notas |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test`, `staging`, `production`. |
| `PUERTO` | `3001` | El frontend usa 3000. |
| `URL_BASE_DE_DATOS` | `postgres://seniory:seniory@localhost:5432/seniory` | Secreta en staging y producción. |
| `ORIGENES_PERMITIDOS` | `http://localhost:3000` | Lista separada por comas; sin comodines. |
| `NIVEL_DE_LOG` | `info` | |
| `ZONA_HORARIA_NEGOCIO` | `America/Bogota` | Usada por `FechaCivil`. |
| `SENTRY_DSN` | (vacío en local) | Opcional. |

M1 agrega las variables de tokens y cookies.

### 4.5 Base de datos

| Tema | Convención |
|---|---|
| Esquemas | Uno por módulo (`compartido`, `identidad`, `directorio`…), declarado con `pgSchema` de Drizzle en la persistencia de cada módulo. |
| Nombres | Tablas y columnas en `snake_case`, tablas en plural y en español. El mapeo a `camelCase` ocurre en el repositorio. |
| Identificadores | `uuid` generado por la aplicación (UUID v7, ordenable por tiempo). |
| Tiempo | `timestamptz` siempre; las fechas de negocio (día de un servicio) son `date`. |
| Dinero | `bigint` en pesos COP; nunca `numeric` con decimales ni `float`. |
| Restricciones | `CHECK`, `UNIQUE` y claves foráneas **dentro** del esquema. Entre esquemas, solo IDs sin clave foránea. |
| Extensiones | `citext`, `unaccent`, `pg_trgm` (se habilitan en la primera migración). |
| Migraciones | Generadas con `drizzle-kit`, revisadas a mano en el PR y nunca editadas una vez aplicadas. Cambios destructivos en dos pasos. |
| Semillas | Idempotentes. Los IDs de prueba se derivan del id antiguo del JSON con UUID v5, para que sean reproducibles. |

`docker-compose.yml` levanta `postgres:17` con volumen persistente y una base `seniory` para desarrollo; las pruebas usan Testcontainers con su propia base efímera.

### 4.6 `compartido/dominio`

```ts
// dinero.ts — entero en pesos COP, nunca negativo
export class Dinero {
  static pesos(valor: number): Dinero;          // ErrorDeValidacion si no es entero seguro ≥ 0
  static cero(): Dinero;
  sumar(otro: Dinero): Dinero;
  restar(otro: Dinero): Dinero;                 // ErrorDeValidacion si el resultado es negativo
  multiplicarPor(factor: number): Dinero;       // factor entero (ej. horas)
  porcentaje(bps: number): Dinero;              // puntos básicos; redondeo mitad hacia arriba
  igualA(otro: Dinero): boolean;
  get valor(): number;
}

// fecha-civil.ts — un día del calendario, sin hora ni zona
export class FechaCivil {
  static desdeTexto(texto: string): FechaCivil; // "YYYY-MM-DD"; ErrorDeValidacion si no es válida
  static hoy(reloj: Reloj, zona: string): FechaCivil;
  esAnteriorA(otra: FechaCivil): boolean;
  sumarDias(dias: number): FechaCivil;
  aTexto(): string;
}

// id.ts — identificadores tipados para no mezclar, por ejemplo, un UsuarioId con un ServicioId
export type Id<Marca extends string> = string & { readonly __marca: Marca };

// errores.ts
export abstract class ErrorDeDominio extends Error { abstract readonly codigo: string; }
export class ErrorDeValidacion extends ErrorDeDominio {}      // datos con forma o rango inválido
export class RecursoNoEncontrado extends ErrorDeDominio {}    // inexistente o ajeno
export class ConflictoDeEstado extends ErrorDeDominio {}      // transición inválida, duplicado
export class ReglaDeNegocioIncumplida extends ErrorDeDominio {}
export class NoAutenticado extends ErrorDeDominio {}
export class SinPermiso extends ErrorDeDominio {}             // rol insuficiente
```

`FechaCivil.hoy` calcula el día con `Intl.DateTimeFormat` en la zona indicada, sin dependencias. Es la respuesta al hallazgo H2 del plan general (el frontend calcula «hoy» en UTC).

### 4.7 `compartido/aplicacion/puertos`

```ts
export interface Reloj { ahora(): Date; }
export interface GeneradorDeIds { nuevo<M extends string>(): Id<M>; }

export interface UnidadDeTrabajo {
  // Ejecuta el trabajo en una transacción. Los repositorios y el publicador de eventos
  // usan automáticamente esa transacción.
  ejecutar<T>(trabajo: () => Promise<T>): Promise<T>;
}

export interface PublicadorDeEventos {
  // Guarda el evento en el outbox dentro de la transacción actual.
  // Falla si se llama fuera de una unidad de trabajo.
  publicar(evento: EventoDeIntegracion): Promise<void>;
}

export interface Auditoria {
  registrar(entrada: EntradaDeAuditoria): Promise<void>;
}
export interface EntradaDeAuditoria {
  actorId: string | null;
  accion: string;                 // ej. "teleasistencia.leer_signos"
  recursoTipo: string;
  recursoId: string | null;
  resultado: 'permitido' | 'denegado' | 'error';
  metadatos?: Record<string, string | number | boolean>;   // sin datos personales
}

export interface VerificadorDeTokens {
  verificar(token: string): Promise<UsuarioAutenticado>;   // NoAutenticado si no es válido
}
export interface UsuarioAutenticado {
  id: string;
  rol: 'familiar' | 'adulto_mayor' | 'cuidador' | 'administrador';
}
```

Cada puerto se inyecta con un símbolo (`RELOJ`, `UNIDAD_DE_TRABAJO`…), nunca por clase concreta.

### 4.8 Transacciones, outbox y auditoría

**Unidad de trabajo.** El adaptador abre una transacción de Drizzle y la guarda en un `AsyncLocalStorage`. Los repositorios piden la conexión al contexto: si hay transacción, la usan; si no, usan el pool. Así el caso de uso no conoce Drizzle y los repositorios no reciben la transacción como parámetro.

**Eventos de integración.** Sobre común, definido en `compartido/eventos`:

```ts
export interface EventoDeIntegracion<Tipo extends string = string, Datos = unknown> {
  id: string;               // UUID v7
  tipo: Tipo;               // ej. "identidad.consentimiento_revocado"
  version: number;          // versión del esquema de `datos`
  ocurridoEn: string;       // ISO 8601
  idDeCorrelacion: string;  // viene de la petición HTTP que lo originó
  datos: Datos;             // solo IDs y valores necesarios; nunca datos clínicos
}
```

**Outbox** (esquema `compartido`):

| Tabla | Columnas principales |
|---|---|
| `outbox` | `id`, `tipo`, `version`, `datos` (jsonb), `id_de_correlacion`, `creado_en`, `procesado_en`, `intentos`, `proxima_ejecucion`, `ultimo_error`, `fallido_en` |
| `eventos_consumidos` | `manejador`, `evento_id`, `consumido_en` (clave primaria `manejador` + `evento_id`) |

Flujo:
1. El caso de uso guarda su cambio y llama a `publicar()`: el evento entra al outbox **en la misma transacción**.
2. Tras el *commit*, el despachador entrega el evento en proceso.
3. Un sondeo cada segundo toma los pendientes con `FOR UPDATE SKIP LOCKED`, para recuperar los que no se entregaron (por ejemplo, si el proceso se reinició).
4. Cada manejador corre en su propia unidad de trabajo y registra `(manejador, evento_id)` en `eventos_consumidos` en esa misma transacción. Si ya existe, no hace nada: eso lo vuelve **idempotente**.
5. El evento se marca procesado cuando todos sus manejadores terminaron. Si alguno falla, se reintenta con espera creciente; tras el máximo de intentos se marca `fallido_en` y se reporta a Sentry.

**Auditoría** (esquema `compartido`, tabla `auditoria`): `id`, `ocurrido_en`, `actor_id`, `accion`, `recurso_tipo`, `recurso_id`, `resultado`, `id_de_correlacion`, `metadatos`. Se escribe **fuera de la transacción del caso de uso** (con su propia conexión), para que un acceso denegado quede registrado aunque la operación falle (E6: registro en menos de 1 s). Es una tabla de solo inserción; en M10 se le retiran los permisos de actualización y borrado.

### 4.9 Reglas de arquitectura (`npm run arquitectura`)

| Regla | Prohíbe |
|---|---|
| `sin-ciclos` | Cualquier dependencia circular. |
| `dominio-puro` | Que `*/dominio/**` importe `aplicacion`, `infraestructura`, `@nestjs/*`, `class-validator`, `drizzle-orm`, `pg`, `express` u otro módulo (salvo `compartido/dominio`). Los decoradores de validación son de la capa REST; el dominio valida con sus objetos de valor. |
| `aplicacion-sin-infraestructura` | Que `*/aplicacion/**` importe `infraestructura`. |
| `frontera-de-modulo` | Que un módulo importe de otro algo distinto de `aplicacion/puertos/entrada`. |
| `esquemas-privados` | Que el esquema de persistencia de un módulo se importe desde otro módulo. |
| `eventos-por-contrato` | Que un manejador importe eventos de otro sitio que no sea `compartido/eventos`. |
| `compartido-no-depende-de-modulos` | Que `compartido` importe cualquier módulo de negocio. |
| `exports-solo-puertos-de-entrada` | Que el `exports` de un `@Module` incluya algo distinto de los símbolos de sus puertos de entrada o de puertos declarados en `compartido` que el módulo implementa (como `VERIFICADOR_DE_TOKENS`, que implementa Identidad). Se verifica con una prueba que recorre los módulos registrados (Nest no tiene una regla nativa para esto). |

Cada regla tiene una **prueba que la rompe a propósito** (un archivo de ejemplo en `pruebas/arquitectura/`, excluido del build) para confirmar que la CI la detecta.

### 4.10 Capa HTTP transversal

| Tema | Decisión |
|---|---|
| Prefijo | `/api/v1` para todo, salvo `/salud` y `/salud/listo`. |
| Seguridad | `helmet`; `cookie-parser`; límite de cuerpo de 100 KB (los archivos de M9 tendrán su propia ruta); `@nestjs/throttler` global (por ejemplo, 100 peticiones por minuto por IP) con límites más estrictos por ruta desde M1. |
| CORS | Solo `ORIGENES_PERMITIDOS`, con credenciales. |
| Autenticación | `GuardDeAutenticacion` global que **deniega por defecto**. `@Publico()` lo desactiva por ruta. Lee el token de la cookie (o de `Authorization: Bearer` en pruebas) y lo valida con el puerto `VerificadorDeTokens`. Se registra en `AppModule` con `APP_GUARD`. En M0, `AppModule` provee un `VerificadorQueRechazaTodo`, así que toda ruta no pública responde 401; desde M1, `IdentidadModule` exporta el verificador real. |
| Roles | `@Roles('familiar', …)` con `GuardDeRoles`; un rol insuficiente responde 403. |
| Validación | `ValidationPipe` global con `whitelist: true`, `forbidNonWhitelisted: true` y `transform: true`: un campo no declarado en el DTO se rechaza (evita asignación masiva, por ejemplo enviar `rol` al registrarse). Los DTOs son clases con decoradores de `class-validator` y mensajes en español. |
| Correlación | Se acepta `X-Request-Id` si es un UUID válido; si no, se genera. Se devuelve en la respuesta, va en cada log y en cada evento. |
| Logs | `nestjs-pino` en JSON. Redacción obligatoria de `authorization`, `cookie`, `set-cookie`, `contrasena`, `correo`, `telefono` y cualquier `datos` de eventos. |
| Errores | `FiltroDeErrores` traduce todo a `application/problem+json` (tabla abajo). Un error no controlado responde 500 sin detalles internos y se reporta a Sentry. |
| Documentación | Swagger en `/api/docs` solo fuera de producción. |
| Salud | `/salud` responde 200 si el proceso vive. `/salud/listo` responde 200 solo si la base responde y el outbox no tiene eventos fallidos sin atender; si no, 503. |
| Apagado | `enableShutdownHooks`: deja de aceptar peticiones, termina las en curso y cierra el pool. |

**Errores → respuesta**

| Error | Estado HTTP | `codigo` |
|---|---|---|
| Validación de DTO (`ValidationPipe`) / `ErrorDeValidacion` | 400 | `validacion` (con lista `errores: [{ campo, mensaje }]`) |
| `NoAutenticado` | 401 | `no_autenticado` |
| `SinPermiso` | 403 | `sin_permiso` |
| `RecursoNoEncontrado` (inexistente **o ajeno**) | 404 | `no_encontrado` |
| `ConflictoDeEstado` | 409 | `conflicto` |
| `ReglaDeNegocioIncumplida` | 422 | el código de la regla |
| Límite de peticiones | 429 | `demasiadas_solicitudes` |
| Cualquier otro | 500 | `error_interno` |

Ejemplo de cuerpo:

```json
{
  "type": "urn:seniory:problema:validacion",
  "title": "Los datos enviados no son válidos",
  "status": 400,
  "codigo": "validacion",
  "idDeCorrelacion": "0192f1a4-…",
  "errores": [{ "campo": "horas", "mensaje": "Debe estar entre 1 y 8" }]
}
```

### 4.11 Pruebas: infraestructura

- **`jest.config.ts`** con dos proyectos: `unitarias` (sin Docker, rápidas) e `integracion` (Testcontainers y Supertest). El contenedor de Postgres se arranca una vez en el `globalSetup` de `integracion`.
- **`pruebas/soporte/`**:
  - `RelojFalso` (con `fijar()` y `avanzar()`), `GeneradorDeIdsSecuencial`, `PublicadorDeEventosEnMemoria`, `AuditoriaEnMemoria`.
  - `baseDeDatosDePrueba()`: arranca un Postgres con Testcontainers una vez por ejecución, aplica migraciones y limpia las tablas entre pruebas.
  - `crearAppDePrueba()`: levanta la aplicación Nest con sobreescritura de puertos para pruebas de API.
- **Umbrales de cobertura**: `compartido/dominio` ≥ 90 %, global ≥ 70 %.

### 4.12 Integración continua y despliegue

`.github/workflows/backend.yml`, se ejecuta en cada PR y en cada *push* a `main` que toque `backend/**`:

1. `npm ci`
2. `npm run lint`
3. `npm run arquitectura`
4. `npm test` (unitarias)
5. `npm run test:integracion`
6. `npm run build`
7. `npm audit --audit-level=high`
8. Solo en `main` y con todo en verde: construir la imagen y desplegar a staging, ejecutar `bd:migrar` y comprobar `/salud/listo`.

El `Dockerfile` es de varias etapas (dependencias → build → imagen final con solo `dist/` y dependencias de producción), corre con un usuario sin privilegios y expone `PUERTO`. El despliegue del frontend en Vercel no cambia (su *Root Directory* sigue siendo `frontend`).

---

## 5. Seguridad

| Amenaza | Control en M0 |
|---|---|
| Endpoints olvidados sin protección | Guard global que deniega por defecto; las rutas públicas se marcan explícitamente. |
| Asignación masiva de campos | `ValidationPipe` con `forbidNonWhitelisted`. |
| Fuga de detalles internos | Errores 500 genéricos; trazas solo en Sentry. |
| Datos personales en logs | Redacción de campos en `pino` y eventos sin datos clínicos. |
| Secretos en el repositorio | Solo variables de entorno; `.env` en `.gitignore`; `.env.ejemplo` sin valores reales. |
| Dependencias vulnerables | `npm audit` en CI y Dependabot. |
| Abuso por volumen | `throttler` global. |
| Cabeceras inseguras | `helmet`. |
| Acceso indebido entre módulos | `exports` solo con puertos de entrada (Nest falla al arrancar) y reglas de `dependency-cruiser`. |
| Origen no autorizado | CORS con lista cerrada. |

---

## 6. Pruebas obligatorias

| Capa | Prueba |
|---|---|
| Unitarias | `Dinero`: no acepta negativos ni decimales; `porcentaje(800)` de 20 000 es 1 600; redondeo mitad hacia arriba; propiedades de suma y resta (fast-check). |
| Unitarias | `FechaCivil`: rechaza `2026-02-30`; `hoy()` con `RelojFalso` a las 8 p. m. del 21 de octubre en Bogotá (01:00 UTC del 22) devuelve `2026-10-21`. |
| Unitarias | Mapeo de cada error de dominio a su estado HTTP y `codigo`. |
| Integración | Unidad de trabajo: un error dentro de la transacción revierte el cambio **y** el evento del outbox. |
| Integración | Outbox: un evento confirmado se entrega una vez; reprocesarlo no vuelve a ejecutar el manejador; un manejador que falla se reintenta y termina en `fallido_en`. |
| Integración | Auditoría: se registra aunque la transacción del caso de uso se revierta. |
| API | Ruta no pública sin token → 401 en `problem+json`; campo no declarado → 400; `X-Request-Id` se devuelve; `/salud/listo` → 503 con la base detenida. |
| Arquitectura | Cada regla de §4.9 detecta su archivo de ejemplo. |

---

## 7. Integración con el frontend

M0 no cambia pantallas. Se deja documentado en `backend/README.md` cómo levantar el backend junto al frontend (puertos 3001 y 3000) y la variable que el frontend usará desde M1 para llegar a la API.

---

## 8. Pull requests

| PR | Contenido | Se puede revisar porque… |
|---|---|---|
| 1 | Proyecto creado con el CLI de Nest (`nest new`, Express), TypeScript estricto, ESLint, Prettier, Jest con los dos proyectos, plugin de Swagger y scripts. | Solo herramientas, sin lógica. |
| 2 | Configuración validada, `docker-compose.yml`, Drizzle, primera migración (esquema `compartido`, extensiones). | Se prueba levantando la base local. |
| 3 | `compartido/dominio` (`Dinero`, `FechaCivil`, `Id`, errores) y puertos, con pruebas unitarias. | Código puro con pruebas. |
| 4 | Unidad de trabajo, outbox, despachador, sondeo y auditoría, con pruebas de integración. | La pieza más delicada, aislada en su propio PR. |
| 5 | Capa HTTP: errores, validación, correlación, logs, guards, CORS, `helmet`, `throttler`, salud y Swagger. | Probado con pruebas de API. |
| 6 | Reglas de `dependency-cruiser` con sus archivos de ejemplo y CI en GitHub Actions. | La CI se valida a sí misma. |
| 7 | `Dockerfile`, despliegue a staging y `backend/README.md`. | Depende del hosting elegido. |
| 8 | Borrador del **ADR-03** (stack, decisiones de este plan, datos de salud en Teleasistencia, `mensajeria`). | Documento. |

---

## 9. Definición de terminado de M0

Además de la definición común ([PLAN_BACKEND §6.3](../PLAN_BACKEND_SENIORY.md)):

- [ ] `npm run dev` arranca con la base local y `/salud/listo` responde 200.
- [ ] Sin una variable obligatoria, la aplicación no inicia y el mensaje dice cuál falta.
- [ ] Un evento se publica y se consume una sola vez, aunque se reprocese.
- [ ] Una transacción revertida no deja eventos en el outbox, pero sí deja su registro de auditoría.
- [ ] Cada regla de arquitectura rompe la CI con su archivo de ejemplo.
- [ ] Staging responde `/salud/listo` tras un *push* a `main` (o queda registrado como pendiente si el hosting no está decidido).
- [ ] ADR-03 en borrador y revisado por ambos.

---

## 10. Decisiones abiertas

| # | Decisión | Recomendación |
|---|---|---|
| 1 | Hosting de staging y producción | Elegir uno que permita región cercana a Colombia (o EE. UU.) y Postgres gestionado con respaldos; registrar en ADR-03. |
| 2 | Versión de PostgreSQL | La que ofrezca el hosting; la misma en local, pruebas y producción. |
| 3 | Límites globales de peticiones | Empezar con 100 por minuto por IP y ajustar con datos reales. |
