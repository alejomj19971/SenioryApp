import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import { RecursoNoEncontrado } from '../../../compartido/dominio/errores.js';
import type { ConsultaDeDirectorio } from '../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import type { ServicioId } from '../../dominio/ids.js';
import type { Servicio } from '../../dominio/servicio.js';
import type { RepositorioServicios } from '../puertos/salida/repositorio-servicios.js';

export type RolConAcceso = 'familiar' | 'cuidador';

// Quién puede tocar un servicio. Cada acción verifica quién es el actor y su relación con el servicio: quien no
// es parte recibe «no encontrado», igual que si el servicio no existiera (no se revela que existe, IDOR), y el
// intento queda auditado.
export class AccesoAServicios {
  constructor(
    private readonly servicios: RepositorioServicios,
    private readonly directorio: ConsultaDeDirectorio,
    private readonly auditoria: Auditoria,
  ) {}

  // `bloquear` toma la fila para actualizarla: solo dentro de una unidad de trabajo.
  async cargar(
    servicioId: string,
    usuarioId: string,
    rol: RolConAcceso,
    accion: string,
    bloquear = false,
  ): Promise<Servicio> {
    const id = servicioId as ServicioId;
    const servicio = bloquear
      ? await this.servicios.buscarPorIdParaActualizar(id)
      : await this.servicios.buscarPorId(id);
    if (servicio === null || !(await this.esParte(servicio, usuarioId, rol))) {
      await this.auditoria.registrar({
        actorId: usuarioId,
        accion,
        recursoTipo: 'servicio',
        recursoId: servicioId,
        resultado: 'denegado',
      });
      throw new RecursoNoEncontrado(
        'No encontramos ese servicio',
        'servicio.no_encontrado',
      );
    }
    return servicio;
  }

  async esParte(
    servicio: Servicio,
    usuarioId: string,
    rol: RolConAcceso,
  ): Promise<boolean> {
    if (rol === 'familiar') return servicio.familiarId === usuarioId;
    const cuidador = await this.directorio.obtenerCuidadorPorUsuario(usuarioId);
    return cuidador?.cuidadorId === servicio.cuidadorId;
  }
}
