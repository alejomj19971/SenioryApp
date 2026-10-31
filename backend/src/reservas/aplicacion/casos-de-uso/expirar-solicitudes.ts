import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { ConflictoDeEstado } from '../../../compartido/dominio/errores.js';
import type { ServicioId } from '../../dominio/ids.js';
import type { RepositorioServicios } from '../puertos/salida/repositorio-servicios.js';
import {
  participantesDe,
  type EventosDeReservas,
} from '../servicios/eventos-de-reservas.js';

export const SOLICITUDES_POR_VUELTA = 100;

export interface ResultadoDeExpiracion {
  expiradas: number;
  // Las que fallaron por un error inesperado: se reintentan en la vuelta siguiente.
  fallidas: number;
}

// La tarea programada: cancela con motivo «expirada» las solicitudes que el cuidador no respondió a tiempo, y
// avisa (`servicio_cancelado`) para que la familia elija a otro. Cada solicitud va en su propia transacción:
// una que falle no frena a las demás. Es segura si dos instancias corren a la vez: se bloquea la fila y se
// vuelve a comprobar el estado.
export class ExpirarSolicitudes {
  constructor(
    private readonly servicios: RepositorioServicios,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeReservas,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(): Promise<ResultadoDeExpiracion> {
    const vencidas = await this.servicios.listarSolicitudesVencidas(
      this.reloj.ahora(),
      SOLICITUDES_POR_VUELTA,
    );
    let expiradas = 0;
    let fallidas = 0;
    for (const id of vencidas) {
      try {
        if (await this.expirar(id)) expiradas += 1;
      } catch {
        fallidas += 1;
      }
    }
    return { expiradas, fallidas };
  }

  private async expirar(id: ServicioId): Promise<boolean> {
    const expirado = await this.unidadDeTrabajo.ejecutar(async () => {
      const servicio = await this.servicios.buscarPorIdParaActualizar(id);
      // Entre la lista y aquí el cuidador pudo aceptar, o la familia cancelar: ya no hay nada que expirar.
      if (servicio?.estado !== 'solicitado') return null;
      const ahora = this.reloj.ahora();
      try {
        servicio.expirar(ahora);
      } catch (error) {
        if (error instanceof ConflictoDeEstado) return null;
        throw error;
      }
      await this.servicios.actualizar(servicio);
      await this.eventos.publicar(
        'reservas.servicio_cancelado',
        {
          ...participantesDe(servicio),
          motivo: 'expirada',
          horasDeAnticipacion: null,
        },
        ahora,
      );
      return servicio;
    });
    if (expirado === null) return false;
    await this.auditoria.registrar({
      actorId: null,
      accion: 'reservas.expirar_solicitud',
      recursoTipo: 'servicio',
      recursoId: expirado.id,
      resultado: 'permitido',
    });
    return true;
  }
}
