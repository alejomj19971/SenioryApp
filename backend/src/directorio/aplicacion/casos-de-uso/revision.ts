import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import type { UsuarioAutenticado } from '../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import {
  ConflictoDeEstado,
  ErrorDeValidacion,
  RecursoNoEncontrado,
  ReglaDeNegocioIncumplida,
  ServicioNoDisponible,
} from '../../../compartido/dominio/errores.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import type { Cuidador } from '../../dominio/cuidador.js';
import type { Documento } from '../../dominio/documento.js';
import type {
  CuidadorId,
  DocumentoId,
  VerificacionId,
} from '../../dominio/ids.js';
import {
  CONTROLES_DE_VERIFICACION,
  DOCUMENTO_DE_CADA_CONTROL,
  type ControlDeVerificacion,
  type EstadoDeVerificacion,
} from '../../dominio/valores-cerrados.js';
import type { AlmacenDeArchivos } from '../puertos/salida/almacen-de-archivos.js';
import type { RepositorioCuidadores } from '../puertos/salida/repositorio-cuidadores.js';
import type { RepositorioDocumentos } from '../puertos/salida/repositorio-documentos.js';
import type { EventosDeDirectorio } from '../servicios/eventos-de-directorio.js';
import {
  vistaDeControlParaRevisor,
  vistaDeDocumento,
  type VistaDeCuidadorParaRevisor,
  type VistaDeDocumento,
  type VistaDeVerificacionParaRevisor,
} from '../vistas-de-postulacion.js';

export const VERIFICACIONES_EN_LA_COLA = 50;
// Cuánto dura la dirección con que el revisor abre un documento privado: lo justo para abrirlo.
export const VIGENCIA_DEL_DOCUMENTO_PARA_REVISOR_SEGUNDOS = 120;
// Los antecedentes y la psicotécnica caducan: el revisor debe decir hasta cuándo valen. Ninguna vigencia pasa de
// aquí (decisión abierta del negocio; propuesta provisional).
const ANIOS_MAXIMOS_DE_VIGENCIA = 5;
const CONTROLES_QUE_CADUCAN: readonly ControlDeVerificacion[] = [
  'antecedentes',
  'psicotecnica',
];

export type DecisionDelRevisor =
  | { decision: 'aprobar'; vigenteHasta: string | null }
  | { decision: 'rechazar'; motivo: string };

// La cola de los revisores: las verificaciones en ese estado (por defecto, las pendientes), las más antiguas primero,
// con quién las pidió y los documentos que hay que mirar.
export class ListarVerificaciones {
  constructor(
    private readonly cuidadores: RepositorioCuidadores,
    private readonly documentos: RepositorioDocumentos,
  ) {}

  async ejecutar(
    estado: EstadoDeVerificacion = 'pendiente',
  ): Promise<VistaDeVerificacionParaRevisor[]> {
    const cola = await this.cuidadores.listarVerificaciones(
      estado,
      VERIFICACIONES_EN_LA_COLA,
    );
    return Promise.all(
      cola.map(async ({ verificacion, cuidador }) => {
        const tipos = [
          'cedula',
          DOCUMENTO_DE_CADA_CONTROL[verificacion.control],
        ];
        const delCuidador = await this.documentos.listarDeCuidador(cuidador.id);
        return {
          id: verificacion.id,
          control: verificacion.control,
          estado: verificacion.estado,
          solicitadaEn: verificacion.creadoEn.toISOString(),
          cuidador: {
            id: cuidador.id,
            nombre: cuidador.nombre,
            especialidad: cuidador.especialidad,
            zona: cuidador.zona,
          },
          documentos: delCuidador
            .filter((d) => tipos.includes(d.tipo))
            .map(vistaDeDocumento),
        };
      }),
    );
  }
}

// Los documentos privados no tienen enlace permanente: el revisor recibe una dirección firmada que vence en dos
// minutos, y cada apertura queda en la auditoría (quién miró la cédula de quién).
export class AbrirDocumentoParaRevisor {
  constructor(
    private readonly documentos: RepositorioDocumentos,
    private readonly almacen: AlmacenDeArchivos,
    private readonly auditoria: Auditoria,
  ) {}

