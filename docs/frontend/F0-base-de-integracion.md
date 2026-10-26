# F0 — Base de integración con el backend

| Campo | Valor |
|---|---|
| **Módulo** | F0 (primero del [plan del frontend](../PLAN_FRONTEND_SENIORY.md)) |
| **Requiere en el backend** | M0 (solo `GET /salud`) |
| **Tamaño** | M |
| **Estado** | Propuesta (reformulada el 2026-10-26: aplicación real, sin modo demostración) |

---

## 1. Objetivo y alcance

Preparar el frontend para hablar con el backend **sin cambiar nada de lo que el usuario ve**. Al terminar F0, la app se ve y funciona como hoy, pero ya tiene el cliente HTTP, la configuración, los servicios en servidor, el `proxy.ts`, el manejo de errores y las pruebas que usarán F1 en adelante.

**Entra**
- Convertir `lib/services` en módulos `server-only` y mover a `lib/types.ts` los tipos que hoy cruzan entre servidor y cliente.
- Configuración validada por variables de entorno (`SENIORY_API_URL`, `SENIORY_BFF_SECRETO`).
- Cliente HTTP de servidor con errores tipados, tiempo máximo de espera y correlación.
- Pasar la única llamada de un componente cliente a un servicio (`confirmarContratacion`) a una **acción de servidor**.
- `proxy.ts` base: genera el identificador de correlación (sin lógica de sesión todavía).
- `error.tsx` para la sección `/app`.
- Pruebas unitarias (Vitest) y un recorrido principal con Playwright como red de seguridad.

**No entra**
- Inicio de sesión ni cookies (F1).
- Llamadas a endpoints de negocio: cada módulo F reimplementa su servicio sobre la API y **borra el JSON que reemplaza**.
- Un «modo demostración» o un interruptor entre datos de prueba y datos reales. No existen en la aplicación real.

---

## 2. Relación con los ADR y el diagrama

| Referencia | Cómo la aplica F0 |
|---|---|
| ADR-01 §4.7: «las pantallas solo llaman a la capa de servicios»; diagrama: `lib/services/` = PUERTOS, `data/` = ADAPTADOR MVP | `lib/services` sigue siendo el puerto. El «adaptador MVP» (`data/`) se va eliminando módulo por módulo, y los servicios pasan a llamar a la API. |
| ADR-02 §5: «las páginas consultan datos a través de `lib/services`, no importando `data/`» | Una prueba lo verifica (§6). |
| ADR-01 E1: «si algo falla, el usuario recibe un mensaje claro» | `error.tsx` y errores tipados. |

---

## 3. Definición de preparado

- [ ] M0 PR 1 terminado (el backend responde `GET /salud`). ✅ Ya está.
- [ ] Node 24 activo también para el frontend (`nvm use 24.22.1`), para usar la misma versión en ambos proyectos.
- [ ] Leída la documentación local de Next sobre *proxy*, *data security*, *error handling* y *testing* (`node_modules/next/dist/docs/01-app/`).

---

## 4. Diseño

### 4.1 Estructura

```
frontend/
├─ proxy.ts                              ← nuevo: correlación (F0); sesión (F1)
├─ .env.ejemplo                          ← nuevo
├─ vitest.config.mts                     ← nuevo
├─ playwright.config.ts                  ← nuevo
├─ app/app/error.tsx                     ← nuevo
├─ lib/
│  ├─ configuracion.ts                   ← nuevo, server-only
│  ├─ api/
│  │  ├─ cliente-servidor.ts             ← nuevo, server-only
│  │  └─ error-de-api.ts                 ← nuevo
│  ├─ services/                          ← puertos: mismas firmas de hoy, ahora server-only
│  └─ acciones/
│     └─ contratacion.ts                 ← nuevo, 'use server'
└─ pruebas/
   ├─ unitarias/
   └─ recorrido/                         ← Playwright
```

### 4.2 Dependencias nuevas

| Paquete | Tipo | Para qué |
|---|---|---|
| `server-only` | dependencia | Marca módulos de servidor (Next lo maneja internamente; instalarlo evita avisos del linter). |
| `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/dom`, `jsdom` | desarrollo | Pruebas unitarias y de componentes (guía *Vitest* de Next). |
| `@playwright/test` | desarrollo | Recorridos de la aplicación (guía *Playwright* de Next). |
| `openapi-typescript` | desarrollo | Tipos desde el OpenAPI del backend (se usa desde F1). |

### 4.3 Configuración (`lib/configuracion.ts`, server-only)

