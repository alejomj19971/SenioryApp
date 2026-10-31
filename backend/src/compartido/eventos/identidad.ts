import type { Rol } from '../dominio/rol.js';
import type { EventoDeIntegracion } from './evento-de-integracion.js';

// Contratos de los eventos que publica Identidad (M1 §4.6). Solo IDs: ningún evento lleva correo,
// teléfono ni nombre.

export type UsuarioRegistrado = EventoDeIntegracion<
  'identidad.usuario_registrado',
  { usuarioId: string; rol: Rol }
>;

export type AdultoMayorRegistrado = EventoDeIntegracion<
  'identidad.adulto_mayor_registrado',
  { adultoMayorId: string; registradoPor: string }
>;

export type VinculoCreado = EventoDeIntegracion<
  'identidad.vinculo_creado',
  { vinculoId: string; familiarId: string; adultoMayorId: string }
>;

// Teleasistencia lo consulta en cada acceso; ConsentimientoRevocado corta los accesos abiertos.
export type ConsentimientoOtorgado = EventoDeIntegracion<
  'identidad.consentimiento_otorgado',
  { adultoMayorId: string; finalidad: string }
>;

export type ConsentimientoRevocado = EventoDeIntegracion<
  'identidad.consentimiento_revocado',
  { adultoMayorId: string; finalidad: string }
>;

export type EventoDeIdentidad =
  | UsuarioRegistrado
  | AdultoMayorRegistrado
  | VinculoCreado
  | ConsentimientoOtorgado
  | ConsentimientoRevocado;
