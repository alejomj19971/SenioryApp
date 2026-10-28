import type { TestProject } from 'vitest/node';
import { ejecutarMigraciones } from '../../src/compartido/infraestructura/base-de-datos/migrar.js';
import { iniciarBaseDeDatosDePrueba } from './base-de-datos-de-prueba.js';

declare module 'vitest' {
  export interface ProvidedContext {
    // URL del Postgres desechable con TODAS las migraciones aplicadas.
    urlBdPrueba: string;
  }
}

// Se ejecuta una sola vez por corrida del proyecto `integracion`: levanta un Postgres real,
// aplica las migraciones y comparte la URL con los archivos de pruebas. Cada prueba usa ids
// nuevos, así que no necesita limpiar tablas entre sí.
export default async function iniciar(project: TestProject) {
  const bd = await iniciarBaseDeDatosDePrueba();
  await ejecutarMigraciones(bd.url);
  project.provide('urlBdPrueba', bd.url);

  return async () => {
    await bd.detener();
  };
}
