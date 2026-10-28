# SENIORY — Plan del backend por módulos (NestJS)

> **Para quien implemente (equipo o Claude Code):** el backend se construye **un módulo a la vez, de punta a punta**, en el orden de la sección 7. Cada módulo (sección 8) incluye dominio, persistencia, API, eventos, integración con el frontend y pruebas.
> Al terminar un módulo: cumple la **Definición de terminado común** (sección 6.3), resume lo hecho y **detente para revisión** antes de empezar el siguiente.
> Si algo es ambiguo, pregunta antes de inventar. Las decisiones marcadas **[ABIERTA]** necesitan confirmación del equipo (sección 10).
> Antes de modificar `frontend/`, lee `frontend/AGENTS.md`: esa versión de Next.js tiene cambios incompatibles.

| Campo | Valor |
|---|---|
| **Proyecto** | Seniory — *Creciendo y cuidando juntos* |
| **Fecha** | 2026-10-21 |
| **Estado** | En ejecución. Decisiones formalizadas en el [ADR-04](./ADR-04.md) (borrador) |
| **Base** | [ADR-01](./ADR-01.md) (estilo arquitectónico) · [ADR-02](./ADR-02.md) (repositorio único) · [PLAN_MVP_SENIORY](./PLAN_MVP_SENIORY.md) |
| **Versión** | Reemplaza la primera versión de este plan (organizada por fases). Parte de lo que el frontend hace hoy. **Actualizado el 2026-10-26: es la aplicación real, no una demo** (ver «Aplicación real» en la sección 1 y los requisitos de lanzamiento de la sección 12). |
| **Planes detallados** | Uno por módulo en [docs/backend/](./backend/README.md), alineados con el diagrama de arquitectura. |
| **Frontend** | La integración del frontend tiene su propio plan: [PLAN_FRONTEND_SENIORY.md](./PLAN_FRONTEND_SENIORY.md). Reemplaza la sección 9 de este documento en lo que se contradiga (en particular, Next actúa como BFF en lugar de reescrituras). |

---

## 1. Alcance y principios

El backend reemplaza los JSON de `frontend/data/` por una API real **sin cambiar las pantallas**: solo se reimplementa `frontend/lib/services/` (ADR-01 §4.7, ADR-02 §4.3). Estilo: **monolito modular por capas con arquitectura hexagonal** (ADR-01).

**Principios de trabajo**

1. **El frontend define el contrato.** Cada caso de uso nace de algo que una pantalla ya hace (sección 2). Lo que el frontend simula hoy, el backend lo hace de verdad.
2. **Un módulo a la vez, de punta a punta.** Un módulo no está terminado hasta que su pantalla funciona contra la API real.
3. **Dominio primero, sin framework.** Las reglas se escriben y se prueban antes que el controlador o la tabla (E14).
4. **La base de datos también defiende las reglas.** Restricciones, índices únicos parciales y `CHECK` respaldan al código; no se confía solo en validaciones de la aplicación.
5. **Seguridad por defecto.** Se deniega salvo permiso explícito; un recurso ajeno responde 404, no 403, para no revelar que existe.
6. **Cada decisión significativa queda en un ADR.**
7. **Aplicación real, no demo.** Lo que se construye es lo que usarán familias y cuidadores reales:
   - Los adaptadores simulados (pasarela, canales de notificación, línea de emergencia) existen **solo para desarrollo y pruebas**. En producción la aplicación **no arranca** si encuentra un adaptador simulado configurado.
   - Los datos de ejemplo (`semillas/`) son **fixtures de desarrollo**: el script se niega a ejecutarse con `NODE_ENV=production`. Producción solo recibe **datos de referencia** (franjas, política de precios, paquetes de bolsa) por migración, administradores creados por línea de comandos y cuidadores reales dados de alta y verificados.
   - La interfaz no promete lo que el sistema no hace (por ejemplo, no se menciona una «línea de emergencia» sin una integración real).
   - Los requisitos legales, operativos y de negocio para lanzar están en la sección 12 y bloquean el lanzamiento.

**Fuera de alcance por ahora:** microservicios, brokers externos, Kubernetes, GraphQL, dispositivos de monitoreo reales, módulo de acompañamiento presencial, solicitudes abiertas por zona (E8, posterior a la primera versión según ADR-01) y funciones de IA (solo el puerto, módulo M11). **Ya no está fuera de alcance:** autenticación, backend, base de datos, pagos reales ni el registro de cuidadores, que el plan del MVP dejaba afuera.

---

## 2. Qué hace hoy el frontend y a qué módulo pertenece

### 2.1 Inventario de funcionalidades

| Funcionalidad | Dónde está | Cómo funciona hoy | Módulo |
|---|---|---|---|
| Landing (hero, problema, pilares, confianza, cómo funciona, historias, accesibilidad, CTA) | `components/landing/*` | Contenido estático | Se queda en el frontend |
| Paquetes de bolsas (10, 20 y 40 h con 5, 8 y 12 % de descuento) | `landing/bolsas.tsx` | Constantes dentro del componente | M7 |
| Inicio: saludo, estado de la adulta mayor, último signo, próximo medicamento | `app/app/page.tsx` | `paciente.ts` y `teleasistencia.ts` leen JSON | M1, M6 |
| Punto de «medicamento pendiente» en la barra inferior | `shell/bottom-nav.tsx`, `app/app/layout.tsx` | Consulta el próximo medicamento en cada página | M6 |
| Búsqueda con filtros (texto, especialidad, jornada, zona, tarifa máxima) | `cuidadores/buscador-cuidadores.tsx` | Descarga todos los cuidadores y filtra en el navegador | M2 |
| Perfil: badges de verificación con fecha, bio, disponibilidad, hoja de vida, reseñas | `app/app/cuidadores/[id]` | JSON | M2, M9 |
| Contratación por horas: fecha, jornada, horas (1 a 8) y resumen de costo (8 %) | `contratar/[id]`, `contratacion/*` | `confirmarContratacion` simula el resultado | M3, M4 |
| «Usar bolsa de horas» (interruptor con saldo de 12 h) | `formulario-contratacion.tsx` | Constante `SALDO_BOLSA_DEMO_HORAS` | M7 |
| Confirmación de la contratación | `contratar/confirmacion` | Estado en memoria (`ContratacionProvider`) | M4 |
| Cuidador en turno con «Llamar» y «Escribir» | `teleasistencia/cuidador-en-turno.tsx` | `cuidadorAsignadoId` fijo en `familia.json` | M4 |
| Botón de alerta con cuenta regresiva de 5 s | `teleasistencia/boton-alerta.tsx` | Simulado: siempre muestra «enviada» | M5, M6 |
| Medicamentos: marcar tomado o no tomado, alarma sonora, «atrasado» | `lista-medicamentos.tsx` | Estado local, se pierde al recargar | M6 |
| Signos vitales: última lectura y gráfica de 7 días | `grafica-signos.tsx` | JSON | M6 |
| Mensajería con el cuidador | `mensajeria/chat-mensajes.tsx` | Respuestas automáticas simuladas, «En línea», «Escribiendo…» | M8 |
| Alto contraste y tamaño de texto | `accesibilidad-provider.tsx` | `localStorage` | Frontend (sincronizar en M1 es opcional) |
| Comando de voz | `accesibilidad/boton-voz.tsx` | API del navegador | Frontend (sin backend) |

### 2.2 Hallazgos que el backend debe resolver

Salieron de leer el código del frontend. Cada uno queda asignado a un módulo.

| # | Hallazgo | Consecuencia | Módulo |
|---|---|---|---|
| H1 | `Cuidador` incluye `telefono` y la búsqueda envía la lista completa al navegador | Los teléfonos de todos los cuidadores viajan en la página. El listado público no debe llevarlos; solo los ve la familia con un servicio activo (minimización de datos, Ley 1581). | M2, M4 |
| H2 | «Hoy» se calcula con `toISOString().slice(0, 10)` (fecha en UTC) | Pasadas las 7 p. m. en Colombia, «Hoy» ya es la fecha de mañana. La fecha del servicio debe ser una **fecha civil** validada en `America/Bogota`. | M4 |
| H3 | La confirmación depende de un estado en memoria | Al recargar, se pierde. Hace falta consultar el servicio por id y una ruta con id. | M4 |
| H4 | El «cuidador en turno» es un `cuidadorAsignadoId` fijo | Debe derivarse del servicio activo en la franja actual. | M4 |
| H5 | La bolsa de horas existe solo como interfaz y no está en ADR-01 | Es el flujo de caja del negocio. Es un subdominio de Pagos, y su unidad (horas o pesos) es una decisión abierta porque las tarifas van de $18.000 a $35.000. | M7 |
| H6 | `Medicamento.tomado` es un booleano único | No distingue días. Hacen falta horarios recurrentes, una toma por día, deshacer y zona horaria. | M6 |
| H7 | La alerta siempre muestra «enviada a Andrea y a la línea de emergencia» | No hay manejo de fallos. En una función de emergencia, el estado mostrado debe ser el real. «Línea de emergencia» es hoy una simulación. | M5, M6 |
| H8 | `GraficaSignos` lee `lecturas[lecturas.length - 1]` | Si no hay lecturas, la pantalla falla. El contrato debe cubrir el estado vacío. | M6 |
| H9 | La zona se filtra por igualdad en el componente y por «contiene» en el servicio | Semánticas distintas. El backend fija una sola. | M2 |
| H10 | Las hojas de vida son PDF públicos en `public/` | Hay que separar la hoja de vida que la familia puede ver de los documentos privados de verificación. | M2, M9 |
| H11 | El chat simula presencia y «Escribiendo…» | No son requisito del MVP real. Solo se persisten y entregan mensajes. | M8 |
| H12 | Las reseñas guardan el autor como texto («Andrea G.»); `calificacion` y `serviciosCompletados` son datos fijos | Deben derivarse de servicios y calificaciones reales, y el nombre del autor se muestra abreviado. | M2, M4 |

---

## 3. Stack técnico

