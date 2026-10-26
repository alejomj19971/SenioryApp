# Backend de Seniory

API de Seniory: **monolito modular con arquitectura hexagonal** ([ADR-01](../docs/ADR-01.md)), construido con **NestJS 12**.

- Plan general: [docs/PLAN_BACKEND_SENIORY.md](../docs/PLAN_BACKEND_SENIORY.md)
- Planes por módulo: [docs/backend/](../docs/backend/README.md)

**Estado:** M0 en construcción (PR 1 esqueleto ✅, PR 2 configuración y base de datos ✅). **Base de datos completa construida** (8 esquemas, 37 tablas): ver [docs/backend/BASE_DE_DATOS.md](../docs/backend/BASE_DE_DATOS.md).

## Requisitos

- **Node.js 24 LTS** (la versión exacta está en `.nvmrc`). Con nvm-windows, en una terminal como administrador:
  ```
  nvm install 24.22.1
  nvm use 24.22.1
  ```
- **Docker Desktop** encendido (base de datos local y pruebas de integración).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias. |
| `cp .env.ejemplo .env` | Crea tu configuración local (no se sube a git). La API no arranca sin ella. |
| `npm run bd:arriba` | Enciende Postgres en Docker (puerto **5434**). `bd:abajo` lo apaga. |
| `npm run bd:migrar` | Aplica las migraciones a esa base. |
| `npm run bd:generar` | Genera una migración nueva desde los esquemas (`-- --custom --name=…` para SQL a mano). |
| `npm run dev` | Arranca la API con recarga en `http://localhost:3001`. |
| `npm run build` | Compila a `dist/`. |
| `npm start` | Ejecuta lo compilado. |
| `npm run lint` | oxlint y verificación de tipos. |
| `npm run formato` | Da formato con Prettier (`formato:verificar` solo revisa). |
| `npm test` | Pruebas unitarias (sin Docker). |
| `npm run test:integracion` | Pruebas de integración y de API: 253 pruebas de restricciones de la base de datos contra un Postgres real y desechable (Testcontainers; requiere Docker). |
| `npm run test:cobertura` | Todas las pruebas con cobertura. |

Comprobar que la API está viva: `GET http://localhost:3001/salud` → `{"estado":"ok"}`.

## Convenciones

- Módulos **ESM**: los imports relativos llevan extensión `.js` (`import { AppModule } from './app.module.js'`).
- Rutas de la API bajo `/api/v1`; `/salud` queda fuera del prefijo.
- Las pruebas viven en `pruebas/unitarias`, `pruebas/integracion` y `pruebas/api`.
- Dominio y nombres en español ([ADR-01 §4.9](../docs/ADR-01.md)).

## Base de datos

- Un esquema de Postgres por módulo, declarado en `src/<modulo>/infraestructura/salida/persistencia/<modulo>.esquema.ts`. **Ningún módulo importa el esquema de otro** y no hay claves foráneas entre esquemas (E13).
- Migraciones en `drizzle/`, una por módulo. Para una nueva: editar el esquema y `npm run bd:generar -- --name=descripcion`; revisa el SQL generado antes de aplicarlo.
- Reglas de integridad en la propia base (CHECK, UNIQUE parciales, triggers): cualquier regla nueva lleva su prueba en `pruebas/integracion/base-de-datos/`.
- Datos de referencia (franjas, política de precios) van en migraciones; los datos de ejemplo, nunca en producción.
