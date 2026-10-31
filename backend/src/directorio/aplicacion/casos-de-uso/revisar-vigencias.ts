import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import type { CuidadorId } from '../../dominio/ids.js';
import type { RepositorioCuidadores } from '../puertos/salida/repositorio-cuidadores.js';
import type { EventosDeDirectorio } from '../servicios/eventos-de-directorio.js';

export interface ResultadoDeRevision {
  ocultados: number;
}

// La revisión diaria: a quien se le venció un control (antecedentes, títulos o psicotécnica) deja de
// mostrarse en las búsquedas, y Reservas se entera con `directorio.cuidador_oculto`. Corre desde la consola
// del servidor (`npm run cuidadores:revisar-vigencias`) y debe programarse cada día (cron del hosting).
// Mientras no corra, la lectura individual igual rechaza a quien tenga un control vencido.
export class RevisarVigencias {
  constructor(
    private readonly cuidadores: RepositorioCuidadores,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeDirectorio,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly zonaHorariaNegocio: string,
  ) {}

  async ejecutar(): Promise<ResultadoDeRevision> {
    const hoy = FechaCivil.hoy(this.reloj, this.zonaHorariaNegocio);
    const candidatos =
      await this.cuidadores.listarIdsVisiblesConControlVencido(hoy);
    let ocultados = 0;
    for (const id of candidatos) {
      // Una transacción por cuidador: si uno falla, los demás ya quedaron ocultos.
      if (await this.ocultar(id, hoy)) ocultados += 1;
    }
    return { ocultados };
  }

  private ocultar(id: CuidadorId, hoy: FechaCivil): Promise<boolean> {
    return this.unidadDeTrabajo.ejecutar(async () => {
      // Se vuelve a leer con la fila bloqueada: entre la lista y aquí pudieron renovarle el control.
      const cuidador = await this.cuidadores.buscarPorIdParaActualizar(id);
      if (cuidador === null) return false;
      const ahora = this.reloj.ahora();
      const cambio = cuidador.recalcularVisibilidad(hoy, ahora);
      if (cambio !== 'oculto') return false;
      await this.cuidadores.actualizar(cuidador);
      await this.eventos.publicar(
        'directorio.cuidador_oculto',
        { cuidadorId: cuidador.id },
        ahora,
      );
      await this.auditoria.registrar({
        actorId: null,
        accion: 'directorio.ocultar_por_vigencia',
        recursoTipo: 'cuidador',
        recursoId: cuidador.id,
        resultado: 'permitido',
      });
      return true;
    });
  }
}