| Área | Elección | Motivo |
|---|---|---|
| Lenguaje | **TypeScript estricto** | Mismo lenguaje del frontend. |
| Framework | **NestJS** con **Express** (el servidor por defecto) | Módulos e inyección de dependencias encajan con puertos y adaptadores. Express es el que usan la documentación oficial y los tutoriales; a esta escala Fastify no aporta una diferencia que se note. |
| Base de datos | **PostgreSQL**, un **esquema por módulo** | Transacciones locales (E3) y fronteras visibles (E13). Extensiones `unaccent`, `pg_trgm`, `citext`. |
| Acceso a datos | **Drizzle ORM** + `drizzle-kit` | Un archivo de esquema por módulo; ningún módulo ve las tablas de otro. |
| Validación | **class-validator** + **class-transformer** con `ValidationPipe` | Lo estándar en Nest; decoradores parecidos a las anotaciones de validación de Java, y Swagger documenta los DTOs solo. La validación de negocio vive en el dominio. |
| Eventos | Despachador propio sobre la tabla **outbox** (sin `@nestjs/event-emitter`, que pierde eventos si el proceso cae) | Eventos internos sin perder avisos si el proceso cae. Ver [ADR-03](./ADR-03.md). |
| Tareas programadas | `@nestjs/schedule` + `pg_try_advisory_lock` | Un solo ejecutor aunque haya varias instancias. Sin Redis. |
| Autenticación | JWT de acceso corto + refresh rotativo, `argon2id` | Módulo Identidad propio. |
| Tiempo real | **SSE** | Alertas y mensajes son servidor → cliente; más simple que WebSockets. |
| Contrato | `@nestjs/swagger` (OpenAPI 3.1) y cliente tipado generado para el frontend; AsyncAPI 3.0 para los eventos | Una sola fuente del contrato. Ver [ADR-03](./ADR-03.md). |
| Pruebas | **Vitest** (lo genera el CLI de Nest 12), **fast-check**, Testcontainers, Supertest | Dominio sin infraestructura (E14). |
| Lint | **oxlint** con reglas que usan tipos (lo genera el CLI de Nest 12) + `tsc --noEmit` | Valor por defecto de Nest 12. |
| Módulos | **ESM** (`"type": "module"`, imports con extensión `.js`) | Valor por defecto de Nest 12. |
| Node.js | **24 LTS** (fijado en `backend/.nvmrc` y `engines`) | Última versión LTS al iniciar M0. |
| Arquitectura | **dependency-cruiser** en CI | Hace cumplir E13. |
| Observabilidad | `pino` (JSON, sin datos personales) + Sentry | E1, E2 y E11. |
| Seguridad HTTP | `helmet`, `cookie-parser`, `@nestjs/throttler`, CORS restringido | Sección 5. |
| Despliegue | Contenedor Docker en Railway, Render o Fly.io **[ABIERTA]** | Sin serverless para el backend (ADR-01 §4.6). |
| Idioma | Dominio y API en **español** | ADR-01 §4.9, regla 7. |

No agregar dependencias fuera de esta lista sin preguntar. Pasarela de pagos, canales de notificación y almacenamiento de archivos se eligen en su módulo y viven siempre detrás de un puerto.

---

## 4. Arquitectura

### 4.1 Estructura

Sigue ADR-01 §4.8; se añade `src/` (convención de Nest) y el módulo `mensajeria`.

```
backend/
├─ src/
│  ├─ main.ts, app.module.ts
│  ├─ <modulo>/                         ← identidad, directorio, reservas, pagos,
│  │  ├─ dominio/                          teleasistencia, notificaciones, mensajeria, ia
│  │  ├─ aplicacion/
│  │  │  ├─ casos-de-uso/
│  │  │  └─ puertos/{entrada,salida}/
│  │  ├─ infraestructura/
│  │  │  ├─ entrada/rest/              ← controladores, DTOs (class-validator)
│  │  │  └─ salida/{persistencia,…}/   ← esquema Drizzle del módulo, repositorios, proveedores
│  │  ├─ README.md                     ← puertos, eventos y reglas del módulo
│  │  └─ <modulo>.module.ts
│  └─ compartido/                      ← Dinero, Id, Reloj, eventos de integración, outbox, auditoría,
│                                         seguridad (guards), errores
├─ pruebas/{unitarias,integracion,api}/<modulo>/
├─ drizzle/                            ← migraciones
├─ semillas/                           ← fixtures de DESARROLLO (desde frontend/data/*.json); nunca producción
├─ docker-compose.yml, .dependency-cruiser.cjs, package.json
```

### 4.2 Reglas de dependencias (`npm run arquitectura`)

| Regla | Qué prohíbe | Escenario |
|---|---|---|
| Dependencias hacia adentro | `dominio` no importa `aplicacion`, `infraestructura`, `@nestjs/*`, `drizzle-orm` ni otro módulo. `aplicacion` no importa `infraestructura`. | E12, E14 |
| Fronteras de módulo | Un módulo solo importa de otro sus `aplicacion/puertos/entrada`. Nunca su `dominio` ni su `infraestructura`. | E13 |
| Sin ciclos | Cero dependencias circulares entre módulos. | E13 |
| Tablas propias | Cada esquema Drizzle se importa solo desde la persistencia de su módulo. Las referencias entre módulos son **IDs sin clave foránea entre esquemas**. | E13 |
| Proveedores en el borde | Pasarela, canales de notificación, almacenamiento e IA solo se importan desde `infraestructura/salida`. | E12 |
| Eventos solo por contrato | Los manejadores de eventos importan únicamente de `compartido/eventos`. | E13 |
| `exports` mínimos | El `@Module` de cada módulo exporta solo los símbolos de sus puertos de entrada. Si otro módulo intenta inyectar un repositorio ajeno, **Nest falla al arrancar**. | E13 |

### 4.3 Mapa de dependencias entre módulos

Llamadas síncronas, siempre a través de `puertos/entrada`. El grafo no tiene ciclos.

| Módulo | Llama a | Reacciona a eventos de |
|---|---|---|
| `identidad` | — | — |
| `directorio` | `identidad` | `reservas` (`ServicioCalificado`) |
| `pagos` | `directorio` (tarifa del cuidador) | `reservas` (`ServicioFinalizado`, `ServicioCancelado`) |
| `reservas` | `directorio`, `pagos`, `identidad` | `pagos` (`PagoAprobado`, `PagoRechazado`) |
| `notificaciones` | `identidad` (datos de contacto) | todos |
| `teleasistencia` | `identidad` y `reservas` (por un adaptador, sección 4.4) | `identidad` (`ConsentimientoRevocado`) |
| `mensajeria` | `reservas` (por un adaptador), `identidad` | `reservas` |

### 4.4 Cómo se comunican los módulos

1. **Llamada a un puerto de entrada**, cuando un módulo necesita una respuesta ahora (por ejemplo, reservas pide la tarifa a directorio).
2. **Evento de integración**, cuando un módulo informa que algo pasó y otros reaccionan (por ejemplo, `ServicioFinalizado`). Los contratos de los eventos viven en `compartido/eventos` para no crear ciclos entre módulos.
3. **Adaptador de política**, cuando un módulo necesita una decisión que depende de varios módulos. El módulo declara lo que necesita como puerto de salida y un adaptador en su `infraestructura` lo resuelve llamando a los demás.

Ejemplo: `teleasistencia` declara el puerto de salida `PoliticaDeAcceso.puedeVer(usuarioId, adultoMayorId)`. Su adaptador consulta `identidad` (¿familiar vinculado con consentimiento vigente?) y `reservas` (¿cuidador con servicio activo para esa persona?). Así `identidad` no depende de `reservas`, y no hay ciclo. *(Corrige la primera versión de este plan, que ponía esa regla dentro de `identidad`.)*

### 4.5 Transacciones y eventos

- Cada caso de uso que cambia estado corre en una **unidad de trabajo** (una transacción de Postgres). Pagos y estados del servicio se actualizan juntos (E3).
- El caso de uso guarda el cambio **y** el evento en `compartido.outbox` en la misma transacción. Un despachador publica el evento en proceso tras el *commit*, y un sondeo de respaldo recoge los pendientes.
- Los manejadores son **idempotentes**: el mismo evento puede llegar dos veces.
- Cada evento lleva `id`, `ocurridoEn`, `idDeCorrelacion` y versión de esquema.

---

## 5. Estándares de ingeniería

| Tema | Regla | Cómo se hace cumplir |
|---|---|---|
| **Dominio** | Agregados pequeños; invariantes en el constructor o en la fábrica; objetos de valor (`Dinero`, `FechaCivil`, `TelefonoE164`, `Correo`) en vez de primitivos; sin `Date.now()` ni `Math.random()` en el dominio: se usan los puertos `Reloj` y `GeneradorDeIds`. | Revisión de PR; pruebas con `Reloj` falso. |
| **Dinero** | Entero en pesos COP; porcentajes en puntos básicos (8 % = 800); redondeo explícito (mitad hacia arriba). Nunca `number` con decimales. | Pruebas de propiedades (fast-check). |
| **Fechas** | UTC en la base (`timestamptz`); las fechas de negocio son **fechas civiles** en `America/Bogota`. | Pruebas en el límite de medianoche. |
| **Identificadores** | UUID v7, generados por el backend. | `GeneradorDeIds`. |
| **API** | Prefijo `/api/v1`; errores `application/problem+json` en español; códigos: 400 validación, 401, 404 recurso ajeno o inexistente, 409 conflicto de estado, 422 regla de negocio, 429 límite. Paginación por cursor. `Idempotency-Key` en los POST que crean dinero o alertas. Nunca se devuelven entidades de dominio ni filas: siempre DTOs. | Pruebas de API; OpenAPI revisado en cada PR. |
| **Concurrencia** | Bloqueo optimista (columna `version`) en `Servicio` y `Pago`; índices únicos parciales para evitar dobles reservas. | Pruebas de integración con inserciones simultáneas. |
| **Datos** | Migraciones versionadas, nunca se edita una ya aplicada; cambios destructivos en dos pasos (agregar, migrar, quitar). Restricciones `CHECK`, `UNIQUE` y claves foráneas **dentro** del esquema. Sin borrado lógico para datos personales: se **anonimiza** (Ley 1581, supresión). | Revisión de migraciones; pruebas de integración. |
| **Seguridad** | Lista de verificación basada en OWASP ASVS nivel 2 y OWASP API Top 10. Breve modelo de amenazas por módulo (sección «Seguridad» de cada uno). Secretos solo en variables de entorno, validadas al arrancar. Dependabot y `npm audit` en CI. | CI y revisión de PR. |
| **Pruebas** | Pirámide: muchas unitarias del dominio (sin infraestructura), integración de adaptadores con Postgres real, pocas de API y un recorrido E2E. Pruebas de **contrato** para cada puerto con varios adaptadores. **Matriz de autorización** por endpoint. Pruebas de propiedades y, si hay tiempo, mutación (Stryker) en la función de precios y la máquina de estados. Umbrales de cobertura en CI: dominio ≥ 90 %, global ≥ 70 % (ajustables). | CI bloquea el *merge*. |
| **Observabilidad** | Logs JSON con `idDeCorrelacion` (se propaga a los eventos); sin nombres, teléfonos ni datos clínicos; Sentry; métricas de 5xx, retraso del outbox y latencia de entrega de alertas (E11). | Revisión de logs en cada módulo. |
| **Operación** | Configuración por entorno (local, staging, producción); *graceful shutdown*; `/salud` y `/salud/listo`; respaldos de la base de datos con restauración probada. | Módulos M0 y M10. |
| **Proceso** | Una rama por módulo o por segmento (`feat/backend-<modulo>`), PR pequeños (menos de ~400 líneas cambiadas cuando se pueda), Conventional Commits, revisión cruzada entre los dos desarrolladores y CI en verde para fusionar. Plantilla de PR con lista de arquitectura, seguridad, pruebas y documentación. | `CODEOWNERS` y protección de `main`. |
| **Decisiones** | Cada decisión significativa (pasarela, hosting, cifrado, canales) se registra en un ADR numerado. | Revisión en el PR. |

