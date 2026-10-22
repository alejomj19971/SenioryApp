# Backend de Seniory

API de Seniory: **monolito modular con arquitectura hexagonal** ([ADR-01](../docs/ADR-01.md)), construido con **NestJS 12**.

- Plan general: [docs/PLAN_BACKEND_SENIORY.md](../docs/PLAN_BACKEND_SENIORY.md)
- Planes por módulo: [docs/backend/](../docs/backend/README.md)

**Estado:** M0 en construcción (PR 1: esqueleto del proyecto).

## Requisitos

- **Node.js 24 LTS** (la versión exacta está en `.nvmrc`). Con nvm-windows, en una terminal como administrador:
  ```
  nvm install 24.22.1
  nvm use 24.22.1
  ```
- **Docker Desktop** encendido (desde el PR 2, para la base de datos local y las pruebas de integración).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias. |
| `npm run dev` | Arranca la API con recarga en `http://localhost:3001`. |
| `npm run build` | Compila a `dist/`. |
| `npm start` | Ejecuta lo compilado. |
| `npm run lint` | oxlint y verificación de tipos. |
| `npm run formato` | Da formato con Prettier (`formato:verificar` solo revisa). |
| `npm test` | Pruebas unitarias (sin Docker). |
| `npm run test:integracion` | Pruebas de integración y de API. |
| `npm run test:cobertura` | Todas las pruebas con cobertura. |

Comprobar que la API está viva: `GET http://localhost:3001/salud` → `{"estado":"ok"}`.

## Convenciones

- Módulos **ESM**: los imports relativos llevan extensión `.js` (`import { AppModule } from './app.module.js'`).
- Rutas de la API bajo `/api/v1`; `/salud` queda fuera del prefijo.
- Las pruebas viven en `pruebas/unitarias`, `pruebas/integracion` y `pruebas/api`.
- Dominio y nombres en español ([ADR-01 §4.9](../docs/ADR-01.md)).