  async ejecutar(
    revisor: UsuarioAutenticado,
    documentoId: DocumentoId,
  ): Promise<{ url: string }> {
    const documento = await this.documentos.buscarPorId(documentoId);
    if (documento === null) {
      throw new RecursoNoEncontrado(
        'No encontramos ese documento',
        'documento.no_encontrado',
      );
    }
    if (!this.almacen.disponible) {
      throw new ServicioNoDisponible(
        'Los documentos no están disponibles por ahora',
        'archivos.no_disponible',
      );
    }
    await this.auditoria.registrar({
      actorId: revisor.id,
      accion: 'directorio.ver_documento',
      recursoTipo: 'documento',
      recursoId: documento.id,
      resultado: 'permitido',
      metadatos: { tipo: documento.tipo },
    });
    return {
      url: this.almacen.urlFirmada(
        documento.claveDeAlmacenamiento,
        VIGENCIA_DEL_DOCUMENTO_PARA_REVISOR_SEGUNDOS,
      ),
    };
  }
}

// El revisor decide sobre UN control. Al aprobarlo dice hasta cuándo vale; al rechazarlo, por qué (lo verá el
// cuidador). Cuando el último de los tres controles queda aprobado, el cuidador pasa a activo y, si todo está
// vigente, a visible (E7). Todo ocurre con el cuidador bloqueado: dos revisores a la vez no se pisan.
export class RevisarVerificacion {
  constructor(
    private readonly cuidadores: RepositorioCuidadores,
    private readonly documentos: RepositorioDocumentos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeDirectorio,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly zonaHorariaNegocio: string,
  ) {}

  async ejecutar(
    revisor: UsuarioAutenticado,
    verificacionId: VerificacionId,
    decision: DecisionDelRevisor,
  ): Promise<{ estado: EstadoDeVerificacion; cuidadorVisible: boolean }> {
    const hoy = FechaCivil.hoy(this.reloj, this.zonaHorariaNegocio);
    const vigencia =
      decision.decision === 'aprobar'
        ? this.vigenciaDe(decision.vigenteHasta, hoy)
        : null;

    const resultado = await this.unidadDeTrabajo.ejecutar(async () => {
      const cuidadorId =
        await this.cuidadores.buscarCuidadorDeVerificacion(verificacionId);
      const cuidador =
        cuidadorId === null
          ? null
          : await this.cuidadores.buscarPorIdParaActualizar(cuidadorId);
      const verificacion = cuidador?.verificaciones.find(
        (v) => v.id === verificacionId,
      );
      if (cuidador === null || verificacion === undefined) {
        throw new RecursoNoEncontrado(
          'No encontramos esa verificación',
          'verificacion.no_encontrada',
        );
      }
      const ahora = this.reloj.ahora();
      const documento = await this.documentos.ultimoDeTipo(
        cuidador.id,
        DOCUMENTO_DE_CADA_CONTROL[verificacion.control],
      );

      if (decision.decision === 'aprobar') {
        if (
          vigencia === null &&
          CONTROLES_QUE_CADUCAN.includes(verificacion.control)
        ) {
          throw new ErrorDeValidacion(
            `El control ${verificacion.control} caduca: indica hasta cuándo vale`,
            'verificacion.falta_vigencia',
          );
        }
        verificacion.aprobar(revisor.id, vigencia, hoy, ahora);
        await this.resolverDocumento(documento, 'aprobar');
      } else {
        verificacion.rechazar(revisor.id, decision.motivo, ahora);
        await this.resolverDocumento(documento, 'rechazar');
      }
      await this.cuidadores.guardarVerificacion(verificacion);

      let activado = false;
      if (decision.decision === 'aprobar') {
        activado = await this.activarSiCorresponde(cuidador, hoy, ahora);
      } else {
        await this.eventos.publicar(
          'directorio.verificacion_rechazada',
          { cuidadorId: cuidador.id, control: verificacion.control },
          ahora,
        );
      }
      const cambio = cuidador.recalcularVisibilidad(hoy, ahora);
      if (activado || cambio !== null) {
        await this.cuidadores.actualizar(cuidador);
      }
      if (activado) {
        await this.eventos.publicar(
          'directorio.cuidador_verificado',
          { cuidadorId: cuidador.id },
          ahora,
        );
      }
      if (cambio !== null) {
        await this.eventos.publicar(
          cambio === 'visible'
            ? 'directorio.cuidador_visible'
            : 'directorio.cuidador_oculto',
          { cuidadorId: cuidador.id },
          ahora,
        );
      }
      return {
        estado: verificacion.estado,
        cuidadorId: cuidador.id,
        cuidadorVisible: cuidador.visible,
        control: verificacion.control,
      };
    });

    await this.auditoria.registrar({
      actorId: revisor.id,
      accion:
        decision.decision === 'aprobar'
          ? 'directorio.aprobar_verificacion'
          : 'directorio.rechazar_verificacion',
      recursoTipo: 'verificacion',
      recursoId: verificacionId,
      resultado: 'permitido',
      metadatos: {
        control: resultado.control,
        cuidadorId: resultado.cuidadorId,
      },
    });
    return {
      estado: resultado.estado,
      cuidadorVisible: resultado.cuidadorVisible,
    };
  }