---

## 6. Ciclo de desarrollo de cada módulo

### 6.1 Pasos (en este orden)

1. **Preparación.** Trazabilidad pantalla → caso de uso (sección 8), borrador del contrato OpenAPI revisado con el frontend, decisiones **[ABIERTA]** del módulo resueltas.
2. **Dominio con pruebas primero.** Objetos de valor, agregados y reglas, con pruebas unitarias sin Nest ni base de datos.
3. **Aplicación.** Casos de uso y puertos, con dobles en memoria de los puertos de salida.
4. **Infraestructura.** Esquema Drizzle y migración, repositorios, pruebas de integración con Postgres real y pruebas de contrato de los puertos.
5. **Entrada REST.** DTOs con class-validator, controladores, guards, `problem+json`, pruebas de API y matriz de autorización.
6. **Eventos.** Publicación vía outbox y manejadores idempotentes.
7. **Datos de desarrollo y OpenAPI.** Fixtures de desarrollo (solo para local y staging) migrados desde el JSON; los datos de referencia que necesita producción van en migraciones. Contrato publicado.
8. **Integración con el frontend.** Cliente tipado, reimplementar el servicio correspondiente, ajustar pantallas y probar el recorrido a mano.
9. **Revisión.** `npm run arquitectura`, lista de seguridad, `EXPLAIN` de las consultas críticas, README del módulo.
10. **Cierre.** Cumplir la Definición de terminado, despliegue a staging y revisión del equipo.

### 6.2 Definición de preparado (para empezar un módulo)

- [ ] Los módulos de los que depende están terminados.
- [ ] Las pantallas y funciones del frontend que sirve están identificadas.
- [ ] Las decisiones **[ABIERTA]** del módulo tienen respuesta o una suposición escrita.
- [ ] El contrato de la API tiene borrador.

### 6.3 Definición de terminado común (todo módulo)

- [ ] `npm run lint`, `build`, `test` y `arquitectura` en verde en CI.
- [ ] Pruebas de dominio sin infraestructura; pruebas de integración con Postgres real; pruebas de API con matriz de autorización.
- [ ] Cobertura por encima de los umbrales.
- [ ] OpenAPI actualizado; README del módulo con puertos, eventos y reglas.
- [ ] Migraciones aplicadas en staging.
- [ ] El servicio del frontend correspondiente usa la API real y el JSON que reemplaza ya no se importa.
- [ ] Sin datos personales ni clínicos en logs.
- [ ] Revisión cruzada aprobada.

---

## 7. Orden de los módulos

El orden respeta las dependencias (sección 4.3) y adelanta lo que da confianza y seguridad a las familias (directorio verificado y teleasistencia) antes que el dinero real, porque la pasarela exige trámites externos (cuenta comercial, aprobación del modelo de marketplace) que conviene iniciar desde el principio.

| # | Módulo | Rigor hexagonal (ADR-01 §4.10) | Tamaño | Depende de | Qué se ve funcionando |
|---|---|---|---|---|---|
| M0 | Plataforma y compartido | n/a | M | — | API desplegada en staging con `/salud` |
| M1 | Identidad | Ligero, con más pruebas de seguridad | L | M0 | Registro, inicio de sesión, «Hola, Andrea» desde la sesión |
| M2 | Directorio (lectura) | Ligero | M | M1 | Búsqueda y perfiles reales |
| M3 | Pagos I: cotización | Completo | S | M2 | Resumen de costo calculado por el servidor |
| M4 | Reservas | Completo | L | M1, M2, M3 | Contratar, confirmación y cuidador en turno reales |
| M5 | Notificaciones | Ligero | M | M1, M4 | Avisos de estados del servicio |
| M6 | Teleasistencia | Completo | L | M1, M4, M5 | Alerta real, medicamentos y signos vitales persistentes |
| M7 | Pagos II: cobro, bolsas y liquidación | Completo | L | M4 | Pago con la pasarela (sandbox hasta producción) y bolsa de horas con saldo |
| M8 | Mensajería | Ligero | M | M4, M5 | Chat con el cuidador |
| M9 | Directorio II: registro y verificación | Ligero | M | M1, M2 | Alta de cuidadores y revisión de verificación |
| M10 | Endurecimiento y despliegue | n/a | M | todos | Producción con monitoreo y respaldos |
| M11 | IA (opcional) | Ligero | — | por definir | — |

**Reparto sugerido para dos personas** (se ajusta al conocimiento de cada uno): M0 en pareja; después, una persona toma M1 → M4 → M6 y la otra M2 → M3 → M5 → M7, e intercambian en M8 y M9. M3 y M7 empiezan a esperar la decisión de la pasarela, así que conviene abrir los trámites con proveedores durante M1.

---

## 8. Plan por módulo

### M0 — Plataforma y compartido

**Objetivo:** un esqueleto que arranca, habla con la base de datos, se prueba y se despliega a staging con integración continua. No incluye negocio.

| Aspecto | Detalle |
|---|---|
| **Entregables** | Proyecto NestJS 12 (TypeScript estricto, Express, ESM, oxlint, Prettier, Vitest); `docker-compose.yml` con Postgres; Drizzle y migraciones; validación de variables de entorno al arrancar; `/salud` y `/salud/listo`; Swagger; `pino` con `idDeCorrelacion`; `helmet`, CORS y `throttler`; formato `problem+json`; CI (instalar, lint, arquitectura, unitarias, integración, build, auditoría); despliegue automático a staging. |
| **`compartido`** | `Dinero`, `FechaCivil`, `Id` (UUID v7), puertos `Reloj` y `GeneradorDeIds`, `EventoDeDominio`, tabla y despachador de **outbox**, servicio de **auditoría**, jerarquía de errores de dominio, `UnidadDeTrabajo`, guards de seguridad (validación de token y roles; sin lógica de negocio) y utilidades de pruebas (Testcontainers, dobles). |
| **Reglas** | `.dependency-cruiser.cjs` con las reglas de la sección 4.2 y script `npm run arquitectura`. |

**Pasos**
- [ ] Crear el proyecto, scripts y configuración de calidad.
- [ ] Base de datos local, primera migración (esquema `compartido`, tablas `outbox` y `auditoria`).
- [ ] Objetos de valor y puertos base, con pruebas.
- [ ] Outbox, despachador y prueba de entrega de un evento (incluida la entrega duplicada).
- [ ] Manejo de errores, `problem+json`, correlación y logs.
- [ ] CI y despliegue a staging.
- [x] Redactar el **ADR-04** con el stack y las decisiones de este documento ([borrador](./ADR-04.md), pendiente de aceptar).

**Terminado cuando:** además de la definición común, staging responde `/salud/listo`, una violación de las reglas de arquitectura rompe la CI y el outbox entrega un evento una sola vez aunque se reprocese.

---

### M1 — Identidad

