import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import { RecursoNoEncontrado } from '../../../compartido/dominio/errores.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import type { ConsultaDeDirectorio } from '../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import type { ConsultaDeIdentidad } from '../../../identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import {
  codificarCursor,
  decodificarCursor,
  limiteDe,
} from '../../dominio/cursor-de-servicios.js';
import {
  ESTADOS_DE_SERVICIO,
  type EstadoDeServicio,
} from '../../dominio/valores-cerrados.js';
import { ErrorDeValidacion } from '../../../compartido/dominio/errores.js';
import type { RepositorioServicios } from '../puertos/salida/repositorio-servicios.js';
import type {
  AccesoAServicios,
  RolConAcceso,
} from '../servicios/acceso-a-servicios.js';
import type { VistasDeServicios } from '../servicios/vistas-de-servicios.js';
import type {
  PaginaDeVistasDeServicios,
  VistaDeCuidadorEnTurno,
  VistaDeServicio,
} from '../vistas.js';

export interface Consultante {
  usuarioId: string;
  rol: RolConAcceso;
}

export interface EntradaDeListadoDeServicios {
  estado?: string;
  limite?: number;
  cursor?: string;
}

// Un servicio, visto por quien es parte de él. Los demás reciben «no encontrado».
export class ObtenerServicio {
  constructor(
    private readonly acceso: AccesoAServicios,
    private readonly vistas: VistasDeServicios,
  ) {}

  async ejecutar(
    consultante: Consultante,
    servicioId: string,
  ): Promise<VistaDeServicio> {
    const servicio = await this.acceso.cargar(
      servicioId,
      consultante.usuarioId,
      consultante.rol,
      'reservas.consultar_servicio',
    );
    const [vista] = await this.vistas.de([servicio], consultante.rol);
    return vista as VistaDeServicio;
  }
}

// «Mis servicios»: los de la familia que pregunta, o los del cuidador que pregunta, los más recientes primero.
export class ListarMisServicios {
  constructor(
    private readonly servicios: RepositorioServicios,
    private readonly directorio: ConsultaDeDirectorio,
    private readonly vistas: VistasDeServicios,
  ) {}

  async ejecutar(
    consultante: Consultante,
    entrada: EntradaDeListadoDeServicios,
  ): Promise<PaginaDeVistasDeServicios> {
    const limite = limiteDe(entrada.limite);
    const cursor =
      entrada.cursor === undefined || entrada.cursor === ''
        ? null
        : decodificarCursor(entrada.cursor);
    const estado = estadoOpcional(entrada.estado);
    const filtro = estado === undefined ? {} : { estado };

    let pagina;
    if (consultante.rol === 'familiar') {
      pagina = await this.servicios.listarDe(
        { tipo: 'familiar', familiarId: consultante.usuarioId },
        filtro,
        limite,
        cursor,
      );
    } else {
      const cuidador = await this.directorio.obtenerCuidadorPorUsuario(
        consultante.usuarioId,
      );
      pagina =
        cuidador === null
          ? { servicios: [], siguiente: null }
          : await this.servicios.listarDe(
              { tipo: 'cuidador', cuidadorId: cuidador.cuidadorId },
              filtro,
              limite,
              cursor,
            );
    }
    return {
      servicios: await this.vistas.de(pagina.servicios, consultante.rol),
      siguiente:
        pagina.siguiente === null ? null : codificarCursor(pagina.siguiente),
    };
  }
}

function estadoOpcional(
  texto: string | undefined,
): EstadoDeServicio | undefined {
  if (texto === undefined || texto === '') return undefined;
  const estado = ESTADOS_DE_SERVICIO.find((e) => e === texto);
  if (estado === undefined) {
    throw new ErrorDeValidacion(
      'El estado no es válido',
      'servicio.estado_invalido',
    );
  }
  return estado;
}

// El cuidador que está atendiendo ahora a una persona mayor (H4): su servicio está aceptado o en curso y su
// franja contiene el momento actual. Es la ÚNICA ruta que entrega el teléfono del cuidador, y solo a la
// familia vinculada. Sin cuidador en turno responde `null`, no un error.
export class ObtenerCuidadorEnTurno {
  constructor(
    private readonly servicios: RepositorioServicios,
    private readonly identidad: ConsultaDeIdentidad,
    private readonly directorio: ConsultaDeDirectorio,
    private readonly vistas: VistasDeServicios,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly zonaHoraria: string,
  ) {}

  async ejecutar(
    familiarId: string,
    adultoMayorId: string,
  ): Promise<VistaDeCuidadorEnTurno | null> {
    if (
      !(await this.identidad.esFamiliarVinculado(familiarId, adultoMayorId))
    ) {
      await this.auditoria.registrar({
        actorId: familiarId,
        accion: 'reservas.consultar_cuidador_en_turno',
        recursoTipo: 'adulto_mayor',
        recursoId: adultoMayorId,
        resultado: 'denegado',
      });
      throw new RecursoNoEncontrado(
        'No encontramos a esa persona',
        'adulto_mayor.no_encontrado',
      );
    }
    const ahora = this.reloj.ahora();
    // Desde ayer: la noche de ayer sigue en curso hasta las 06:00 de hoy.
    const desde = FechaCivil.hoy(this.reloj, this.zonaHoraria).sumarDias(-1);
    const activos = await this.servicios.listarActivosDeAdultoMayor(
      adultoMayorId,
      desde,
    );
    const enTurno = activos.find((s) => s.estaEnTurno(ahora, this.zonaHoraria));
    if (enTurno === undefined) return null;

    const contacto = await this.directorio.obtenerContactoDeCuidador(
      enTurno.cuidadorId,
    );
    if (contacto === null) return null;
    const [servicio] = await this.vistas.paraFamilia([enTurno]);
    await this.auditoria.registrar({
      actorId: familiarId,
      accion: 'reservas.consultar_cuidador_en_turno',
      recursoTipo: 'adulto_mayor',
      recursoId: adultoMayorId,
      resultado: 'permitido',
    });
    return {
      servicio: servicio as NonNullable<typeof servicio>,
      cuidador: {
        id: contacto.cuidadorId,
        nombre: contacto.nombre,
        telefono: contacto.telefono,
        fotoUrl: contacto.fotoUrl,
        especialidad: contacto.especialidad,
      },
    };
  }
}
