import { randomBytes } from 'node:crypto';
import { ContextoTransaccional } from '../../src/compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { AdultoMayor } from '../../src/identidad/dominio/adulto-mayor.js';
import type {
  AdultoMayorId,
  FamiliaDeSesionesId,
  UsuarioId,
} from '../../src/identidad/dominio/ids.js';
import { NombrePersona } from '../../src/identidad/dominio/nombre-persona.js';
import { SesionDeRefresco } from '../../src/identidad/dominio/sesion-de-refresco.js';
import type { Usuario } from '../../src/identidad/dominio/usuario.js';
import { RepositorioAceptacionesDePoliticaDrizzle } from '../../src/identidad/infraestructura/salida/persistencia/repositorio-aceptaciones-de-politica-drizzle.js';
import { RepositorioAdultosMayoresDrizzle } from '../../src/identidad/infraestructura/salida/persistencia/repositorio-adultos-mayores-drizzle.js';
import { RepositorioConsentimientosDrizzle } from '../../src/identidad/infraestructura/salida/persistencia/repositorio-consentimientos-drizzle.js';
import { RepositorioSesionesDrizzle } from '../../src/identidad/infraestructura/salida/persistencia/repositorio-sesiones-drizzle.js';
import { RepositorioUsuariosDrizzle } from '../../src/identidad/infraestructura/salida/persistencia/repositorio-usuarios-drizzle.js';
import { RepositorioVinculosDrizzle } from '../../src/identidad/infraestructura/salida/persistencia/repositorio-vinculos-drizzle.js';
import { conectarDrizzle } from './bd.js';
import { AHORA, HOY, idDePrueba, usuarioDePrueba } from './identidad.js';

// Los repositorios de Identidad conectados a la base de pruebas, como los arma la aplicación.
export function montarRepositoriosDeIdentidad() {
  const { pool, bd } = conectarDrizzle();
  const contexto = new ContextoTransaccional(bd);
  return {
    pool,
    contexto,
    usuarios: new RepositorioUsuariosDrizzle(contexto),
    sesiones: new RepositorioSesionesDrizzle(contexto),
    adultosMayores: new RepositorioAdultosMayoresDrizzle(contexto),
    vinculos: new RepositorioVinculosDrizzle(contexto),
    consentimientos: new RepositorioConsentimientosDrizzle(contexto),
    aceptaciones: new RepositorioAceptacionesDePoliticaDrizzle(contexto),
  };
}

export type RepositoriosDeIdentidad = ReturnType<
  typeof montarRepositoriosDeIdentidad
>;

// Un familiar guardado en la base (los demás datos de prueba lo necesitan por las claves foráneas).
export async function guardarFamiliar(
  repos: RepositoriosDeIdentidad,
): Promise<Usuario> {
  const usuario = usuarioDePrueba();
  await repos.usuarios.guardar(usuario);
  return usuario;
}

export async function guardarAdultoMayor(
  repos: RepositoriosDeIdentidad,
  creadoPor: UsuarioId,
  id: AdultoMayorId = idDePrueba<'AdultoMayor'>(),
): Promise<AdultoMayor> {
  const adultoMayor = AdultoMayor.registrar({
    id,
    nombre: NombrePersona.crear('Carmen Gómez'),
    fechaDeNacimiento: HOY.sumarDias(-365 * 78),
    creadoPor,
    hoy: HOY,
    ahora: AHORA,
  });
  await repos.adultosMayores.guardar(adultoMayor);
  return adultoMayor;
}

export function hashDeTokenAleatorio(): Uint8Array {
  return new Uint8Array(randomBytes(32));
}

export function sesionDePrueba(
  usuarioId: UsuarioId,
  opciones: {
    familiaId?: FamiliaDeSesionesId;
    hash?: Uint8Array;
    ahora?: Date;
    duracionMs?: number;
  } = {},
): SesionDeRefresco {
  return SesionDeRefresco.emitir({
    id: idDePrueba<'SesionDeRefresco'>(),
    usuarioId,
    familiaId: opciones.familiaId ?? idDePrueba<'FamiliaDeSesiones'>(),
    hashDelToken: opciones.hash ?? hashDeTokenAleatorio(),
    ahora: opciones.ahora ?? AHORA,
    duracionMs: opciones.duracionMs ?? 30 * 24 * 60 * 60_000,
  });
}

// Deja pasar el tiempo real para comprobar que algo SIGUE esperando (por ejemplo, un bloqueo de fila).
export const esperar = (ms: number) =>
  new Promise<void>((resolver) => setTimeout(resolver, ms));