| Aspecto | Detalle |
|---|---|
| **Sirve a** | Ninguna pantalla hoy (el MVP no tenía login). Reemplaza `obtenerFamiliar` y `obtenerAdultoMayor` de `paciente.ts` y es la base de todo control de acceso. Pantallas nuevas: registro, inicio de sesión, vincular a la persona cuidada y consentimiento. |
| **Dominio** | `Usuario` (`Correo`, `TelefonoE164`, `Rol`: familiar, adulto mayor, cuidador, administrador); `Credencial` (hash argon2id, intentos fallidos, bloqueo temporal); `SesionDeRefresco` (familia de tokens, hash, rotación y detección de reutilización); `AdultoMayor` (nombre, fecha de nacimiento; la **edad se calcula** con `Reloj`); `Vinculo` (familiar ↔ adulto mayor, parentesco); `Consentimiento` (finalidad, versión del texto, otorgado y revocado en). Los datos clínicos **no** viven aquí. |
| **Reglas** | Correo único sin distinguir mayúsculas (`citext`). Sin vínculo y sin consentimiento vigente no hay acceso a datos de salud (lo aplica `teleasistencia`). Un usuario no cambia su propio rol. |
| **Casos de uso** | `RegistrarUsuario`, `IniciarSesion`, `RefrescarSesion`, `CerrarSesion`, `ObtenerPerfilPropio`, `RegistrarAdultoMayor`, `VincularFamiliar`, `OtorgarConsentimiento`, `RevocarConsentimiento`, `ExportarMisDatos`, `EliminarMiCuenta` (anonimiza). |
| **Puertos de entrada** (usados por otros módulos) | `ObtenerContacto(usuarioId)`, `ObtenerAdultoMayor(id)`, `EsFamiliarVinculado(usuarioId, adultoMayorId)`, `TieneConsentimientoVigente(adultoMayorId, finalidad)`. |
| **Puertos de salida** | `RepositorioUsuarios`, `HashDeContrasenas`, `EmisorDeTokens`, `Reloj`, `GeneradorDeIds`. |
| **API** | `POST /auth/registro`, `/auth/login`, `/auth/refresh`, `/auth/logout`; `GET /yo`; `POST /adultos-mayores`; `POST /vinculos`; `POST /consentimientos`, `DELETE /consentimientos/:id`; `GET /yo/exportar`; `DELETE /yo`. |
| **Eventos** | Publica `UsuarioRegistrado`, `VinculoCreado`, `ConsentimientoOtorgado`, `ConsentimientoRevocado`. No consume. |
| **Datos** | Esquema `identidad`: `usuarios`, `credenciales`, `sesiones_refresco`, `adultos_mayores`, `vinculos`, `consentimientos`. |
| **Seguridad** | `argon2id` con parámetros documentados; bloqueo tras intentos fallidos; mensajes de error iguales para «usuario inexistente» y «contraseña errónea» (sin enumerar usuarios); si un refresh token se reutiliza, se revoca toda la familia; cookies `httpOnly`, `Secure`, `SameSite=Lax` y verificación de `Origin`; contraseñas de al menos 10 caracteres; auditoría de inicios de sesión, fallos y cambios de consentimiento. |
| **Pruebas obligatorias** | Unitarias: reglas de bloqueo, rotación y reutilización de refresh, edad calculada con `Reloj` falso. Integración: unicidad de correo sin distinguir mayúsculas, revocación en cascada. API: registro duplicado, token vencido, rol incorrecto, refresh reutilizado revoca la familia, un usuario ajeno no ve el perfil de otro. |
| **Frontend** | Pantallas de registro, inicio de sesión, vincular persona y consentimiento. `paciente.ts` pasa a `GET /yo`. Proteger `/app/*` sin sesión; revisa la guía de Next en `node_modules/next/dist/docs/` antes de elegir el mecanismo (no asumir `middleware`). El nombre «Andrea» y «Doña Carmen» salen de la sesión. |

**Pasos**
- [ ] Dominio: `Usuario`, `Credencial` (bloqueo), `SesionDeRefresco` (rotación) y `Consentimiento`, con pruebas.
- [ ] Casos de uso y fakes; esquema y repositorios; guards de sesión.
- [ ] Endpoints, DTOs y matriz de autorización.
- [ ] Auditoría de eventos de seguridad.
- [ ] Pantallas del frontend y `paciente.ts` sobre la API.
- [ ] Decidir dominios y cookies (sección 9).

**Terminado cuando:** además de la definición común, un recorrido real (registro → inicio de sesión → vincular → consentimiento → `/app`) funciona en staging y los intentos de acceso entre usuarios distintos devuelven 404.

**Decisiones abiertas:** verificación de correo antes de usar la cuenta; **quién puede dar el consentimiento de la persona mayor** (el titular de los datos es el adulto mayor; si el familiar lo da en su nombre hay que acreditar esa representación; consultar con asesoría legal); si el adulto mayor autovalente tiene cuenta propia; autenticación en dos pasos para administradores.

---

### M2 — Directorio (lectura)

| Aspecto | Detalle |
|---|---|
| **Sirve a** | `/app/cuidadores` (`BuscadorCuidadores`, `FiltrosCuidador`, `TarjetaCuidador`), `/app/cuidadores/[id]` (`BadgesVerificacion`, `Resenas`, hoja de vida) y la consulta del cuidador al contratar. |
| **Dominio** | `Cuidador` (nombre, foto, especialidad, título, años de experiencia, tarifa por hora como `Dinero`, zona, disponibilidad, bio, `aceptacionAutomatica`); `Verificacion` con tres controles (`antecedentes`, `titulos`, `psicotecnica`), cada uno con estado y fecha; `Resena` (calificación 1–5, comentario, fecha, autor abreviado); `calificacion` y `serviciosCompletados` son **valores derivados**, no editables. |
| **Regla clave (E7)** | `Cuidador.esVisible()` es verdadero **solo si los tres controles están aprobados**. Es una regla del dominio, no un filtro suelto en la consulta. |
| **Casos de uso** | `ListarCuidadores(filtros, cursor)`, `ObtenerCuidador`, `ObtenerFiltrosDisponibles`, `RegistrarResena` (manejador de `ServicioCalificado`), `ObtenerCuidadorParaContratar` (puerto de entrada), `ObtenerContactoDeCuidador` (puerto de entrada restringido). |
| **Búsqueda** | Mismos filtros de hoy: `busqueda`, `especialidad`, `zona`, `jornada`, `tarifaMaxima`. Insensible a tildes (`unaccent`) y con coincidencia parcial (`pg_trgm`). La zona se compara de una sola forma (**H9**). Paginación por cursor (20 por defecto, 50 máximo). Orden por defecto: calificación descendente, luego tarifa y `id`. |
| **Puertos de salida** | `RepositorioCuidadores`, `AlmacenDeArchivos` (hoja de vida con URL firmada), `Reloj`. |
| **API** | `GET /cuidadores`, `GET /cuidadores/filtros` (zonas y tarifa máxima disponibles, hoy derivadas en el navegador), `GET /cuidadores/:id`, `GET /cuidadores/:id/hoja-de-vida` (redirige a una URL firmada de corta vida). |
| **Eventos** | Consume `ServicioCalificado`. Publica `CuidadorVisible` y `CuidadorOculto` cuando cambia la visibilidad. |
| **Datos** | Esquema `directorio`: `cuidadores`, `verificaciones`, `resenas`, `documentos`. Índices por `(especialidad, zona)` y `gin_trgm` sobre nombre. |
| **Seguridad** | El DTO público **no incluye teléfono ni documentos** (**H1**). Acceso solo autenticado y con límite de peticiones, para evitar el vaciado masivo del directorio **[ABIERTA]**. Un cuidador no verificado responde 404 incluso con el id exacto. La hoja de vida que ve la familia es un archivo distinto de los documentos privados de verificación (**H10**). |
| **Pruebas obligatorias** | Unitarias: `esVisible()` con las 8 combinaciones de los tres controles (solo una es verdadera; prueba de propiedades). Integración: búsqueda «jose» encuentra «José», filtros combinados, paginación estable. API: 404 para no verificado, DTO sin teléfono (prueba de instantánea), usuario no autenticado rechazado. |
| **Frontend** | `cuidadores.ts` consulta la API. `BuscadorCuidadores` pasa a filtrar en el servidor con *debounce* y conserva la sensación de filtrado instantáneo (criterio E4); las zonas y la tarifa máxima salen de `GET /cuidadores/filtros`. Quitar `telefono` del tipo `Cuidador` público; crear el tipo `CuidadorEnTurno` que sí lo lleva (M4). |

**Pasos**
- [ ] Dominio: `Cuidador`, `Verificacion`, `esVisible()` y `Resena`, con pruebas.
- [ ] Esquema, migración y fixtures de desarrollo desde `frontend/data/cuidadores.json` (nunca en producción); subir las hojas de vida de prueba al almacén.
- [ ] **Carga inicial de cuidadores reales** por un administrador (comando `npm run cuidadores:importar` sobre un archivo revisado, que crea el cuidador, su usuario con rol `cuidador` y las verificaciones ya aprobadas offline, con sus fechas de vigencia). Es la vía de alta mientras el registro autónomo (M9) no exista.
- [ ] Consulta con `unaccent`, `pg_trgm` y paginación por cursor; revisar con `EXPLAIN`.
- [ ] Endpoints, DTOs públicos y pruebas de API.
- [ ] Frontend: `cuidadores.ts` y buscador.

**Terminado cuando:** además de la definición común, el recorrido búsqueda → perfil funciona contra la API (máximo 2 toques, E4), no hay teléfonos en la respuesta y `esVisible()` está cubierta por pruebas de propiedades.

**Decidido (2026-10-26):** el directorio **exige sesión** (solo usuarios con cuenta ven a los cuidadores), con límite de peticiones. Por eso la landing pública no lista cuidadores: muestra solo la propuesta de valor y lleva a registrarse.

**Decisiones abiertas:** criterio de orden por defecto (el MVP destacaba primero al cuidador de $20.000/hora solo por el ejemplo del pitch; en la aplicación real, un criterio neutro como la calificación).

---

### M3 — Pagos I: cotización y política de precios

| Aspecto | Detalle |
|---|---|
| **Sirve a** | `ResumenCosto` y `lib/pricing.ts` (cargo de servicio del 8 %). Prepara el motor de costos que usan Reservas (M4) y Pagos II (M7). |
| **Dominio** | `Dinero` (entero COP); `PoliticaDePrecios` versionada (`comisionFamiliaBps` = 800, `comisionProfesionalBps` = 1000); función pura `calcularServicio(tarifa, horas, politica)` que devuelve `subtotal`, `cargoFamilia`, `totalFamilia`, `pagoProfesional` e `ingresoPlataforma`. |
| **Invariantes** | `totalFamilia = subtotal + cargoFamilia`; `ingresoPlataforma = totalFamilia − pagoProfesional ≥ 0`; aritmética entera con redondeo mitad hacia arriba, sin decimales. |
| **Casos de uso** | `CotizarServicio(cuidadorId, horas)` (puerto de entrada: consulta la tarifa a `directorio`, nunca la recibe del cliente) y `ObtenerPoliticaVigente`. |
| **API** | `POST /pagos/cotizaciones` con `{ cuidadorId, horas }`. La respuesta a un familiar trae subtotal, cargo (con su porcentaje) y total; **nunca** el pago al profesional. |
| **Datos** | Esquema `pagos`: `politicas_de_precios` (versión, comisiones, vigente desde). Cada servicio guardará la versión de política con la que se cotizó (M4). |
| **Pruebas obligatorias** | Vectores fijos: `(20000, 1)` → total 21 600, pago al profesional 18 000, ingreso 3 600. Tabla de tarifas de $18.000 a $35.000 por 1 a 8 horas. Pruebas de propiedades: invariantes, nunca negativo, monótono en horas. **El mismo archivo de vectores lo usa el frontend** para que `pricing.ts` y el backend no diverjan. |
| **Frontend** | `ResumenCosto` puede seguir calculando en local para la vista previa instantánea, pero el monto de la confirmación viene del servidor. Compartir el archivo de vectores en las pruebas de ambos lados. |

