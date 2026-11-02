# Seniory — Frontend

Aplicación web (Next.js 16, App Router) de Seniory. **Actúa como BFF** (*backend for frontend*): el navegador solo habla con este servidor, y este llama al backend ([`../backend`](../backend)) de servidor a servidor. Planes: [PLAN_FRONTEND](../docs/PLAN_FRONTEND_SENIORY.md), [INTEGRACIÓN con el backend](../docs/INTEGRACION_FRONTEND_BACKEND.md), [F0](../docs/frontend/F0-base-de-integracion.md) y [F1](../docs/frontend/F1-identidad.md).

> **Estado:** los diez módulos del plan están construidos (F1–F10): identidad, directorio, contratación y área del cuidador, pagos y bolsas, teleasistencia, mensajería en vivo, notificaciones, la postulación del cuidador con el panel de revisión (`/admin`), y el cierre para producción (páginas legales, SEO, cabeceras de seguridad, un error boundary por área). Ya no queda ningún dato de ejemplo en el código (`data/` se borró en F8). Pendiente de este equipo: Sentry (falta la cuenta y el `SENTRY_DSN`), Lighthouse contra la build de producción, y el dominio definitivo (ver [PENDIENTES](../docs/PENDIENTES.md)). Para correr la app necesitas el backend encendido y las variables de `.env.local` (`SENIORY_BFF_SECRETO` **igual** a `SECRETO_BFF` del backend).

> **Next.js 16 tiene cambios incompatibles con versiones anteriores.** Antes de escribir código lee la guía correspondiente en `node_modules/next/dist/docs/` (ver [AGENTS.md](./AGENTS.md)).

## Requisitos

- Node **24.22.1** (`nvm use 24.22.1`).
- Para los recorridos de punta a punta: `npx playwright install chromium` (una sola vez).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias. |
| `cp .env.ejemplo .env.local` | Configuración local (no se sube a git). Hace falta cuando una pantalla llama al backend (F1 en adelante). |
| `npm run dev` | Servidor de desarrollo en <http://localhost:3000>. |
| `npm run build` / `npm start` | Compila y ejecuta. |
| `npm run lint` | ESLint. |
| `npm test` | Pruebas unitarias y de componentes (Vitest). `npm run test:observar` las repite al guardar. |
| `npm run test:contrato` | Pruebas de **contrato** contra el backend local real (`npm run dev` en `backend/`): vigilan que la API responda lo que el frontend supone. Se omiten si el backend no está encendido. |
| `npm run test:recorrido` | Recorridos de punta a punta (Playwright, navegador móvil) **contra el backend local real y la versión compilada** de la app (compila y la levanta en el puerto 3100; `next dev` compila al vuelo y deja de responder más de lo que se espera del backend). Sin el backend encendido se omiten; los de pagos y cuidadores necesitan las variables `ADMIN_DE_PRUEBA_*` y `SECRETO_DE_PASARELA_DE_PRUEBA` de `.env.ejemplo`. |

## Estructura

```text
frontend/
├─ proxy.ts                 ← un identificador de correlación por petición (F1 suma la sesión)
├─ app/                     ← rutas (App Router); app/app/error.tsx es el error de la aplicación
├─ components/              ← componentes visuales
├─ lib/
│  ├─ services/             ← PUERTOS de datos: solo de servidor (`server-only`)
│  ├─ acciones/             ← acciones de servidor ('use server'): validan y devuelven errores como valor
│  ├─ api/                  ← cliente HTTP hacia el backend y `ErrorDeApi` (solo de servidor)
│  ├─ configuracion.ts      ← variables de entorno validadas (solo de servidor)
│  └─ types.ts              ← tipos que cruzan entre el servidor y el navegador
└─ pruebas/{unitarias,recorrido}/
```

## Reglas que verifica una prueba

- Ningún archivo de `app/` o `components/` importa `@/data` ni `@/lib/api`.
- Ningún componente cliente importa un servicio: empaquetaría los datos al navegador.
- Todos los módulos de servidor llevan `import "server-only"`.
