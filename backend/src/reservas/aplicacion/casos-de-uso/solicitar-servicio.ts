import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import {
  ConflictoDeEstado,
  ErrorDeValidacion,
  RecursoNoEncontrado,
  ReglaDeNegocioIncumplida,
} from '../../../compartido/dominio/errores.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import { esJornada } from '../../../compartido/dominio/jornada.js';
import type { ConsultaDeDirectorio } from '../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import type { ConsultaDeIdentidad } from '../../../identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import type { CotizadorDeServicios } from '../../../pagos/aplicacion/puertos/entrada/cotizador-de-servicios.js';
import type { ServicioId } from '../../dominio/ids.js';
import { Servicio } from '../../dominio/servicio.js';
import { medioDePagoDesdeTexto } from '../../dominio/valores-cerrados.js';
import type { RepositorioServicios } from '../puertos/salida/repositorio-servicios.js';
import {
  participantesDe,
  type EventosDeReservas,
} from '../servicios/eventos-de-reservas.js';

export interface EntradaDeSolicitud {
  adultoMayorId: string;
  cuidadorId: string;
  // "AAAA-MM-DD", el día civil en la zona del negocio.
  fecha: string;
  jornada: string;
  horas: number;
  medioDePago: string;
}

export interface ResultadoDeSolicitud {
  servicio: Servicio;
  // Falso cuando es el reintento de una solicitud ya hecha con la misma clave: devuelve el mismo servicio.
  creado: boolean;
}

// La familia pide un servicio a un cuidador. El monto lo calcula el servidor (el cliente nunca lo envía) y
// queda congelado en el servicio. Por defecto el cuidador debe aceptar; si activó la aceptación automática,
// nace aceptado.
//
// `claveDeIdempotencia` (encabezado `Idempotency-Key`) hace que un reintento (se cayó la red, se pulsó dos
// veces) devuelva el servicio ya creado en lugar de crear otro.
export class SolicitarServicio {
  constructor(
    private readonly servicios: RepositorioServicios,
    private readonly identidad: ConsultaDeIdentidad,
    private readonly directorio: ConsultaDeDirectorio,
    private readonly cotizador: CotizadorDeServicios,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeReservas,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
    private readonly zonaHoraria: string,
  ) {}