**Pasos**
- [ ] `Dinero` en puntos básicos y `calcularServicio` con pruebas de vectores y propiedades.
- [ ] `PoliticaDePrecios` y su tabla; versión 1 (8 % y 10 %) como **dato de referencia en una migración**, porque producción la necesita.
- [ ] `CotizarServicio` con el puerto de directorio y `POST /pagos/cotizaciones`.
- [ ] Frontend: confirmar que la vista previa y el servidor coinciden.

**Terminado cuando:** además de la definición común, el caso `(20000, 1)` da 21 600 en backend y frontend con los mismos vectores y la API no filtra el pago al profesional.

---

### M4 — Reservas

| Aspecto | Detalle |
|---|---|
| **Sirve a** | `/app/contratar/[id]` (`FormularioContratacion`, `SelectorHoras`), `/app/contratar/confirmacion`, `CuidadorEnTurno`. Reemplaza `confirmarContratacion` y `obtenerCuidadorEnTurno`. |
| **Dominio** | `Servicio` (familiar, adulto mayor, cuidador, `FechaCivil`, `Jornada`, `Horas` de 1 a 8, estado, desglose de costo y versión de política, medio de pago, `version`); `Calificacion`. La regla de 1 a 8 horas hoy vive solo en `selector-horas.tsx`: pasa al dominio. |
| **Máquina de estados (E9)** | `transicionar(estado, accion, actor, contexto)` es una función pura. Ver tabla abajo. |
| **Reglas de creación** | Fecha no anterior a hoy en `America/Bogota`; si es hoy, la franja no puede haber terminado (**H2**). El cuidador es visible y la jornada está en su disponibilidad. El familiar está vinculado a la persona y hay consentimiento vigente. **Un cuidador no puede tener dos servicios activos en la misma fecha y jornada**: índice único parcial sobre `(cuidador_id, fecha, jornada)` para los estados `Solicitado`, `Aceptado` y `EnCurso`. |
| **Cuidador en turno** | Es el cuidador de un servicio `Aceptado` o `EnCurso` cuya fecha y franja contienen el momento actual (**H4**). Las horas de cada franja son configuración **[ABIERTA]**. |
| **Casos de uso** | `SolicitarServicio`, `AceptarServicio`, `RechazarServicio`, `IniciarServicio`, `FinalizarServicio`, `CancelarServicio`, `CalificarServicio`, `ListarMisServicios`, `ObtenerServicio`, `ObtenerCuidadorEnTurno`. |
| **Puertos** | Entrada: `ObtenerServicio`, `CuidadorTieneServicioActivo(cuidadorId, adultoMayorId)`, `ParticipantesDelServicio`. Salida: `RepositorioServicios`, `Directorio.ObtenerCuidadorParaContratar`, `Pagos.CotizarServicio`, `Identidad.EsFamiliarVinculado` y `TieneConsentimientoVigente`, `Reloj`. |
| **API** | `POST /servicios`; `GET /servicios`, `GET /servicios/:id`; `POST /servicios/:id/aceptar`, `/rechazar`, `/iniciar`, `/finalizar`, `/cancelar`; `POST /servicios/:id/calificacion`; `GET /adultos-mayores/:id/cuidador-en-turno` (incluye teléfono, solo para la familia con servicio activo). |
| **Eventos** | Publica `ServicioSolicitado`, `ServicioConfirmado` (al pasar a `Aceptado`, nombre del diagrama), `ServicioIniciado`, `ServicioFinalizado`, `ServicioCancelado`, `ServicioCalificado`. Consume `PagoAprobado` y `PagoRechazado` (desde M7). |
| **Datos** | Esquema `reservas`: `servicios` (con `version` y desglose), `calificaciones`. |
| **Seguridad** | Cada acción verifica quién es el actor y su relación con el servicio; un servicio ajeno responde 404. El **monto lo calcula el servidor**: el cliente nunca lo envía. `Idempotency-Key` en `POST /servicios` para que un reintento no cree dos servicios. |
| **Pruebas obligatorias** | Unitarias: **todas** las transiciones, válidas e inválidas, y que cada válida emite su evento; prueba de propiedades sobre secuencias de acciones. Integración: dos solicitudes simultáneas para el mismo cuidador y franja (una falla con 409), bloqueo optimista. API: matriz de autorización por acción; fecha «hoy» a las 8 p. m. hora de Colombia. |
| **Frontend** | `contratacion.ts` llama a `POST /servicios`. La confirmación pasa a una ruta con id y lee el servicio de la API (**H3**); `ContratacionProvider` deja de ser necesario. La fecha se envía como fecha civil local, sin `toISOString()`. Mensajes claros para 409 («Marta ya tiene un servicio en esa franja»). `CuidadorEnTurno` usa el endpoint nuevo y el tipo con teléfono (**H1**, **H4**). **Vista mínima del cuidador (nueva, en F4):** en una aplicación real, un cuidador de verdad debe poder aceptar o rechazar la solicitud, marcar que inició y que terminó. Se agrega `/cuidador` con «Mis servicios» (solicitudes pendientes, agenda y acciones), con inicio de sesión del cuidador (rol `cuidador`, M1). |

**Transiciones del servicio**

| Desde | Acción | Quién | Hacia | Condición |
|---|---|---|---|---|
| (nuevo) | solicitar | familiar | `Solicitado` | Reglas de creación. Por defecto el cuidador debe aceptar. Solo si el **propio cuidador** activó `aceptacionAutomatica` en su perfil, pasa de inmediato a `Aceptado`. |
| `Solicitado` | aceptar | cuidador asignado | `Aceptado` | Sigue verificado y libre en esa franja. |
| `Solicitado` | rechazar | cuidador asignado | `Cancelado` | — |
| `Solicitado` | expirar | sistema (tarea programada) | `Cancelado` | Venció `solicitudExpiraEn` sin respuesta del cuidador; motivo «expirada» y aviso a la familia para que elija a otro. |
| `Solicitado`, `Aceptado` | cancelar | familiar | `Cancelado` | Reembolso según política **[ABIERTA]**. |
| `Aceptado` | iniciar | cuidador (o automático al iniciar la franja) | `EnCurso` | Pago aprobado cuando M7 lo exija (bandera `REQUIERE_PAGO_APROBADO`). |
| `EnCurso` | finalizar | cuidador | `Finalizado` | Habilita la calificación. |

Cualquier otra transición lanza un error de dominio (HTTP 409).

**Pasos**
- [ ] Dominio: `FechaCivil`, `Horas`, `Servicio`, máquina de estados y reglas de creación, con pruebas primero.
- [ ] Casos de uso con dobles de directorio, pagos e identidad.
- [ ] Esquema, índice único parcial y prueba de concurrencia.
- [ ] Endpoints y matriz de autorización; eventos vía outbox.
- [ ] Frontend: contratación, confirmación con id y cuidador en turno.

**Terminado cuando:** además de la definición común, se contrata de principio a fin contra la API real, dos solicitudes simultáneas no generan doble reserva y la confirmación sobrevive a recargar la página.

**Decidido (2026-10-26):**
- **Plazo de aceptación:** el cuidador tiene **2 horas** para aceptar, o **30 minutos** si el servicio es para hoy; vencido el plazo, la solicitud se cancela con motivo «expirada» y se avisa a la familia.
- **Franjas:** mañana 06:00–12:00, tarde 12:00–18:00, noche 18:00–06:00 (cruza la medianoche).
- **Cobro:** al aceptar el cuidador. El servicio no puede iniciar sin pago aprobado (bandera `REQUIERE_PAGO_APROBADO`, activa desde M7).

**Decisiones abiertas:** cómo pasa un servicio a `EnCurso` (check-in del cuidador o automático); política de cancelación y reembolso; si la confirmación debe decir «Solicitud enviada» o «Contratación confirmada» según el caso.

---

### M5 — Notificaciones

| Aspecto | Detalle |
|---|---|
| **Sirve a** | El texto del `BotonAlerta` («Se notificará a Andrea…»), los avisos de cada estado del servicio (E9) y la alerta de teleasistencia (E11). Hoy no hay interfaz propia. |
| **Dominio** | `Notificacion` (destinatario, tipo, prioridad, canal, estado: pendiente, enviada, entregada, fallida; intentos; `claveDeDeduplicacion`; `entregadaEn`); `Plantilla` en español (Colombia), con parámetros. |
| **Casos de uso** | Un manejador por evento (`AlCrearseServicio`, `AlGenerarseAlerta`, `AlOmitirseMedicamento`…), `EntregarNotificacion`, `ReintentarFallidas`, `ListarMisNotificaciones` (opcional, para una campana en la interfaz). |
| **Puertos de salida** | `CanalDeNotificacion` con adaptadores intercambiables: correo, SMS y WhatsApp **[ABIERTA]** (al menos un canal confiable para las alertas), más un adaptador **Simulado** que guarda y registra, **solo para desarrollo y pruebas** (en producción la aplicación no arranca con él configurado); `RepositorioNotificaciones`; `Reloj`. Entrada: solo los eventos. |
| **Reglas** | Alertas de teleasistencia con **prioridad alta**: se envían por todos los canales disponibles **en paralelo** hasta confirmar al menos una entrega. Clave de deduplicación `(eventoId, destinatarioId, tipo)`, así reprocesar un evento no repite el aviso. Reintentos con espera creciente y tope; los agotados van a una tabla de fallidas y avisan al equipo (Sentry). |
| **Eventos** | Consume `ServicioSolicitado/Confirmado/Iniciado/Finalizado/Cancelado`, `PagoAprobado`, `AlertaGenerada`, `MedicamentoOmitido`, `LecturaFueraDeRango`, `CuidadorVisible`. Publica `NotificacionEntregada` (para medir E11). |
| **Datos** | Esquema `notificaciones`: `notificaciones`, `intentos`, `fallidas`. |
| **Seguridad** | **Minimización:** el contenido de SMS, correo y WhatsApp **no lleva datos clínicos** («Alerta de Doña Carmen: abre Seniory»), porque esos canales no son confiables para datos de salud (Ley 1581). Límite de envíos por destinatario. Plantillas sin HTML libre. |
| **Pruebas obligatorias** | Evento duplicado produce una sola notificación; reintentos y agotamiento con `Reloj` falso; envío en paralelo de la prioridad alta; medición de `entregadaEn − generadaEn` con el canal simulado en pruebas (E11) y, antes de lanzar, con el canal real en staging; si ningún canal confirma la entrega, la alerta queda marcada «sin entregar» y avisa al equipo. |
| **Frontend** | Sin cambios obligatorios. Opcional: campana con `GET /notificaciones`. Web Push exige *service worker* y queda para más adelante. |