```ts
import 'server-only';

export function urlDelBackend(): string;   // SENIORY_API_URL; error claro si falta
export function secretoBff(): string;      // SENIORY_BFF_SECRETO; error claro si falta
```

Se leen cuando el primer servicio conectado llama al backend (F1 en adelante). En producción, la aplicación **no arranca** si falta alguna (se valida al iniciar con `instrumentation.ts`; confirmar el mecanismo en la documentación de Next al implementarlo). Ninguna variable lleva `NEXT_PUBLIC_`: no deben llegar al navegador.

`.env.ejemplo`:

```
SENIORY_API_URL=http://localhost:3001/api/v1
SENIORY_BFF_SECRETO=
```

### 4.4 Servicios como puertos del servidor

Cada archivo de `lib/services` conserva sus firmas actuales y pasa a ser `server-only`:

```ts
// lib/services/cuidadores.ts
import 'server-only';
import cuidadoresData from '@/data/cuidadores.json';   // hasta F2; luego llama a la API
```

- Hoy la contratación empaqueta los JSON para el navegador, porque un componente cliente importa el servicio. Con `server-only` eso deja de ocurrir.
- **Tipos que cruzan a componentes cliente.** `ContratacionConfirmada` y `DatosContratacion` se mueven de `lib/services/contratacion.ts` a `lib/types.ts`, para que `contratacion-provider.tsx` no importe nada de un módulo de servidor.
- Cuando un módulo F reimplementa su servicio, el archivo pasa a llamar a `lib/api` y a mapear los DTOs; el JSON se elimina en el mismo PR.

### 4.5 Acción de servidor para la contratación

`formulario-contratacion.tsx` (componente cliente) hoy llama directamente a `confirmarContratacion`. Pasa a llamar a una acción:

```ts
// lib/acciones/contratacion.ts
'use server';
import { confirmarContratacion } from '@/lib/services/contratacion';
import type { ContratacionConfirmada, DatosContratacion } from '@/lib/types';

export type ResultadoDeContratacion =
  | { ok: true; contratacion: ContratacionConfirmada }
  | { ok: false; mensaje: string };

export async function confirmarContratacionAccion(
  datos: DatosContratacion,
): Promise<ResultadoDeContratacion>;
```

La acción valida la entrada (horas de 1 a 8, jornada válida, fecha con formato `YYYY-MM-DD`) y devuelve los errores esperados como valor. El componente muestra `mensaje` si `ok` es falso. Mientras el módulo de contratación (F4) no esté conectado, el comportamiento visible es idéntico al actual.

### 4.6 Cliente HTTP (`lib/api/cliente-servidor.ts`, server-only)

Dos funciones, una para leer y otra para escribir:

```ts
import 'server-only';

// Para componentes de servidor. 401 → redirect('/ingresar'); 404 → notFound();
// cualquier otro error se lanza como ErrorDeApi (lo atrapa error.tsx).
export async function leerDelBackend<T>(ruta: string, opciones?: { consulta?: Record<string, string> }): Promise<T>;

// Para acciones de servidor. 401 → redirect('/ingresar'); el resto de errores
// se devuelven como valor para mostrarlos en el formulario.
export async function escribirEnBackend<T>(
  ruta: string,
  opciones: { metodo: 'POST' | 'PATCH' | 'PUT' | 'DELETE'; cuerpo?: unknown; claveDeIdempotencia?: string },
): Promise<{ ok: true; datos: T } | { ok: false; error: ErrorDeApi }>;
```

En cada petición:

| Qué | Cómo |
|---|---|
| URL | `urlDelBackend()` + ruta. |
| Sesión | Cookie `seniory_acceso` leída con `cookies()` (desde F1). |
| Correlación | `X-Request-Id` que llega del `proxy.ts` (lo lee con `headers()`). |
| IP del cliente | `X-Cliente-IP` tomada de `x-forwarded-for` y `X-Seniory-BFF` con el secreto. |
| Tiempo máximo | 8 s (`AbortSignal.timeout`). Si el backend no responde, el usuario ve un error claro en vez de una pantalla colgada. Se ajusta con mediciones reales. |
| Caché | `cache: 'no-store'` explícito (es el comportamiento por defecto en Next 16, pero se deja escrito). |

`ErrorDeApi` (`lib/api/error-de-api.ts`) se construye desde `problem+json`: `estado`, `codigo`, `mensaje` (en español, del backend), `errores` por campo e `idDeCorrelacion`. Si la respuesta no es `problem+json` (por ejemplo, un 502 del hosting), usa un mensaje genérico en español.