  // La fecha de vigencia que dio el revisor: futura o de hoy, y dentro de un máximo razonable.
  private vigenciaDe(texto: string | null, hoy: FechaCivil): FechaCivil | null {
    if (texto === null) return null;
    const fecha = FechaCivil.desdeTexto(texto);
    if (fecha.esAnteriorA(hoy)) {
      throw new ErrorDeValidacion(
        'La vigencia no puede ser una fecha pasada',
        'verificacion.vigencia_pasada',
      );
    }
    if (hoy.sumarDias(366 * ANIOS_MAXIMOS_DE_VIGENCIA).esAnteriorA(fecha)) {
      throw new ErrorDeValidacion(
        `La vigencia no puede pasar de ${ANIOS_MAXIMOS_DE_VIGENCIA} años`,
        'verificacion.vigencia_muy_lejana',
      );
    }
    return fecha;
  }

  private async resolverDocumento(
    documento: Documento | null,
    decision: 'aprobar' | 'rechazar',
  ): Promise<void> {
    if (documento?.estado !== 'pendiente') return;
    const bloqueado = await this.documentos.buscarPorIdParaActualizar(
      documento.id,
    );
    if (bloqueado?.estado !== 'pendiente') return;
    if (decision === 'aprobar') bloqueado.aprobar();
    else bloqueado.rechazar();
    await this.documentos.actualizar(bloqueado);
  }

  // Con los tres controles aprobados, un cuidador en revisión pasa a activo (y su cédula se da por revisada).
  private async activarSiCorresponde(
    cuidador: Cuidador,
    hoy: FechaCivil,
    ahora: Date,
  ): Promise<boolean> {
    const todosAprobados = CONTROLES_DE_VERIFICACION.every((control) =>
      cuidador.verificaciones.some(
        (v) => v.control === control && v.estaVigente(hoy),
      ),
    );
    if (!todosAprobados || cuidador.estado !== 'en_revision') return false;
    cuidador.activar(ahora);
    await this.resolverDocumento(
      await this.documentos.ultimoDeTipo(cuidador.id, 'cedula'),
      'aprobar',
    );
    return true;
  }
}

// La hoja de vida es lo único que se muestra a las familias: un revisor la aprueba (queda pública) o la rechaza.
// Los demás documentos se aprueban junto con su control.
export class RevisarHojaDeVida {
  constructor(
    private readonly documentos: RepositorioDocumentos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
  ) {}