**Pasos**
- [ ] Dominio y plantillas; adaptador `Simulado` (solo desarrollo y pruebas) y verificación de arranque que lo prohíbe en producción.
- [ ] Manejadores de eventos de Reservas (primero) y consumo del outbox.
- [ ] Reintentos, tabla de fallidas y deduplicación.
- [ ] Elegir y agregar un canal real **[ABIERTA]**.

**Terminado cuando:** además de la definición común, cada cambio de estado del servicio genera su aviso a ambas partes y reprocesar eventos no duplica avisos.

**Decisiones abiertas:** canales reales (correo, SMS, WhatsApp Business exige plantillas aprobadas por Meta); costo por mensaje; horario silencioso (las alertas lo ignoran).

---

### M6 — Teleasistencia

| Aspecto | Detalle |
|---|---|
| **Sirve a** | Inicio (`app/app/page.tsx`), `/app/teleasistencia` (`BotonAlerta`, `ListaMedicamentos`, `GraficaSignos`), el punto de la barra inferior y el comando de voz (`?alerta=1`). |
| **Dominio** | `Medicamento` (nombre, dosis, horarios `HH:mm`, días, vigencia); `Toma` (medicamento, fecha civil, hora programada, estado: pendiente, tomada u omitida, quién y cuándo la registró); `LecturaDeSignos` (presión sistólica y diastólica, frecuencia cardiaca, glucosa, momento, quién la registró, fuente); `RangosDeReferencia`; `Alerta` (origen: botón o voz, estado: generada, notificada o atendida, destinatarios, clave de idempotencia). |
| **Reglas** | Marcar o desmarcar una toma solo el día que corresponde; deshacer queda en auditoría (**H6**). Una toma pasa a `omitida` tras una tolerancia configurable **[ABIERTA]**, y emite `MedicamentoOmitido`. Una lectura fuera de rango emite `LecturaFueraDeRango`. Las lecturas se validan por rangos plausibles. **Los umbrales clínicos los define un profesional de salud**, no el equipo de desarrollo **[ABIERTA]**. |
| **Casos de uso** | `GenerarAlerta`, `AtenderAlerta`, `ListarMedicamentos`, `MarcarTomaRealizada`, `DesmarcarToma`, `RegistrarLecturaDeSignos`, `ListarSignosVitales(dias)`, `ObtenerResumenDeEstado` (alimenta Inicio y la barra inferior con una sola consulta, en vez de una por página). |
| **Puertos de salida** | `PoliticaDeAcceso` (adaptador sobre `identidad` y `reservas`, sección 4.4), repositorios, `Reloj`, `Auditoria`. **No hay puerto ni adaptador de «línea de emergencia»**: la alerta se envía a los familiares vinculados y al cuidador en turno. Una integración con un servicio de emergencias solo se agrega con un convenio real y su propio ADR (**H7**). |
| **API** | `GET /adultos-mayores/:id/resumen`; `GET /adultos-mayores/:id/medicamentos`, `PATCH /medicamentos/:id/tomas/:tomaId`; `GET /adultos-mayores/:id/signos-vitales?dias=7` (y `/ultima`; devuelve lista vacía, **H8**); `POST /adultos-mayores/:id/signos-vitales`; `POST /adultos-mayores/:id/alertas` (con `Idempotency-Key`), `PATCH /alertas/:id/atendida`; `GET /adultos-mayores/:id/eventos` (SSE). |
| **Alcance (aviso legal)** | Teleasistencia es una herramienta de **aviso a la familia y al cuidador**, no un servicio de emergencias médicas ni un dispositivo médico. Los textos de la aplicación y los términos y condiciones lo dicen con claridad, y la pantalla de la alerta indica siempre a quién se avisó y ofrece llamar al 123. Revisar el texto con asesoría legal antes de lanzar. |
| **Eventos** | Publica `AlertaGenerada` (con los destinatarios ya resueltos), `AlertaAtendida`, `MedicamentoOmitido`, `LecturaFueraDeRango`. Consume `ConsentimientoRevocado` para cerrar accesos. |
| **Datos** | Esquema `teleasistencia`: `medicamentos`, `tomas`, `lecturas_signos`, `alertas`, `rangos_de_referencia`. Índice único `(medicamento_id, fecha, hora)` en `tomas`; índice `(adulto_mayor_id, momento)` en lecturas. |
| **Seguridad (E6)** | **Todo caso de uso empieza consultando `PoliticaDeAcceso`.** El cuidador solo accede mientras tiene un servicio activo. Un acceso denegado responde 404 y se audita en menos de 1 s. Revocar el consentimiento corta el acceso de inmediato. Sin datos clínicos en logs ni en notificaciones. Cifrado de campos clínicos **[ABIERTA]**; retención de lecturas y supresión **[ABIERTA]**. |
| **Pruebas obligatorias** | Matriz de acceso: familiar vinculado con y sin consentimiento, familiar ajeno, cuidador con servicio activo, finalizado y de otra persona. Límite de día en `America/Bogota` (toma de las 11:30 p. m. y medianoche). Alerta con la misma clave de idempotencia dos veces crea una sola. Deshacer toma y su auditoría. SSE: autenticación y reconexión. Tiempo de entrega de la alerta (E11). |
| **Frontend** | `teleasistencia.ts` y las funciones de `paciente.ts` sobre la API. `BotonAlerta` envía la alerta **al terminar la cuenta regresiva** con una clave de idempotencia y muestra el **estado real**: enviando, enviada o error con reintento y la opción de llamar al 123 (**H7**). `ListaMedicamentos` actualiza de forma optimista y revierte si falla; la alarma sonora sigue en el cliente, pero con la hora programada del servidor. `GraficaSignos` maneja el estado vacío (**H8**). Inicio y `AppShellLayout` usan `GET .../resumen`. |

**Pasos**
- [ ] Dominio: planes de medicación y tomas, rangos y evaluación de lecturas, alerta con idempotencia, con pruebas primero.
- [ ] `PoliticaDeAcceso` y su adaptador; matriz de acceso.
- [ ] Esquema, repositorios y generación de tomas del día.
- [ ] Tarea programada de omisión (con `pg_try_advisory_lock`).
- [ ] Endpoints, SSE y eventos.
- [ ] Frontend: alerta, medicamentos, signos vitales y resumen.

**Terminado cuando:** además de la definición común, la alerta llega a la familia y al cuidador en menos de 30 s en el 95 % de las pruebas (E11), la matriz de acceso pasa completa (E6) y los medicamentos tomados sobreviven a recargar.

---

### M7 — Pagos II: cobro, bolsas y liquidación

| Aspecto | Detalle |
|---|---|
| **Sirve a** | El interruptor «Usar bolsa de horas» y su saldo (hoy `SALDO_BOLSA_DEMO_HORAS`), la landing de bolsas, el pago al confirmar y el cargo de servicio (**H5**). |
| **Dominio** | `Pago` (pendiente → aprobado, rechazado o expirado; aprobado → reembolsado; llave de idempotencia, referencia de la pasarela, monto); `CatalogoDeBolsas` (10, 20 y 40 horas con 500, 800 y 1200 puntos básicos de descuento); `BolsaDeHoras` con un **libro de movimientos** de solo agregado (compra, reserva, consumo, liberación, ajuste) del que se deriva el saldo; `Liquidacion` (cuidador, servicio, monto igual al pago al profesional). |
| **Reglas (E3)** | Llave de idempotencia única por pagador: dos envíos con la misma llave crean un solo `Pago`. Cada notificación de la pasarela se procesa una sola vez por su id de evento. Se verifican monto, moneda y referencia; Pagos **recalcula** el desglose y lo compara con el que envía Reservas. Los estados solo avanzan: un aviso tardío no devuelve un pago aprobado a pendiente. El saldo de una bolsa nunca es negativo. |
| **Flujo con Reservas** | Reservas orquesta el cobro: al aceptar el servicio llama a `Pagos.IniciarCobro` (o a `ReservarSaldo` si el medio es bolsa). Pagos responde con una referencia de pago y publica `PagoAprobado`. Al finalizar (`ServicioFinalizado`) se consume la reserva y se liquida al cuidador; al cancelar (`ServicioCancelado`) se libera o se reembolsa. Pagos no conoce las tablas de Reservas. |
| **Casos de uso** | `IniciarCobro`, `ProcesarNotificacionDePasarela`, `ConciliarPagos` (diario), `ComprarBolsa`, `ObtenerSaldoDeBolsa`, `ReservarSaldo`, `ConsumirReserva`, `LiberarReserva`, `LiquidarAlCuidador`, `ReembolsarPago`, `ListarMisPagos`, `ObtenerCatalogoDeBolsas`. |
| **Puertos de salida** | `PasarelaDePagos` (crear cobro, consultar estado, reembolsar, verificar firma), `DispersorDePagos` (pago al cuidador, **[ABIERTA]**), repositorios, `Reloj`. Adaptadores: el de la **pasarela elegida** (sandbox en desarrollo y staging; credenciales reales y cuenta comercial aprobada en producción) y un **Simulado** solo para pruebas, que la aplicación rechaza al arrancar en producción. |
| **API** | `GET /catalogo/bolsas` (público), `GET /bolsa` (saldo y movimientos), `POST /bolsa/compras` (con `Idempotency-Key`), `GET /pagos`, `POST /pagos/webhook/:proveedor` (público, con firma). El cobro de un servicio lo inicia Reservas. |
| **Eventos** | Publica `PagoAprobado`, `PagoRechazado`, `PagoReembolsado`, `BolsaComprada`, `LiquidacionRealizada`. Consume `ServicioFinalizado` y `ServicioCancelado`. |
| **Datos** | Esquema `pagos`: `pagos`, `eventos_de_pasarela` (únicos por id externo), `bolsas`, `movimientos_de_bolsa`, `liquidaciones`, `conciliaciones`. |
| **Seguridad** | **Nunca se tocan datos de tarjeta:** el cobro usa una pantalla o widget de la pasarela, así el alcance PCI es mínimo. Firma del webhook con comparación de tiempo constante. El monto sale siempre del servidor. Sin datos de pago en logs. Reembolsos con rol y auditoría. |
| **Pruebas obligatorias** | Doble envío con la misma llave; webhook repetido y fuera de orden; monto manipulado; caída de la conexión tras el cobro (la conciliación recupera el estado); invariantes del libro de la bolsa con pruebas de propiedades; **pruebas de contrato** que corren igual contra el adaptador simulado y el de sandbox (E12). |
| **Frontend** | `FormularioContratacion` lee el saldo real de `GET /bolsa` y añade el paso de pago; nueva pantalla para comprar bolsas; la landing toma el catálogo de la API (o se valida contra él) para que no diverjan los precios. |

