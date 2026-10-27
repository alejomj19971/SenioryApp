# Seniory — *Creciendo y cuidando juntos*

Plataforma web que conecta a familias con cuidadores verificados de adultos mayores.

```text
seniory/
├─ frontend/   Aplicación web (Next.js), desplegada en Vercel
├─ backend/    API: monolito modular con arquitectura hexagonal (NestJS, en construcción)
└─ docs/       Documentación: ADR, planes del backend y del frontend, diseño de la base de datos
```

**¿En qué vamos?** Ver [docs/AVANCE.md](docs/AVANCE.md).

## Ejecutar el frontend

```bash
cd frontend
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

> **Despliegue en Vercel:** el *Root Directory* del proyecto debe ser `frontend`.

## Documentación

- [ADR-01: arquitectura y escenarios de calidad](docs/ADR-01.md)
- [ADR-02: repositorio único y organización funcional del código](docs/ADR-02.md)
- [Avance del proyecto](docs/AVANCE.md)
- [Plan del backend](docs/PLAN_BACKEND_SENIORY.md) y [planes por módulo](docs/backend/README.md)
- [Plan del frontend](docs/PLAN_FRONTEND_SENIORY.md) y [planes por etapa](docs/frontend/README.md)
- [Diseño de la base de datos](docs/backend/BASE_DE_DATOS.md)
- [Backend: cómo ejecutarlo](backend/README.md)
- [Plan del MVP](docs/PLAN_MVP_SENIORY.md) (histórico: el prototipo del pitch)