  async ejecutar(
    revisor: UsuarioAutenticado,
    documentoId: DocumentoId,
    decision: 'aprobar' | 'rechazar',
  ): Promise<VistaDeDocumento> {
    const documento = await this.unidadDeTrabajo.ejecutar(async () => {
      const actual =
        await this.documentos.buscarPorIdParaActualizar(documentoId);
      if (actual === null) {
        throw new RecursoNoEncontrado(
          'No encontramos ese documento',
          'documento.no_encontrado',
        );
      }
      if (actual.tipo !== 'hoja_de_vida') {
        throw new ReglaDeNegocioIncumplida(
          'Solo la hoja de vida se revisa por separado: los demás documentos se aprueban con su control',
          'documento.no_es_hoja_de_vida',
        );
      }
      if (decision === 'aprobar') actual.aprobar();
      else actual.rechazar();
      await this.documentos.actualizar(actual);
      return actual;
    });
    await this.auditoria.registrar({
      actorId: revisor.id,
      accion:
        decision === 'aprobar'
          ? 'directorio.aprobar_hoja_de_vida'
          : 'directorio.rechazar_hoja_de_vida',
      recursoTipo: 'documento',
      recursoId: documento.id,
      resultado: 'permitido',
    });
    return vistaDeDocumento(documento);
  }
}

export interface HojaDeVidaPendiente {
  documento: VistaDeDocumento;
  cuidador: { id: string; nombre: string };
}

// Las hojas de vida que esperan revisión, las más antiguas primero.
export class ListarHojasDeVidaPendientes {
  constructor(
    private readonly documentos: RepositorioDocumentos,
    private readonly cuidadores: RepositorioCuidadores,
  ) {}

  async ejecutar(): Promise<HojaDeVidaPendiente[]> {
    const pendientes = await this.documentos.listarPendientesDeTipo(
      'hoja_de_vida',
      VERIFICACIONES_EN_LA_COLA,
    );
    const lista: HojaDeVidaPendiente[] = [];
    for (const documento of pendientes) {
      const cuidador = await this.cuidadores.buscarPorId(documento.cuidadorId);
      if (cuidador === null) continue;
      lista.push({
        documento: vistaDeDocumento(documento),
        cuidador: { id: cuidador.id, nombre: cuidador.nombre },
      });
    }
    return lista;
  }
}

// La ficha de UN cuidador para el revisor: sus tres controles y todos sus documentos. Es de lectura, pero el revisor está
// mirando el expediente de una persona: queda en la auditoría quién lo abrió (igual que abrir un documento).
export class ObtenerCuidadorParaRevisor {
  constructor(
    private readonly cuidadores: RepositorioCuidadores,
    private readonly documentos: RepositorioDocumentos,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly zonaHorariaNegocio: string,
  ) {}

  async ejecutar(
    revisor: UsuarioAutenticado,
    cuidadorId: CuidadorId,
  ): Promise<VistaDeCuidadorParaRevisor> {
    const cuidador = await this.cuidadores.buscarPorId(cuidadorId);
    if (cuidador === null) {
      throw new RecursoNoEncontrado(
        'No encontramos a ese cuidador',
        'cuidador.no_encontrado',
      );
    }
    const hoy = FechaCivil.hoy(this.reloj, this.zonaHorariaNegocio);
    const documentos = await this.documentos.listarDeCuidador(cuidador.id);
    await this.auditoria.registrar({
      actorId: revisor.id,
      accion: 'directorio.ver_expediente',
      recursoTipo: 'cuidador',
      recursoId: cuidador.id,
      resultado: 'permitido',
    });
    return {
      cuidador: {
        id: cuidador.id,
        nombre: cuidador.nombre,
        fotoUrl: cuidador.fotoUrl,
        especialidad: cuidador.especialidad,
        titulo: cuidador.titulo,
        aniosExperiencia: cuidador.aniosExperiencia,
        zona: cuidador.zona,
        estado: cuidador.estado,
        visible: cuidador.esVisible(hoy),
        calificacion: cuidador.calificacion(),
        cantidadResenas: cuidador.cantidadResenas,
        serviciosCompletados: cuidador.serviciosCompletados,
        registradoEn: cuidador.creadoEn.toISOString(),
      },
      controles: CONTROLES_DE_VERIFICACION.map((control) =>
        vistaDeControlParaRevisor(
          control,
          cuidador.verificaciones.find((v) => v.control === control),
          hoy,
        ),
      ),
      documentos: documentos.map(vistaDeDocumento),
    };
  }
}