**Pasos**
- [ ] Dominio de `Pago` y de la bolsa con su libro; pruebas de propiedades.
- [ ] Puerto de la pasarela y adaptador simulado (solo pruebas); luego el adaptador de la pasarela real contra su sandbox.
- [ ] Webhook con firma, deduplicación y conciliación.
- [ ] Reacciones a eventos de Reservas (reservar, consumir, liberar, liquidar).
- [ ] Activar `REQUIERE_PAGO_APROBADO` en Reservas.
- [ ] Frontend: pago, saldo y compra de bolsas.

**Terminado cuando:** además de la definición común, hay 0 cobros duplicados en las pruebas de E3, la conciliación cruza pasarela y registro interno, y un servicio no puede iniciar sin pago aprobado.

**Decisiones abiertas:** pasarela (Wompi, ePayco o Mercado Pago; verificar que soporte un marketplace con dispersión al cuidador); **si la bolsa es de horas o de saldo en pesos** (las tarifas van de $18.000 a $35.000 por hora, así que una hora de bolsa no vale lo mismo con todos los cuidadores; recomendado: crédito en pesos mostrado también como horas equivalentes); política de reembolso; facturación electrónica (DIAN) del cargo de servicio.

---

### M8 — Mensajería

| Aspecto | Detalle |
|---|---|
| **Sirve a** | `/app/mensajes/[id]` (`ChatMensajes`), que hoy es una simulación con respuestas automáticas. Se llega desde `CuidadorEnTurno` («Escribir»). |
| **Dominio** | `Conversacion` (familiar ↔ cuidador); `Mensaje` (autor, texto de 1 a 1000 caracteres sin contar espacios sobrantes, momento, `idDeCliente` para evitar duplicados). |
| **Reglas** | Solo escriben las dos partes de un servicio no cancelado. La conversación se crea al primer envío (obtener o crear). Después de finalizar el servicio sigue siendo legible durante un plazo **[ABIERTA]**. Presencia y «Escribiendo…» **no** se implementan (**H11**). |
| **Casos de uso** | `ObtenerOCrearConversacion(cuidadorId)`, `ListarMensajes(cursor)`, `EnviarMensaje`, `ListarMisConversaciones`. |
| **Puertos de salida** | `ParticipantesDelServicio` (adaptador sobre `reservas`), `RepositorioMensajes`, `Reloj`. |
| **API** | `POST /conversaciones` con `{ cuidadorId }` (obtiene o crea), `GET /conversaciones`, `GET /conversaciones/:id/mensajes?antes=cursor`, `POST /conversaciones/:id/mensajes`, `GET /mensajeria/eventos` (SSE con `Last-Event-ID`). |
| **Eventos** | Publica `MensajeEnviado` (Notificaciones decide si avisa, agrupando). Consume `ServicioCancelado`. |
| **Datos** | Esquema `mensajeria`: `conversaciones`, `mensajes`. Índice `(conversacion_id, momento)`. |
| **Seguridad** | Solo los participantes leen o escriben; conversación ajena responde 404. Límite de mensajes por minuto. Texto tratado como texto plano al mostrarlo. Los mensajes no se mezclan con datos clínicos. |
| **Pruebas obligatorias** | Un tercero no lee ni escribe; reenvío con el mismo `idDeCliente` no duplica; paginación por cursor; SSE con reconexión sin perder mensajes. |
| **Frontend** | `mensajeria.ts` sobre la API. Quitar las respuestas automáticas y los indicadores simulados de `ChatMensajes`; usar SSE para mensajes nuevos. La ruta sigue recibiendo el id del cuidador. |

**Pasos**
- [ ] Dominio y reglas con pruebas; adaptador de participantes.
- [ ] Esquema, endpoints y SSE.
- [ ] Notificación agrupada de mensajes nuevos (en M5).
- [ ] Frontend: `ChatMensajes` con datos reales.

**Terminado cuando:** además de la definición común, dos usuarios reales conversan en staging y un usuario ajeno recibe 404.

---

### M9 — Directorio II: registro y verificación (lado de la oferta)

| Aspecto | Detalle |
|---|---|
| **Sirve a** | El perfil actual solo lee cuidadores ya verificados; este módulo permite que **lleguen a serlo** (E7 completo). Hoy el MVP dejó el registro de cuidadores fuera de alcance. |
| **Dominio** | Se amplía `Cuidador` con el proceso de alta; `Verificacion` por control (pendiente, aprobada o rechazada; fecha, revisor, motivo) y **vigencia** (los antecedentes caducan: al vencer, el perfil deja de ser visible); `Documento` con tipo y estado. Se separa la **hoja de vida visible a las familias** (el cuidador la sube y un revisor la aprueba) de los **documentos privados** (cédula, antecedentes, títulos). |
| **Casos de uso** | `RegistrarCuidador` (crea el usuario con rol cuidador en `identidad`), `ActualizarPerfil`, `SubirDocumento`, `SolicitarRevision`, `RevisarVerificacion` (administrador), `RenovarVerificacion`, `OcultarPorVencimiento` (tarea programada). |
| **Puertos de salida** | `AlmacenDeArchivos` (bucket privado, URLs firmadas de corta vida), `AnalizadorDeArchivos` (antivirus, **[ABIERTA]**), `Identidad.RegistrarUsuario`. |
| **API** | `POST /cuidadores`, `PATCH /cuidadores/yo`, `POST /cuidadores/yo/documentos`, `POST /cuidadores/yo/revision`; administrador: `GET /verificaciones?estado=`, `PATCH /verificaciones/:id`. |
| **Eventos** | Publica `CuidadorVerificado`, `VerificacionRechazada`, `VerificacionVencida`, `CuidadorVisible`, `CuidadorOculto`. |
| **Seguridad** | Validación de tipo, tamaño y contenido de archivos; nombres generados por el servidor; quitar metadatos; los documentos privados solo los ve el propio cuidador y el revisor; acciones del administrador auditadas; autenticación en dos pasos para administradores **[ABIERTA]**. |
| **Pruebas obligatorias** | Un cuidador con cualquier control sin aprobar no aparece ni se puede contratar (E7); al vencer una verificación el perfil se oculta y los servicios futuros se revisan; un archivo mal formado se rechaza; acceso a documentos ajenos responde 404. |
| **Frontend** | Pantallas mínimas: registro del cuidador, carga de documentos y panel de revisión para el administrador. |

**Terminado cuando:** además de la definición común, un cuidador nuevo pasa de registro a visible en el directorio solo tras aprobarse los tres controles.

**Decisiones abiertas:** quién revisa y en cuánto tiempo (proceso manual); vigencia de cada control; si las verificaciones se automatizan con proveedores externos más adelante.

---

### M10 — Endurecimiento y despliegue a producción

| Aspecto | Detalle |
|---|---|
| **Entregables** | Entorno de producción con secretos fuera del repositorio; **un rol de base de datos por módulo** con permisos solo sobre su esquema (refuerza E13 a nivel de la base); respaldos automáticos y **restauración probada**; monitor de disponibilidad y alertas (E2); tableros de errores 5xx, retraso del outbox y latencia de alertas; revisión de seguridad frente a OWASP ASVS 2 y API Top 10; revisión de cumplimiento de la Ley 1581 (política de tratamiento, exportar y suprimir datos, región de hospedaje); prueba de carga ligera (búsqueda de cuidadores y alertas) y revisión de índices; plan de reversión de despliegues. |
| **Arranque seguro** | En producción la aplicación **no inicia** si hay un adaptador simulado (pasarela, notificaciones), si falta un secreto o si las migraciones incluyen datos de prueba; la CI lo verifica. |
| **Terminado cuando** | Producción con URL estable, restauración de respaldo ensayada, alertas de monitoreo activas, lista de seguridad firmada por ambos desarrolladores y **todos los requisitos de la sección 12 cumplidos**. |

---

### M11 — IA (opcional)

Solo el puerto `ProveedorDeIA` y su adaptador, detrás de una frontera clara (ADR-01 §4.5). **No se implementa** hasta definir el alcance con el equipo y registrar un ADR propio; nada del dominio puede depender del proveedor.

---

## 9. Integración con el frontend (transversal)

