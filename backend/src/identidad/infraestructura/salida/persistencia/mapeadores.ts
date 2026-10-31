import { FechaCivil } from '../../../../compartido/dominio/fecha-civil.js';
import type { Id } from '../../../../compartido/dominio/id.js';
import { esRol } from '../../../../compartido/dominio/rol.js';
import { AceptacionDePolitica } from '../../../dominio/aceptacion-de-politica.js';
import { AdultoMayor } from '../../../dominio/adulto-mayor.js';
import { Consentimiento } from '../../../dominio/consentimiento.js';
import { Correo } from '../../../dominio/correo.js';
import { Credencial } from '../../../dominio/credencial.js';
import { NombrePersona } from '../../../dominio/nombre-persona.js';
import { SesionDeRefresco } from '../../../dominio/sesion-de-refresco.js';
import { TokenDeRecuperacion } from '../../../dominio/token-de-recuperacion.js';
import { TelefonoE164 } from '../../../dominio/telefono-e164.js';
import { Usuario, type EstadoDeUsuario } from '../../../dominio/usuario.js';
import {
  calidadDesdeTexto,
  finalidadDesdeTexto,
  parentescoDesdeTexto,
} from '../../../dominio/valores-cerrados.js';
import { VersionDeTexto } from '../../../dominio/version-de-texto.js';
import { Vinculo, type EstadoDeVinculo } from '../../../dominio/vinculo.js';
import type {
  aceptacionesDePolitica,
  adultosMayores,
  consentimientos,
  credenciales,
  sesionesRefresco,
  tokensDeRecuperacion,
  usuarios,
  vinculos,
} from './identidad.esquema.js';

// Convierte filas de la base de datos en objetos de dominio. Los datos que salen de la base ya
// pasaron por el dominio al guardarse y por los CHECK de las tablas, así que los IDs se aceptan tal
// cual. Si un valor no es válido es que la base está dañada: se falla con un error claro en lugar de
// seguir con datos inconsistentes.

const id = <Marca extends string>(texto: string): Id<Marca> =>
  texto as Id<Marca>;

function exigir<T extends string>(
  valor: string,
  validos: readonly T[],
  campo: string,
): T {
  const encontrado = validos.find((v) => v === valor);
  if (encontrado === undefined) {
    throw new Error(
      `Valor inesperado en la base de datos: ${campo} = "${valor}"`,
    );
  }
  return encontrado;
}

export function credencialDeFila(
  fila: typeof credenciales.$inferSelect,
): Credencial {
  return Credencial.reconstruir({
    usuarioId: id(fila.usuarioId),
    hash: fila.hash,
    intentosFallidos: fila.intentosFallidos,
    bloqueadoHasta: fila.bloqueadoHasta,
    actualizadoEn: fila.actualizadoEn,
  });
}

export function usuarioDeFilas(
  fila: typeof usuarios.$inferSelect,
  credencial: typeof credenciales.$inferSelect,
): Usuario {
  if (!esRol(fila.rol)) {
    throw new Error(
      `Valor inesperado en la base de datos: rol = "${fila.rol}"`,
    );
  }
  const estado: EstadoDeUsuario = exigir(
    fila.estado,
    ['activo', 'eliminado'],
    'estado',
  );
  return Usuario.reconstruir({
    id: id(fila.id),
    correo: Correo.crear(fila.correo),
    nombre: NombrePersona.crear(fila.nombre),
    telefono: fila.telefono === null ? null : TelefonoE164.crear(fila.telefono),
    rol: fila.rol,
    estado,
    correoVerificadoEn: fila.correoVerificadoEn,
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
    credencial: credencialDeFila(credencial),
  });
}

export function tokenDeRecuperacionDeFila(
  fila: typeof tokensDeRecuperacion.$inferSelect,
): TokenDeRecuperacion {
  return TokenDeRecuperacion.reconstruir({
    id: id(fila.id),
    usuarioId: id(fila.usuarioId),
    hashDelToken: fila.hashDelToken,
    creadoEn: fila.creadoEn,
    expiraEn: fila.expiraEn,
    usadoEn: fila.usadoEn,
  });
}

export function sesionDeFila(
  fila: typeof sesionesRefresco.$inferSelect,
): SesionDeRefresco {
  return SesionDeRefresco.reconstruir({
    id: id(fila.id),
    usuarioId: id(fila.usuarioId),
    familiaId: id(fila.familiaId),
    hashDelToken: fila.hashDelToken,
    emitidaEn: fila.emitidaEn,
    expiraEn: fila.expiraEn,
    reemplazadaEn: fila.reemplazadaEn,
    reemplazadaPor:
      fila.reemplazadaPor === null ? null : id(fila.reemplazadaPor),
    revocadaEn: fila.revocadaEn,
  });
}

export function adultoMayorDeFila(
  fila: typeof adultosMayores.$inferSelect,
): AdultoMayor {
  return AdultoMayor.reconstruir({
    id: id(fila.id),
    nombre: NombrePersona.crear(fila.nombre),
    fechaDeNacimiento: FechaCivil.desdeTexto(fila.fechaDeNacimiento),
    fotoUrl: fila.fotoUrl,
    usuarioId: fila.usuarioId === null ? null : id(fila.usuarioId),
    creadoPor: id(fila.creadoPor),
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
  });
}

export function vinculoDeFila(fila: typeof vinculos.$inferSelect): Vinculo {
  const estado: EstadoDeVinculo = exigir(
    fila.estado,
    ['activo', 'revocado'],
    'estado',
  );
  return Vinculo.reconstruir({
    id: id(fila.id),
    familiarId: id(fila.familiarId),
    adultoMayorId: id(fila.adultoMayorId),
    parentesco: parentescoDesdeTexto(fila.parentesco),
    esResponsable: fila.esResponsable,
    estado,
    creadoEn: fila.creadoEn,
    revocadoEn: fila.revocadoEn,
  });
}

export function consentimientoDeFila(
  fila: typeof consentimientos.$inferSelect,
): Consentimiento {
  return Consentimiento.reconstruir({
    id: id(fila.id),
    adultoMayorId: id(fila.adultoMayorId),
    finalidad: finalidadDesdeTexto(fila.finalidad),
    otorgadoPor: id(fila.otorgadoPor),
    calidad: calidadDesdeTexto(fila.calidad),
    versionDelTexto: VersionDeTexto.crear(fila.versionDelTexto),
    otorgadoEn: fila.otorgadoEn,
    revocadoEn: fila.revocadoEn,
  });
}

export function aceptacionDeFila(
  fila: typeof aceptacionesDePolitica.$inferSelect,
): AceptacionDePolitica {
  return AceptacionDePolitica.registrar({
    usuarioId: id(fila.usuarioId),
    version: VersionDeTexto.crear(fila.version),
    aceptadaEn: fila.aceptadaEn,
  });
}