  async ejecutar(
    familiarId: string,
    entrada: EntradaDeSolicitud,
    claveDeIdempotencia: string,
  ): Promise<ResultadoDeSolicitud> {
    const fecha = FechaCivil.desdeTexto(entrada.fecha);
    if (!esJornada(entrada.jornada)) {
      throw new ErrorDeValidacion(
        'La jornada no es válida',
        'servicio.jornada_invalida',
      );
    }
    const medioDePago = medioDePagoDesdeTexto(entrada.medioDePago);
    if (medioDePago === null) {
      throw new ErrorDeValidacion(
        'El medio de pago no es válido',
        'servicio.medio_de_pago_invalido',
      );
    }
    const solicitud = { ...entrada, fecha, medioDePago };

    // Primero el reintento: si ya se creó, se devuelve tal cual aunque hoy el cuidador ya no esté disponible.
    const previo = await this.servicios.buscarPorClave(
      familiarId,
      claveDeIdempotencia,
    );
    if (previo !== null) return this.repetir(previo, solicitud);

    await this.exigirVinculoYConsentimiento(familiarId, entrada.adultoMayorId);
    const cuidador = await this.directorio.obtenerCuidadorParaContratar(
      entrada.cuidadorId,
    );
    if (cuidador === null) {
      throw new RecursoNoEncontrado(
        'No encontramos a ese cuidador',
        'cuidador.no_encontrado',
      );
    }
    if (!cuidador.disponibilidad.includes(entrada.jornada)) {
      throw new ReglaDeNegocioIncumplida(
        `${cuidador.nombre} no atiende en esa jornada`,
        'servicio.jornada_no_disponible',
      );
    }
    const cotizacion = await this.cotizador.cotizar(
      entrada.cuidadorId,
      entrada.horas,
    );

    const ahora = this.reloj.ahora();
    const servicio = Servicio.solicitar({
      id: this.ids.nuevo<'Servicio'>() as ServicioId,
      familiarId,
      adultoMayorId: entrada.adultoMayorId,
      cuidadorId: entrada.cuidadorId,
      fecha,
      jornada: entrada.jornada,
      horas: entrada.horas,
      medioDePago,
      aceptacionAutomatica: cuidador.aceptacionAutomatica,
      tarifaHora: cotizacion.tarifaHora,
      subtotal: cotizacion.subtotal,
      cargoFamilia: cotizacion.cargoFamilia,
      totalFamilia: cotizacion.totalFamilia,
      pagoProfesional: cotizacion.pagoProfesional,
      politicaVersion: cotizacion.politicaVersion,
      claveDeIdempotencia,
      hoy: FechaCivil.hoy(this.reloj, this.zonaHoraria),
      ahora,
      zonaHoraria: this.zonaHoraria,
    });

    try {
      await this.unidadDeTrabajo.ejecutar(async () => {
        // Lanza `servicio.franja_ocupada` si dos familias piden a la vez el mismo cuidador y franja: gana una.
        await this.servicios.guardar(servicio);
        await this.eventos.publicar(
          'reservas.servicio_solicitado',
          participantesDe(servicio),
          ahora,
        );
        if (servicio.estado === 'aceptado') {
          await this.eventos.publicar(
            'reservas.servicio_confirmado',
            participantesDe(servicio),
            ahora,
          );
        }
      });
    } catch (error) {
      // Dos reintentos simultáneos con la misma clave: el segundo pierde la carrera y devuelve el del primero.
      if (
        error instanceof ConflictoDeEstado &&
        error.codigo === 'servicio.clave_repetida'
      ) {
        const ganador = await this.servicios.buscarPorClave(
          familiarId,
          claveDeIdempotencia,
        );
        if (ganador !== null) return this.repetir(ganador, solicitud);
      }
      throw error;
    }

    await this.auditoria.registrar({
      actorId: familiarId,
      accion: 'reservas.solicitar_servicio',
      recursoTipo: 'servicio',
      recursoId: servicio.id,
      resultado: 'permitido',
    });
    return { servicio, creado: true };
  }

  // La persona mayor es de quien pide, y hay consentimiento vigente para tratar sus datos de salud. Quien no
  // está vinculado recibe «no encontrado», igual que si la persona no existiera (IDOR).
  private async exigirVinculoYConsentimiento(
    familiarId: string,
    adultoMayorId: string,
  ): Promise<void> {
    if (
      !(await this.identidad.esFamiliarVinculado(familiarId, adultoMayorId))
    ) {
      await this.auditoria.registrar({
        actorId: familiarId,
        accion: 'reservas.solicitar_servicio',
        recursoTipo: 'adulto_mayor',
        recursoId: adultoMayorId,
        resultado: 'denegado',
      });
      throw new RecursoNoEncontrado(
        'No encontramos a esa persona',
        'adulto_mayor.no_encontrado',
      );
    }
    if (
      !(await this.identidad.tieneConsentimientoVigente(
        adultoMayorId,
        'datos_de_salud',
      ))
    ) {
      throw new ReglaDeNegocioIncumplida(
        'Falta el consentimiento para tratar los datos de salud de esta persona',
        'servicio.sin_consentimiento',
      );
    }
  }

  // El mismo reintento devuelve el mismo servicio; la misma clave con otra solicitud es un error.
  private repetir(
    previo: Servicio,
    solicitud: {
      adultoMayorId: string;
      cuidadorId: string;
      fecha: FechaCivil;
      jornada: string;
      horas: number;
      medioDePago: string;
    },
  ): ResultadoDeSolicitud {
    const igual =
      previo.adultoMayorId === solicitud.adultoMayorId &&
      previo.cuidadorId === solicitud.cuidadorId &&
      previo.fecha.igualA(solicitud.fecha) &&
      previo.jornada === solicitud.jornada &&
      previo.horas === solicitud.horas &&
      previo.medioDePago === solicitud.medioDePago;
    if (!igual) {
      throw new ConflictoDeEstado(
        'Esa clave de idempotencia ya se usó con otra solicitud',
        'servicio.clave_reutilizada',
      );
    }
    return { servicio: previo, creado: false };
  }
}
