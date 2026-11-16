import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { ConflictoDeEstado } from '../../../compartido/dominio/errores.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import type { ServicioId } from '../../dominio/ids.js';
import type { RepositorioServicios } from '../puertos/salida/repositorio-servicios.js';
import {
  participantesDe,
  type EventosDeReservas,
} from '../servicios/eventos-de-reservas.js';

export const ACEPTADOS_POR_VUELTA = 100;

export interface ResultadoDeNoShows {
  canceladas: number;
  // Las que fallaron por un error inesperado: se reintentan en la vuelta siguiente.
  fallidas: number;
}

// La tarea programada: cancela (motivo «no_show») los servicios que quedaron «aceptado» sin que nadie
// marcara que inició, una vez que su franja ya terminó. Antes de esto, un cuidador que no llegaba ni
// avisaba dejaba el servicio huérfano para siempre: la familia tenía que notar que nadie llegó y cancelar
// ella misma para recuperar su dinero. Cada servicio va en su propia transacción: uno que falle no frena a
// los demás. Es segura si dos instancias corren a la vez: se bloquea la fila y se vuelve a comprobar.
export class DetectarNoShows {
  constructor(
    private readonly servicios: RepositorioServicios,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeReservas,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly zonaHoraria: string,
  ) {}

  async ejecutar(): Promise<ResultadoDeNoShows> {
    // Filtro amplio por fecha civil: basta con «hoy» porque la franja más larga (la noche) termina a
    // las 6 a. m. del día siguiente, y un servicio de hoy en la noche ya tiene fecha = hoy.
    const hoy = FechaCivil.hoy(this.reloj, this.zonaHoraria);
    const candidatos = await this.servicios.listarAceptadosHasta(
      hoy,
      ACEPTADOS_POR_VUELTA,
    );
    let canceladas = 0;
    let fallidas = 0;
    for (const id of candidatos) {
      try {
        if (await this.cancelar(id)) canceladas += 1;
      } catch {
        fallidas += 1;
      }
    }
    return { canceladas, fallidas };
  }

  private async cancelar(id: ServicioId): Promise<boolean> {
    const cancelado = await this.unidadDeTrabajo.ejecutar(async () => {
      const servicio = await this.servicios.buscarPorIdParaActualizar(id);
      // Entre la lista y aquí el cuidador pudo iniciarlo, o alguien cancelarlo: ya no hay nada que marcar.
      if (servicio?.estado !== 'aceptado') return null;
      const ahora = this.reloj.ahora();
      try {
        servicio.marcarNoShow(ahora, this.zonaHoraria);
      } catch (error) {
        if (error instanceof ConflictoDeEstado) return null;
        throw error;
      }
      await this.servicios.actualizar(servicio);
      await this.eventos.publicar(
        'reservas.servicio_cancelado',
        {
          ...participantesDe(servicio),
          motivo: 'no_show',
          horasDeAnticipacion: null,
        },
        ahora,
      );
      return servicio;
    });
    if (cancelado === null) return false;
    await this.auditoria.registrar({
      actorId: null,
      accion: 'reservas.detectar_no_show',
      recursoTipo: 'servicio',
      recursoId: cancelado.id,
      resultado: 'permitido',
    });
    return true;
  }
}
