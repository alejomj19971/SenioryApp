import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { ConflictoDeEstado } from '../../../compartido/dominio/errores.js';
import { Calificacion } from '../../dominio/calificacion.js';
import type { RepositorioCalificaciones } from '../puertos/salida/repositorio-calificaciones.js';
import type { AccesoAServicios } from '../servicios/acceso-a-servicios.js';
import type { EventosDeReservas } from '../servicios/eventos-de-reservas.js';

export interface EntradaDeCalificacion {
  calificacion: number;
  comentario?: string | null;
}

// La familia que contrató califica el servicio ya terminado, una sola vez. Publica `servicio_calificado`: con
// él Directorio crea la reseña y recalcula el promedio del cuidador.
export class CalificarServicio {
  constructor(
    private readonly acceso: AccesoAServicios,
    private readonly calificaciones: RepositorioCalificaciones,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeReservas,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    familiarId: string,
    servicioId: string,
    entrada: EntradaDeCalificacion,
  ): Promise<Calificacion> {
    const calificacion = await this.unidadDeTrabajo.ejecutar(async () => {
      const servicio = await this.acceso.cargar(
        servicioId,
        familiarId,
        'familiar',
        'reservas.calificar_servicio',
        true,
      );
      if (servicio.estado !== 'finalizado') {
        throw new ConflictoDeEstado(
          'Solo se puede calificar un servicio que ya terminó',
          'servicio.no_finalizado',
        );
      }
      const ahora = this.reloj.ahora();
      const nueva = Calificacion.crear({
        servicioId: servicio.id,
        familiarId,
        calificacion: entrada.calificacion,
        comentario: entrada.comentario ?? null,
        creadaEn: ahora,
      });
      // Lanza `calificacion.ya_existe` si ya se calificó; la transacción se revierte entera.
      await this.calificaciones.guardar(nueva);
      await this.eventos.publicar(
        'reservas.servicio_calificado',
        {
          servicioId: servicio.id,
          cuidadorId: servicio.cuidadorId,
          familiarId,
          calificacion: nueva.calificacion,
          comentario: nueva.comentario,
        },
        ahora,
      );
      return nueva;
    });
    await this.auditoria.registrar({
      actorId: familiarId,
      accion: 'reservas.calificar_servicio',
      recursoTipo: 'servicio',
      recursoId: servicioId,
      resultado: 'permitido',
    });
    return calificacion;
  }
}
