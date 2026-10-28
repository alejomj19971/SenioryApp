import type { Rol } from '../dominio/rol.js';
import type { EventoDeIntegracion } from './evento-de-integracion.js';

// Contratos de los eventos que publica Identidad (M1 §4.6). Solo IDs: ningún evento lleva correo,
// teléfono ni nombre.

export type UsuarioRegistrado = EventoDeIntegracion<
  'identidad.usuario_registrado',
  { usuarioId: string; rol: Rol }
>;
