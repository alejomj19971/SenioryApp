import type { FamiliaDeSesionesId } from '../../../dominio/ids.js';
import type { SesionDeRefresco } from '../../../dominio/sesion-de-refresco.js';

export interface RepositorioSesiones {
  guardar(sesion: SesionDeRefresco): Promise<void>;

  // Busca por el SHA-256 del token y BLOQUEA la fila hasta que termine la transacción: dos
  // renovaciones simultáneas con el mismo token se atienden una tras otra, y la segunda ya ve que la
  // primera lo reemplazó. Debe llamarse dentro de una unidad de trabajo.
  buscarPorHashDelToken(hash: Uint8Array): Promise<SesionDeRefresco | null>;

  // Guarda el reemplazo o la revocación de la sesión. Nunca sobrescribe una marca que ya exista:
  // conserva el primer instante, porque de él depende la ventana de gracia.
  actualizar(sesion: SesionDeRefresco): Promise<void>;

  // Revoca todas las sesiones todavía no revocadas de la familia. Devuelve cuántas.
  revocarFamilia(familiaId: FamiliaDeSesionesId, ahora: Date): Promise<number>;

  // Borra las sesiones que vencieron antes de `limite` (tarea diaria de limpieza). Devuelve cuántas.
  eliminarVencidasAntesDe(limite: Date): Promise<number>;
}

export const REPOSITORIO_SESIONES = Symbol('RepositorioSesiones');
