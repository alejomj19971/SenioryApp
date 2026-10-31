import type { ManejadorDeEventos } from '../../../compartido/aplicacion/puertos/manejador-de-eventos.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import { RecursoNoEncontrado } from '../../../compartido/dominio/errores.js';
import type { ServicioCalificado } from '../../../compartido/eventos/reservas.js';
import type { ConsultaDeIdentidad } from '../../../identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import type { CuidadorId } from '../../dominio/ids.js';
import { Resena } from '../../dominio/resena.js';
import type { RepositorioCuidadores } from '../puertos/salida/repositorio-cuidadores.js';
import type { RepositorioResenas } from '../puertos/salida/repositorio-resenas.js';

// Cuando la familia califica un servicio terminado (Reservas), el cuidador recibe su reseña y su promedio
// se actualiza. El despachador lo corre en una transacción propia y ya garantiza «una vez por evento»; aun
// así es idempotente por servicio (una reseña por servicio), porque un evento reenviado con otro
// identificador no debe contar dos veces.
export class RegistrarResenaAlCalificar implements ManejadorDeEventos<ServicioCalificado> {
  readonly nombre = 'directorio.registrar_resena';
  readonly tipo = 'reservas.servicio_calificado';

  constructor(
    private readonly cuidadores: RepositorioCuidadores,
    private readonly resenas: RepositorioResenas,
    private readonly identidad: ConsultaDeIdentidad,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
  ) {}

  async manejar(evento: ServicioCalificado): Promise<void> {
    const datos = evento.datos;
    // Se bloquea al cuidador ANTES de mirar si la reseña existe: dos calificaciones simultáneas del mismo
    // cuidador se atienden una tras otra y no pisan los contadores del promedio.
    const cuidador = await this.cuidadores.buscarPorIdParaActualizar(
      datos.cuidadorId as CuidadorId,
    );
    if (cuidador === null) {
      // No hay a quién ponerle la reseña: se falla para que el evento quede marcado como fallido y
      // alguien lo revise, en vez de perderlo en silencio.
      throw new RecursoNoEncontrado(
        'El cuidador calificado no existe',
        'cuidador.no_encontrado',
      );
    }
    if (await this.resenas.existeParaServicio(datos.servicioId)) return;

    const ahora = this.reloj.ahora();
    // Si la cuenta de quien calificó ya no existe, la reseña se muestra como «Una familia».
    const autor = await this.identidad.obtenerContacto(datos.familiarId);
    const resena = Resena.crear({
      id: this.ids.nuevo<'Resena'>(),
      cuidadorId: cuidador.id,
      servicioId: datos.servicioId,
      nombreDelAutor: autor?.nombre ?? '',
      calificacion: datos.calificacion,
      comentario: datos.comentario,
      ahora,
    });
    await this.resenas.guardar(resena);
    cuidador.registrarResena(datos.calificacion, ahora);
    await this.cuidadores.actualizar(cuidador);
  }
}
