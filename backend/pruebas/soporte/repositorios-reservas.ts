import { ContextoTransaccional } from '../../src/compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import type { Servicio } from '../../src/reservas/dominio/servicio.js';
import type { DatosParaSolicitar } from '../../src/reservas/dominio/servicio.js';
import { RepositorioCalificacionesDrizzle } from '../../src/reservas/infraestructura/salida/persistencia/repositorio-calificaciones-drizzle.js';
import { RepositorioServiciosDrizzle } from '../../src/reservas/infraestructura/salida/persistencia/repositorio-servicios-drizzle.js';
import { conectarDrizzle, nuevoId } from './bd.js';
import { servicioSolicitado } from './reservas.js';

// Los repositorios de Reservas conectados a la base de pruebas, como los arma la aplicación.
export function montarRepositoriosDeReservas() {
  const { pool, bd } = conectarDrizzle();
  const contexto = new ContextoTransaccional(bd);
  return {
    pool,
    contexto,
    servicios: new RepositorioServiciosDrizzle(contexto),
    calificaciones: new RepositorioCalificacionesDrizzle(contexto),
  };
}

export type RepositoriosDeReservas = ReturnType<
  typeof montarRepositoriosDeReservas
>;

// Personas nuevas para cada prueba: la base se comparte con las demás y no hay claves foráneas entre esquemas.
export const personasNuevas = () => ({
  familiarId: nuevoId(),
  adultoMayorId: nuevoId(),
  cuidadorId: nuevoId(),
});

// Un servicio solicitado con personas propias (y, por defecto, una fecha y franja que ningún otro usa).
export async function guardarServicio(
  repos: RepositoriosDeReservas,
  cambios: Partial<DatosParaSolicitar> = {},
): Promise<Servicio> {
  const servicio = servicioSolicitado({ ...personasNuevas(), ...cambios });
  await repos.servicios.guardar(servicio);
  return servicio;
}
