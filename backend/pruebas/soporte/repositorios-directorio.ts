import { ContextoTransaccional } from '../../src/compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import type { Cuidador } from '../../src/directorio/dominio/cuidador.js';
import { RepositorioCuidadoresDrizzle } from '../../src/directorio/infraestructura/salida/persistencia/repositorio-cuidadores-drizzle.js';
import { RepositorioDocumentosDrizzle } from '../../src/directorio/infraestructura/salida/persistencia/repositorio-documentos-drizzle.js';
import { RepositorioResenasDrizzle } from '../../src/directorio/infraestructura/salida/persistencia/repositorio-resenas-drizzle.js';
import { conectarDrizzle } from './bd.js';
import {
  cuidadorDePrueba,
  type OpcionesDeCuidadorDePrueba,
} from './directorio.js';

// Los repositorios de Directorio conectados a la base de pruebas, como los arma la aplicación.
export function montarRepositoriosDeDirectorio() {
  const { pool, bd } = conectarDrizzle();
  const contexto = new ContextoTransaccional(bd);
  return {
    pool,
    contexto,
    cuidadores: new RepositorioCuidadoresDrizzle(contexto),
    resenas: new RepositorioResenasDrizzle(contexto),
    documentos: new RepositorioDocumentosDrizzle(contexto),
  };
}

export type RepositoriosDeDirectorio = ReturnType<
  typeof montarRepositoriosDeDirectorio
>;

// Un cuidador de prueba guardado en la base (por defecto, activo y visible).
export async function guardarCuidador(
  repos: RepositoriosDeDirectorio,
  opciones: OpcionesDeCuidadorDePrueba = {},
): Promise<Cuidador> {
  const cuidador = cuidadorDePrueba(opciones);
  await repos.cuidadores.guardar(cuidador);
  return cuidador;
}
