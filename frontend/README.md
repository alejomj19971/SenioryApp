# Seniory — Frontend

Aplicación web (Next.js 16, App Router) de Seniory. **Actúa como BFF** (*backend for frontend*): el navegador solo habla con este servidor, y este llama al backend ([`../backend`](../backend)) de servidor a servidor. Planes: [PLAN_FRONTEND](../docs/PLAN_FRONTEND_SENIORY.md), [INTEGRACIÓN con el backend](../docs/INTEGRACION_FRONTEND_BACKEND.md), [F0](../docs/frontend/F0-base-de-integracion.md) y [F1](../docs/frontend/F1-identidad.md).

> **Estado:** **F1 (identidad) está conectado al backend**: cuentas reales, sesión por cookies y bienvenida; `/app` exige ingresar. El resto de las pantallas (cuidadores, contratación, teleasistencia, mensajes) sigue siendo el prototipo del pitch con datos de ejemplo en `data/*.json`; cada módulo F*n* conecta sus pantallas y borra el JSON que reemplaza. Para correr la app necesitas el backend encendido y las variables de `.env.local` (`SENIORY_BFF_SECRETO` **igual** a `SECRETO_BFF` del backend).

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
| `npm run test:recorrido` | Recorridos de punta a punta (Playwright, navegador móvil) **contra el backend local real**. Levanta su propio servidor en el puerto 3100; sin el backend encendido se omiten. |

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
├─ data/                    ← datos de ejemplo del prototipo; se borran módulo por módulo
└─ pruebas/{unitarias,recorrido}/
```

## Reglas que verifica una prueba

- Ningún archivo de `app/` o `components/` importa `@/data` ni `@/lib/api`.
- Ningún componente cliente importa un servicio: empaquetaría los datos al navegador.
- Todos los módulos de servidor llevan `import "server-only"`.