1. **Cliente tipado.** Se genera desde el OpenAPI del backend en `frontend/lib/api/`; las firmas de `lib/services/*` se mantienen.
2. **Un módulo a la vez.** Al terminar cada módulo se reimplementa su servicio y se borra del código el JSON que reemplaza. Los demás servicios siguen leyendo `data/` hasta su turno.
3. **Sesión.** Las funciones que hoy no reciben argumentos (`obtenerFamiliar`, `obtenerAdultoMayor`…) pasan a resolver al usuario desde la sesión.
4. **Dominios y cookies [ABIERTA].** Recomendado: subdominios del mismo sitio (`app.seniory.co`, `api.seniory.co`), para que las cookies `SameSite=Lax` funcionen y el SSE se conecte directo a la API. Alternativa antes de tener dominio: reescrituras de Next hacia el backend (las conexiones SSE largas por ese proxy pueden cortarse). CORS permite solo el dominio de producción y el de staging, sin comodines para las vistas previas de Vercel.
5. **Errores.** Los servicios traducen `problem+json` a mensajes claros en español (E1).
6. **Fechas.** Toda fecha de negocio viaja como fecha civil `YYYY-MM-DD` en hora de Colombia (**H2**).
7. **Rutas y datos de Next.** Antes de cambiar cómo se obtienen datos, se maneja la sesión o se cachea, leer la guía de `node_modules/next/dist/docs/` (indicado en `frontend/AGENTS.md`): esta versión tiene cambios incompatibles.
8. **Contrato compartido.** Si se prefiere compartir tipos como paquete en vez de generar el cliente, hay que introducir workspaces y revisar ADR-02 **[ABIERTA]**.

---

## 10. Decisiones abiertas, brechas con los ADR y riesgos

### 10.1 Decisiones abiertas

| # | Decisión | Módulo | Recomendación |
|---|---|---|---|
| 1 | Pasarela de pagos y dispersión al cuidador | M7 | Verificar primero cuál aprueba un marketplace; abrir el trámite durante M1. |
| 2 | Bolsa en horas o en pesos | M7 | Crédito en pesos, mostrado también como horas equivalentes. |
| 3 | ~~Momento del cobro~~ y política de reembolso | M4, M7 | **Cobro: resuelto (2026-10-26), al aceptar el cuidador.** Sigue abierta la política de cancelación y reembolso, a definir con el equipo empresarial. |
| 4 | ~~Plazo para que el cuidador acepte y qué pasa al vencer~~ | M4 | **Resuelto (2026-10-26).** Aceptación manual por defecto con una vista mínima del cuidador (en F4); expira en 2 horas (30 minutos si es para hoy) y se avisa a la familia. La aceptación automática solo si el propio cuidador la activa. |
| 5 | Quién consiente por el adulto mayor | M1 | Asesoría legal antes de lanzar. |
| 6 | Umbrales clínicos y tolerancia de medicamentos | M6 | Los define un profesional de salud. |
| 7 | Línea de emergencia | M6 | No existe en el sistema: la alerta avisa a familiares y cuidador, y la interfaz no promete un despacho. Solo se integra con un convenio real y su propio ADR. |
| 8 | Canales de notificación reales | M5 | Al menos uno confiable para alertas (SMS o WhatsApp) además de la app. |
| 9 | Cifrado de campos clínicos y retención | M6, M10 | Cifrado desde M6; retención definida con asesoría legal. |
| 10 | Hosting y región | M10 | Considerar transferencia internacional de datos (Ley 1581). |
| 11 | Dominios y cookies | M1 | Subdominios del mismo sitio. |
| 12 | ~~Directorio público o con sesión~~ | M2 | **Resuelto (2026-10-26):** con sesión y límite de peticiones. |
| 13 | Quién verifica a los cuidadores y cada cuánto vence | M9 | Proceso manual con administrador. |

### 10.2 Brechas con los ADR actuales

- **Datos de salud.** El diagrama y el escenario E6 de ADR-01 los ubican en Identidad, pero medicamentos y signos vitales son de Teleasistencia. Decisión del 2026-10-22: **viven en Teleasistencia**; Identidad guarda vínculos y consentimientos. Hay que corregir el diagrama y registrarlo en el ADR-04.
- **ADR-01 no lista `mensajeria` como módulo** aunque la mensajería es una funcionalidad (§1). Este plan la agrega.
- **ADR-01 no contempla las bolsas de horas.** Se ubican en `pagos`; registrado en el [ADR-04](./ADR-04.md) (D5).
- **ADR-01 §4.8 muestra los módulos bajo `backend/`;** aquí se agrega `src/` por convención de Nest.
- **ADR-02** afirma que no hay workspaces. Si se comparten tipos como paquete, debe revisarse.
- **E8** (solicitud abierta de cuidado) queda fuera hasta después del MVP.

### 10.3 Riesgos

| Riesgo | Mitigación |
|---|---|
| NestJS no impide romper las fronteras entre módulos | `dependency-cruiser` en CI, roles de base de datos por módulo (M10) y revisión de dependencias en cada PR. |
| Sobreingeniería hexagonal en módulos simples | Rigor completo solo en Reservas, Pagos y Teleasistencia (ADR-01 §4.10). |
| El monolito es un punto único de falla (E2) | Monitoreo, despliegues con reversión rápida y pruebas antes de cada despliegue. |
| Acceso indebido a datos de otra familia (E6) | Matriz de autorización por endpoint, 404 en recursos ajenos y auditoría. |
| Retrasos externos (pasarela, canales, convenios) | Trámites abiertos desde M1; mientras tanto se desarrolla contra dobles de prueba, que **nunca** llegan a producción (el arranque los rechaza). Si la pasarela o el canal de alertas no están aprobados, **no se lanza**. |
| Varias instancias y SSE | Con una instancia no hay problema; al escalar, repartir eventos con `LISTEN/NOTIFY` de Postgres, sin Redis. |
| Dos desarrolladores y un semestre | Módulos pequeños de punta a punta; M9, M10 y M11 se pueden recortar sin romper el flujo principal. |

---

## 11. Definición de terminado del backend

- [ ] Flujo completo contra el backend real: registro → inicio de sesión → buscar → contratar → pagar con la pasarela (sandbox fuera de producción) → servicio hasta `Finalizado` → teleasistencia y alerta → mensajes.
- [ ] `npm run arquitectura` sin violaciones (E13) y pruebas del dominio sin infraestructura (E14).
- [ ] `(20000, 1)` → 21 600 en backend y frontend, con los mismos vectores (E10).
- [ ] 0 accesos no autorizados en la matriz de autorización (E6); cuidadores no verificados invisibles (E7).
- [ ] 0 cobros duplicados en las pruebas de idempotencia (E3).
- [ ] Alerta entregada en menos de 30 s en el 95 % de los casos con el canal real (E11).
- [ ] Ya no se importa ningún JSON de `frontend/data/` en el código de la aplicación.
- [ ] Producción desplegada con respaldos probados y monitoreo activo.
- [ ] Ningún adaptador simulado ni dato de prueba en producción (el arranque y la CI lo verifican).
- [ ] Todos los requisitos de lanzamiento de la sección 12 cumplidos.
- [ ] ADR-04 aceptado y ADR-01 actualizado con `mensajeria` y las bolsas de horas.

---

## 12. Requisitos para lanzar a usuarios reales

Seniory maneja **datos de salud, dinero y la confianza de familias con personas mayores**. Estos requisitos no son opcionales y **bloquean el lanzamiento**. Las referencias legales son orientativas: cada una debe confirmarse con asesoría legal.

| Área | Requisito | Responsable | Se necesita para |
|---|---|---|---|
| **Datos personales** | Política de tratamiento de datos, aviso de privacidad y autorización previa, expresa e informada (Ley 1581 de 2012 y su reglamentación). Los datos de salud son sensibles (art. 6): la autorización es opcional y no puede condicionarse la contratación de un cuidador a ella. | Legal | M1, F1 |
| **Datos personales** | Procedimiento para atender consultas y reclamos de los titulares (acceso, corrección, supresión) con sus plazos, y para informar a la autoridad (SIC) de incidentes de seguridad. Verificar si aplica el Registro Nacional de Bases de Datos. | Legal + equipo | M1, M10 |
| **Términos y condiciones** | Términos para familias y para cuidadores. Define la relación con el cuidador (trabajador independiente, no empleado), responsabilidades, cancelaciones y reembolsos conforme al Estatuto del Consumidor. | Legal + empresarial | M4, M7 |
| **Teleasistencia** | Aviso de alcance (no es un servicio de emergencias médicas ni un dispositivo médico) y revisión de los textos de la alerta. Umbrales clínicos definidos por un profesional de salud. | Legal + salud | M6 |
| **Riesgos del servicio** | Evaluar un seguro de responsabilidad civil y el manejo de quejas o incidentes entre familias y cuidadores. | Empresarial + legal | M4 |
| **Dinero** | Empresa constituida, cuenta comercial aprobada con la pasarela (que acepte el modelo de marketplace y la dispersión al cuidador), facturación electrónica ante la DIAN del cargo de servicio y tratamiento tributario de las retenciones. | Empresarial + contador | M7 |
| **Precios** | Comisiones y bolsas de horas aprobadas (hoy los de la landing son «ilustrativos»). | Empresarial | M3, M7 |
| **Alertas** | Al menos un canal confiable contratado (SMS o WhatsApp Business, este último con plantillas aprobadas por Meta) y probado en staging con E11. | Equipo | M5, M6 |
| **Cuidadores reales** | Procedimiento de verificación operativo (quién revisa, en cuánto tiempo, con qué vigencia) y primeros cuidadores verificados cargados por un administrador. | Empresarial | M2, M9 |
| **Soporte** | Canal de atención a familias y cuidadores, horarios y responsable; procedimiento para suspender un cuidador. | Empresarial | M10 |
| **Operación** | Respaldo con restauración ensayada, monitoreo y alertas, procedimiento de incidentes (quién actúa y cómo se comunica una caída), secretos rotados y revisión de seguridad (OWASP ASVS nivel 2). | Equipo | M10 |
| **Pruebas con personas** | Pruebas de usabilidad con adultos mayores y familiares reales (E4, E5). | Equipo | F-todos |
| **Lanzamiento por etapas** | Piloto cerrado con pocas familias y cuidadores (propuesta: 20 familias en el Valle de Aburrá) durante algunas semanas antes de abrir, con las metas de E1, E2 y E11 monitoreadas. | Todos | M10 |
| **Contenido** | Sin textos ni cifras de demostración en la landing; licencia de las fotos comprobada. | Equipo | F7 |
