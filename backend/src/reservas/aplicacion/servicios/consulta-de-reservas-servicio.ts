import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import type { ConsultaDeDirectorio } from '../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import type { ServicioId } from '../../dominio/ids.js';
import type {
  ConsultaDeReservas,
  ParticipantesDelServicio,
  ResumenDeServicio,
} from '../puertos/entrada/consulta-de-reservas.js';
import type { RepositorioServicios } from '../puertos/salida/repositorio-servicios.js';

// Implementa lo que Reservas ofrece a los demás módulos. Los IDs llegan como texto porque el llamador no conoce
// los tipos de este módulo.
export class ConsultaDeReservasServicio implements ConsultaDeReservas {
  constructor(
    private readonly servicios: RepositorioServicios,
    private readonly directorio: ConsultaDeDirectorio,
    private readonly reloj: Reloj,
    private readonly zonaHoraria: string,
  ) {}

  async obtenerServicio(servicioId: string): Promise<ResumenDeServicio | null> {
    const servicio = await this.servicios.buscarPorId(servicioId as ServicioId);
    if (servicio === null) return null;
    return {
      id: servicio.id,
      familiarId: servicio.familiarId,
      adultoMayorId: servicio.adultoMayorId,
      cuidadorId: servicio.cuidadorId,
      estado: servicio.estado,
      fecha: servicio.fecha.aTexto(),
      jornada: servicio.jornada,
      horas: servicio.horas,
    };
  }

  async cuidadorTieneServicioActivo(
    cuidadorId: string,
    adultoMayorId: string,
  ): Promise<boolean> {
    const ahora = this.reloj.ahora();
    // Desde ayer: la noche de ayer sigue en curso hasta las 06:00 de hoy.
    const desde = FechaCivil.hoy(this.reloj, this.zonaHoraria).sumarDias(-1);
    const activos = await this.servicios.listarActivosDeAdultoMayor(
      adultoMayorId,
      desde,
    );
    return activos.some(
      (servicio) =>
        servicio.cuidadorId === cuidadorId &&
        (servicio.estado === 'en_curso' ||
          servicio.estaEnTurno(ahora, this.zonaHoraria)),
    );
  }

  async obtenerCuidadorEnTurno(
    adultoMayorId: string,
  ): Promise<{ cuidadorId: string; cuidadorUsuarioId: string | null } | null> {
    const ahora = this.reloj.ahora();
    // Desde ayer: la noche de ayer sigue en curso hasta las 06:00 de hoy.
    const desde = FechaCivil.hoy(this.reloj, this.zonaHoraria).sumarDias(-1);
    const activos = await this.servicios.listarActivosDeAdultoMayor(
      adultoMayorId,
      desde,
    );
    const enTurno = activos.find(
      (servicio) =>
        servicio.estado === 'en_curso' ||
        servicio.estaEnTurno(ahora, this.zonaHoraria),
    );
    if (enTurno === undefined) return null;
    const contacto = await this.directorio.obtenerContactoDeCuidador(
      enTurno.cuidadorId,
    );
    return {
      cuidadorId: enTurno.cuidadorId,
      cuidadorUsuarioId: contacto?.usuarioId ?? null,
    };
  }

  async obtenerParticipantes(
    servicioId: string,
  ): Promise<ParticipantesDelServicio | null> {
    const servicio = await this.servicios.buscarPorId(servicioId as ServicioId);
    if (servicio === null) return null;
    const contacto = await this.directorio.obtenerContactoDeCuidador(
      servicio.cuidadorId,
    );
    return {
      servicioId: servicio.id,
      familiarId: servicio.familiarId,
      cuidadorId: servicio.cuidadorId,
      cuidadorUsuarioId: contacto?.usuarioId ?? null,
    };
  }
}
