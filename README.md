# Seniory — *Creciendo y cuidando juntos*

Plataforma web que conecta a familias con cuidadores verificados de adultos mayores.

```text
seniory/
├─ frontend/   Aplicación web (Next.js), desplegada en Vercel
├─ backend/    API: monolito modular con arquitectura hexagonal (pendiente)
└─ docs/       Documentación de arquitectura (ADR) y plan del MVP
```

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
- [Plan del MVP](docs/PLAN_MVP_SENIORY.md)