// Un administrador retira a un cuidador del directorio: queda «suspendido» y deja de mostrarse de inmediato. Es una
// decisión, así que además del aviso de que se ocultó (`cuidador_oculto`) se publica `cuidador_suspendido`: Reservas
// cancela sus servicios que aún no empezaron y Pagos devuelve el dinero. Solo se suspende a quien está activo.
// Todo en una transacción con el cuidador bloqueado.
export class SuspenderCuidador {
  constructor(
    private readonly cuidadores: RepositorioCuidadores,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeDirectorio,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    revisor: UsuarioAutenticado,
    cuidadorId: CuidadorId,
  ): Promise<{ estado: string; visible: boolean }> {
    const resultado = await this.unidadDeTrabajo.ejecutar(async () => {
      const cuidador =
        await this.cuidadores.buscarPorIdParaActualizar(cuidadorId);
      if (cuidador === null) {
        throw new RecursoNoEncontrado(
          'No encontramos a ese cuidador',
          'cuidador.no_encontrado',
        );
      }
      if (cuidador.estado !== 'activo') {
        throw new ConflictoDeEstado(
          cuidador.estado === 'suspendido'
            ? 'Ese cuidador ya está suspendido'
            : 'Solo se puede suspender a un cuidador activo',
          'cuidador.no_suspendible',
        );
      }
      const ahora = this.reloj.ahora();
      const estabaVisible = cuidador.visible;
      cuidador.suspender(ahora);
      await this.cuidadores.actualizar(cuidador);
      await this.eventos.publicar(
        'directorio.cuidador_suspendido',
        { cuidadorId: cuidador.id, usuarioId: cuidador.usuarioId },
        ahora,
      );
      if (estabaVisible) {
        await this.eventos.publicar(
          'directorio.cuidador_oculto',
          { cuidadorId: cuidador.id },
          ahora,
        );
      }
      return { estado: cuidador.estado, visible: cuidador.visible };
    });
    await this.auditoria.registrar({
      actorId: revisor.id,
      accion: 'directorio.suspender_cuidador',
      recursoTipo: 'cuidador',
      recursoId: cuidadorId,
      resultado: 'permitido',
    });
    return resultado;
  }
}

// El administrador devuelve al directorio a un cuidador suspendido. Vuelve a «activo»; solo se muestra si tiene sus tres
// controles vigentes hoy (si se le venció alguno mientras estuvo suspendido, sigue oculto hasta renovarlo). Los servicios
// que se cancelaron al suspenderlo NO se restablecen: la familia tendrá que pedirlos de nuevo.
export class ReactivarCuidador {
  constructor(
    private readonly cuidadores: RepositorioCuidadores,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeDirectorio,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly zonaHorariaNegocio: string,
  ) {}

  async ejecutar(
    revisor: UsuarioAutenticado,
    cuidadorId: CuidadorId,
  ): Promise<{ estado: string; visible: boolean }> {
    const hoy = FechaCivil.hoy(this.reloj, this.zonaHorariaNegocio);
    const resultado = await this.unidadDeTrabajo.ejecutar(async () => {
      const cuidador =
        await this.cuidadores.buscarPorIdParaActualizar(cuidadorId);
      if (cuidador === null) {
        throw new RecursoNoEncontrado(
          'No encontramos a ese cuidador',
          'cuidador.no_encontrado',
        );
      }
      const ahora = this.reloj.ahora();
      cuidador.reactivar(ahora);
      const cambio = cuidador.recalcularVisibilidad(hoy, ahora);
      await this.cuidadores.actualizar(cuidador);
      await this.eventos.publicar(
        'directorio.cuidador_reactivado',
        { cuidadorId: cuidador.id, usuarioId: cuidador.usuarioId },
        ahora,
      );
      if (cambio === 'visible') {
        await this.eventos.publicar(
          'directorio.cuidador_visible',
          { cuidadorId: cuidador.id },
          ahora,
        );
      }
      return { estado: cuidador.estado, visible: cuidador.visible };
    });
    await this.auditoria.registrar({
      actorId: revisor.id,
      accion: 'directorio.reactivar_cuidador',
      recursoTipo: 'cuidador',
      recursoId: cuidadorId,
      resultado: 'permitido',
    });
    return resultado;
  }
}
