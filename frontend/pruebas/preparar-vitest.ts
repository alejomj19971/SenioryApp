import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// Las pruebas de componentes esperan trabajo asíncrono real (acciones simuladas, cotizaciones, temporizadores de
// búsqueda). Con la suite completa corriendo en paralelo, 1 s de espera es poco y da fallos que no son del código:
// se da margen.
configure({ asyncUtilTimeout: 4_000 });
