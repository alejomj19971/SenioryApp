import type { Id } from '../../compartido/dominio/id.js';

// Identificadores tipados de Identidad: el compilador no deja pasar el ID de un usuario donde se
// espera el de un adulto mayor.
export type UsuarioId = Id<'Usuario'>;
export type AdultoMayorId = Id<'AdultoMayor'>;
export type VinculoId = Id<'Vinculo'>;
export type ConsentimientoId = Id<'Consentimiento'>;
export type SesionDeRefrescoId = Id<'SesionDeRefresco'>;
// Todas las sesiones que descienden de un mismo inicio de sesión comparten familia.
export type FamiliaDeSesionesId = Id<'FamiliaDeSesiones'>;
