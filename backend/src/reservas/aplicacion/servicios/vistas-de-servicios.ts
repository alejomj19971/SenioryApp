import type { ConsultaDeDirectorio } from '../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import type { ConsultaDeIdentidad } from '../../../identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import type { Calificacion } from '../../dominio/calificacion.js';
import type { Servicio } from '../../dominio/servicio.js';
import type { RepositorioCalificaciones } from '../puertos/salida/repositorio-calificaciones.js';
import type {
  VistaBasica,
  VistaDeServicio,
  VistaDeServicioParaCuidador,
  VistaDeServicioParaFamilia,
} from '../vistas.js';
import type { RolConAcceso } from './acceso-a-servicios.js';

const aTexto = (fecha: Date | null): string | null =>
  fecha === null ? null : fecha.toISOString();

// Arma lo que ve cada parte del servicio, con los nombres que viven en otros módulos (por sus puertos de
// entrada). Cada persona se consulta una sola vez aunque aparezca en varios servicios de la lista.
export class VistasDeServicios {
  constructor(
    private readonly identidad: ConsultaDeIdentidad,
    private readonly directorio: ConsultaDeDirectorio,
    private readonly calificaciones: RepositorioCalificaciones,
  ) {}

  async paraFamilia(
    servicios: readonly Servicio[],
  ): Promise<VistaDeServicioParaFamilia[]> {
    const basicas = await this.basicas(servicios);
    return servicios.map((servicio, i) => ({
      ...(basicas[i] as VistaBasica),
      tarifaHora: servicio.tarifaHora,
      subtotal: servicio.subtotal,
      cargoDeServicio: servicio.cargoFamilia,
      totalFamilia: servicio.totalFamilia,
      politicaVersion: servicio.politicaVersion,
    }));
  }

  async paraCuidador(
    servicios: readonly Servicio[],
  ): Promise<VistaDeServicioParaCuidador[]> {
    const basicas = await this.basicas(servicios);
    return servicios.map((servicio, i) => ({
      ...(basicas[i] as VistaBasica),
      tarifaHora: servicio.tarifaHora,
      pagoProfesional: servicio.pagoProfesional,
    }));
  }

  async de(
    servicios: readonly Servicio[],
    rol: RolConAcceso,
  ): Promise<VistaDeServicio[]> {
    return rol === 'familiar'
      ? this.paraFamilia(servicios)
      : this.paraCuidador(servicios);
  }

  private async basicas(
    servicios: readonly Servicio[],
  ): Promise<VistaBasica[]> {
    const adultos = await this.porId(
      servicios.map((s) => s.adultoMayorId),
      async (id) => {
        const adulto = await this.identidad.obtenerAdultoMayor(id);
        return adulto === null
          ? null
          : { id: adulto.id, nombre: adulto.nombre, edad: adulto.edad };
      },
    );
    const cuidadores = await this.porId(
      servicios.map((s) => s.cuidadorId),
      async (id) => {
        const contacto = await this.directorio.obtenerContactoDeCuidador(id);
        return contacto === null
          ? null
          : { id: contacto.cuidadorId, nombre: contacto.nombre };
      },
    );
    const calificadas = await this.calificaciones.buscarPorServicios(
      servicios.map((s) => s.id),
    );
    return servicios.map((servicio) => ({
      id: servicio.id,
      estado: servicio.estado,
      fecha: servicio.fecha.aTexto(),
      jornada: servicio.jornada,
      horas: servicio.horas,
      medioDePago: servicio.medioDePago,
      solicitudExpiraEn: aTexto(servicio.solicitudExpiraEn),
      cuidador: cuidadores.get(servicio.cuidadorId) ?? null,
      adultoMayor: adultos.get(servicio.adultoMayorId) ?? null,
      solicitadoEn: servicio.solicitadoEn.toISOString(),
      aceptadoEn: aTexto(servicio.aceptadoEn),
      iniciadoEn: aTexto(servicio.iniciadoEn),
      finalizadoEn: aTexto(servicio.finalizadoEn),
      canceladoEn: aTexto(servicio.canceladoEn),
      motivoDeCancelacion: servicio.motivoDeCancelacion,
      calificacion: vistaDeCalificacion(calificadas.get(servicio.id)),
    }));
  }

  private async porId<T>(
    ids: readonly string[],
    buscar: (id: string) => Promise<T | null>,
  ): Promise<Map<string, T | null>> {
    const unicos = [...new Set(ids)];
    const resultados = await Promise.all(unicos.map(buscar));
    return new Map(unicos.map((id, i) => [id, resultados[i] ?? null]));
  }
}

function vistaDeCalificacion(calificacion: Calificacion | undefined) {
  return calificacion === undefined
    ? null
    : {
        calificacion: calificacion.calificacion,
        comentario: calificacion.comentario,
      };
}