**Ajuste necesario en el backend (M0).** Como todas las peticiones llegan desde los servidores de Vercel, el límite por IP del backend debe usar `X-Cliente-IP` **solo** cuando `X-Seniory-BFF` trae el secreto correcto; si no, usa la IP de la conexión. Queda registrado en [M0 §4.10](../backend/M0-plataforma-y-compartido.md).

### 4.7 `proxy.ts` (base)

```ts
// frontend/proxy.ts
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const encabezados = new Headers(request.headers);
  encabezados.set('x-request-id', crypto.randomUUID());
  return NextResponse.next({ request: { headers: encabezados } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|pdf)$).*)'],
};
```

El identificador va en los encabezados de la petición **hacia el servidor** (no en la respuesta), como indica la guía de Next. F1 agrega aquí la verificación optimista de sesión y la renovación del token.

### 4.8 `app/app/error.tsx`

Componente cliente con las props de Next 16 (`error` y `retry`): mensaje «No pudimos cargar esta información. Revisa tu conexión e inténtalo de nuevo.», botón **Reintentar** de 48 px que llama a `retry()`, y enlace a Inicio. No muestra `error.message` (en producción Next lo reemplaza por un texto genérico en errores del servidor). Si el error trae `digest`, se muestra como «Código de soporte» para poder buscarlo en los logs.

---

## 5. Seguridad

| Riesgo | Control |
|---|---|
| Código de servidor (URL, secreto, JSON con teléfonos) en el navegador | `server-only` en configuración, cliente HTTP y servicios. |
| Secretos expuestos | Variables sin `NEXT_PUBLIC_`. El `.gitignore` del frontend ya ignora `.env*`; hay que agregar la excepción `!.env.ejemplo` para poder versionar el archivo de ejemplo. |
| Acciones de servidor invocadas directamente | Validan su entrada; Next compara `Origin` con `Host` y solo acepta `POST`. |
| Backend lento o caído | Tiempo máximo de 8 s y `error.tsx`. |

---

## 6. Pruebas

| Tipo | Prueba |
|---|---|
| Unitaria | `ErrorDeApi` desde un `problem+json` con errores por campo, desde una respuesta HTML de 502 y desde un error de red. |
| Unitaria | `configuracion`: con la variable ausente, error claro que dice cuál falta. |
| Unitaria | `confirmarContratacionAccion`: horas 0 y 9 rechazadas; datos válidos devuelven `ok: true` y el total de $21.600 para el cuidador de $20.000 y 1 hora. |
| Unitaria | Regla de capas: ningún archivo de `app/` o `components/` importa `@/data` ni `@/lib/api` (prueba que recorre los archivos). |
| Recorrido (Playwright) | Recorrido principal: landing → `/app` → buscar → perfil con badges → contratar 1 hora ($21.600) → confirmación → teleasistencia → alerta con cuenta regresiva. Es la red de seguridad mientras se reemplazan los servicios; se actualiza con cada módulo F. |
| Manual | La app se ve y se comporta igual que antes de F0. |

Scripts nuevos en `frontend/package.json`: `test` (Vitest), `test:recorrido` (Playwright).

---

## 7. Pull requests

| PR | Contenido |
|---|---|
| 1 | Vitest y Playwright configurados; recorrido principal (primero, como red de seguridad para el resto del trabajo). |
| 2 | Servicios `server-only`; tipos movidos a `lib/types.ts`; prueba de la regla de capas. |
| 3 | Acción de servidor para la contratación y su prueba. |
| 4 | Configuración, `ErrorDeApi`, cliente HTTP, `proxy.ts` base, `error.tsx`, `.env.ejemplo`. |

---

## 8. Definición de terminado de F0

Además de la [definición común](../PLAN_FRONTEND_SENIORY.md):

- [ ] El recorrido principal pasa en Playwright.
- [ ] Ningún componente cliente importa un servicio; la contratación usa la acción de servidor.
- [ ] Los JSON de `data/` no aparecen en el código que se envía al navegador (verificar en el build).
- [ ] Una prueba manual del cliente HTTP contra `/salud` del backend local responde bien; con el backend apagado, el error es claro y aparece en menos de 8 s.

---

## 9. Decisiones abiertas

| # | Decisión | Recomendación |
|---|---|---|
| 1 | Carpeta de pruebas del frontend | `frontend/pruebas/`, igual que el backend. |
| 2 | Tiempo máximo por petición | 8 s; ajustar con mediciones reales en staging. |
