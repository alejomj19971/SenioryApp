import { createHash } from 'node:crypto';
import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
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
import type { Jornada } from '../../../compartido/dominio/jornada.js';
import type { ConsultaDeIdentidad } from '../../../identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import { Cuidador, type CambiosDePerfil } from '../../dominio/cuidador.js';
import {
  Documento,
  EXTENSION_DE_TIPO_MIME,
  tipoMimeDeContenido,
} from '../../dominio/documento.js';
import type { DocumentoId } from '../../dominio/ids.js';
import {
  CONTROLES_DE_VERIFICACION,
  DOCUMENTO_DE_CADA_CONTROL,
  DOCUMENTOS_PARA_REVISION,
  type ControlDeVerificacion,
  type Especialidad,
  type TipoDeDocumento,
} from '../../dominio/valores-cerrados.js';
import { Verificacion } from '../../dominio/verificacion.js';
import type { AlmacenDeArchivos } from '../puertos/salida/almacen-de-archivos.js';
import type { RepositorioCuidadores } from '../puertos/salida/repositorio-cuidadores.js';
import type { RepositorioDocumentos } from '../puertos/salida/repositorio-documentos.js';
import {
  vistaDeDocumento,
  vistaDeMiPerfil,
  type VistaDeDocumento,
  type VistaDeMiPerfil,
} from '../vistas-de-postulacion.js';

// Cuántos archivos de cada tipo puede tener subidos una persona. Los anteriores quedan de historial; sin tope, una
// cuenta podría llenar el almacén.
export const DOCUMENTOS_MAXIMOS_POR_TIPO = 5;

export interface EntradaDePerfil {
  especialidad: Especialidad;
  titulo: string;
  aniosExperiencia: number;
  tarifaHora: number;
  telefono: string;
  zona: string;
  disponibilidad: readonly Jornada[];
  bio: string;
}

// Lo que comparten los casos de uso del propio cuidador: encontrar SU perfil. Un administrador, una familia o un
// cuidador sin perfil no tienen «mi perfil».
class MiPerfil {
  constructor(
    protected readonly cuidadores: RepositorioCuidadores,
    protected readonly reloj: Reloj,
    protected readonly zonaHorariaNegocio: string,
  ) {}

  protected hoy(): FechaCivil {
    return FechaCivil.hoy(this.reloj, this.zonaHorariaNegocio);
  }

  protected async cuidadorDe(usuario: UsuarioAutenticado): Promise<Cuidador> {
    const cuidador =
      usuario.rol === 'cuidador'
        ? await this.cuidadores.buscarPorUsuarioId(usuario.id)
        : null;
    if (cuidador === null) {
      throw new RecursoNoEncontrado(
        'Todavía no tienes un perfil de cuidador',
        'cuidador.sin_perfil',
      );
    }
    return cuidador;
  }
}

// El cuidador que acaba de crear su cuenta arma su perfil. Nace en borrador y oculto: nadie lo ve hasta que un revisor
// apruebe sus tres controles (E7). El nombre sale de su cuenta, no del cuerpo.
export class CrearMiPerfil {
  constructor(
    private readonly cuidadores: RepositorioCuidadores,
    private readonly documentos: RepositorioDocumentos,
    private readonly identidad: ConsultaDeIdentidad,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
    private readonly zonaHorariaNegocio: string,
  ) {}

  async ejecutar(
    usuario: UsuarioAutenticado,
    entrada: EntradaDePerfil,
  ): Promise<VistaDeMiPerfil> {
    if (usuario.rol !== 'cuidador') {
      throw new ReglaDeNegocioIncumplida(
        'Solo una cuenta de cuidador tiene perfil de cuidador',
        'cuidador.cuenta_no_es_de_cuidador',
      );
    }
    if ((await this.cuidadores.buscarPorUsuarioId(usuario.id)) !== null) {
      throw new ConflictoDeEstado(
        'Ya tienes un perfil de cuidador',
        'cuidador.usuario_ya_tiene_perfil',
      );
    }
    const cuenta = await this.identidad.obtenerContacto(usuario.id);
    if (cuenta === null) {
      throw new RecursoNoEncontrado(
        'No encontramos tu cuenta',
        'usuario.no_encontrado',
      );
    }
    const ahora = this.reloj.ahora();
    const cuidador = Cuidador.registrar({
      id: this.ids.nuevo<'Cuidador'>(),
      usuarioId: usuario.id,
      nombre: cuenta.nombre,
      ...entrada,
      ahora,
    });
    // Lanza ConflictoDeEstado si dos pedidos simultáneos intentan crearlo: gana uno.
    await this.unidadDeTrabajo.ejecutar(() =>
      this.cuidadores.guardar(cuidador),
    );
    await this.auditoria.registrar({
      actorId: usuario.id,
      accion: 'directorio.crear_perfil',
      recursoTipo: 'cuidador',
      recursoId: cuidador.id,
      resultado: 'permitido',
    });
    return vistaDeMiPerfil(
      cuidador,
      await this.documentos.listarDeCuidador(cuidador.id),
      FechaCivil.hoy(this.reloj, this.zonaHorariaNegocio),
    );
  }
}

export class ObtenerMiPerfil extends MiPerfil {
  constructor(
    cuidadores: RepositorioCuidadores,
    private readonly documentos: RepositorioDocumentos,
    reloj: Reloj,
    zonaHorariaNegocio: string,
  ) {
    super(cuidadores, reloj, zonaHorariaNegocio);
  }

  async ejecutar(usuario: UsuarioAutenticado): Promise<VistaDeMiPerfil> {
    const cuidador = await this.cuidadorDe(usuario);
    return vistaDeMiPerfil(
      cuidador,
      await this.documentos.listarDeCuidador(cuidador.id),
      this.hoy(),
    );
  }
}

// El cuidador corrige su perfil, incluido si acepta los servicios solo. La especialidad y el título ya no se pueden
// cambiar una vez activado: respaldan un título aprobado.
export class ActualizarMiPerfil extends MiPerfil {
  constructor(
    cuidadores: RepositorioCuidadores,
    private readonly documentos: RepositorioDocumentos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    reloj: Reloj,
    zonaHorariaNegocio: string,
  ) {
    super(cuidadores, reloj, zonaHorariaNegocio);
  }

  async ejecutar(
    usuario: UsuarioAutenticado,
    cambios: CambiosDePerfil,
  ): Promise<VistaDeMiPerfil> {
    const propio = await this.cuidadorDe(usuario);
    const cuidador = await this.unidadDeTrabajo.ejecutar(async () => {
      const actual = await this.cuidadores.buscarPorIdParaActualizar(propio.id);
      if (actual === null) {
        throw new RecursoNoEncontrado(
          'Todavía no tienes un perfil de cuidador',
          'cuidador.sin_perfil',
        );
      }
      actual.actualizarPerfil(cambios, this.reloj.ahora());
      await this.cuidadores.actualizar(actual);
      return actual;
    });
    await this.auditoria.registrar({
      actorId: usuario.id,
      accion: 'directorio.actualizar_perfil',
      recursoTipo: 'cuidador',
      recursoId: cuidador.id,
      resultado: 'permitido',
      metadatos: { campos: Object.keys(cambios).sort().join(',') },
    });
    return vistaDeMiPerfil(
      cuidador,
      await this.documentos.listarDeCuidador(cuidador.id),
      this.hoy(),
    );
  }
}

export interface ArchivoSubido {
  tipo: TipoDeDocumento;
  nombreOriginal: string;
  contenido: Uint8Array;
}

// El cuidador sube un documento. Lo que cuenta es el CONTENIDO (se miran los primeros bytes): el tipo que declare el
// cliente no se cree. El nombre con que se guarda lo genera el servidor. Queda pendiente de revisión y solo lo ven el
// propio cuidador y un revisor.
export class SubirDocumento extends MiPerfil {
  constructor(
    cuidadores: RepositorioCuidadores,
    private readonly documentos: RepositorioDocumentos,
    private readonly almacen: AlmacenDeArchivos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    reloj: Reloj,
    private readonly ids: GeneradorDeIds,
    zonaHorariaNegocio: string,
  ) {
    super(cuidadores, reloj, zonaHorariaNegocio);
  }

  async ejecutar(
    usuario: UsuarioAutenticado,
    archivo: ArchivoSubido,
  ): Promise<VistaDeDocumento> {
    const cuidador = await this.cuidadorDe(usuario);
    if (cuidador.estado === 'suspendido') {
      throw new ConflictoDeEstado(
        'Un cuidador suspendido no puede subir documentos',
        'cuidador.suspendido',
      );
    }
    if (!this.almacen.disponible) {
      throw new ServicioNoDisponible(
        'La carga de documentos no está disponible por ahora',
        'archivos.no_disponible',
      );
    }
    const documento = Documento.subir({
      id: this.ids.nuevo<'Documento'>() as DocumentoId,
      cuidadorId: cuidador.id,
      tipo: archivo.tipo,
      nombreOriginal: archivo.nombreOriginal,
      contenido: archivo.contenido,
      sha256: createHash('sha256').update(archivo.contenido).digest(),
      ahora: this.reloj.ahora(),
    });

    await this.unidadDeTrabajo.ejecutar(async () => {
      if (
        (await this.documentos.contarDeTipo(cuidador.id, archivo.tipo)) >=
        DOCUMENTOS_MAXIMOS_POR_TIPO
      ) {
        throw new ReglaDeNegocioIncumplida(
          `Ya subiste ${DOCUMENTOS_MAXIMOS_POR_TIPO} archivos de este tipo`,
          'documento.demasiados',
        );
      }
      await this.documentos.guardar(documento);
      // Al final, para que un fallo del archivo revierta también la fila.
      await this.almacen.guardar(
        documento.claveDeAlmacenamiento,
        archivo.contenido,
        documento.tipoMime,
      );
    });
    await this.auditoria.registrar({
      actorId: usuario.id,
      accion: 'directorio.subir_documento',
      recursoTipo: 'documento',
      recursoId: documento.id,
      resultado: 'permitido',
      metadatos: { tipo: documento.tipo },
    });
    return vistaDeDocumento(documento);
  }
}

// 3 MB: una foto de perfil no necesita el tope de 5 MB de los documentos.
export const TAMANO_MAXIMO_DE_FOTO = 3 * 1024 * 1024;

export interface FotoSubida {
  contenido: Uint8Array;
}

// El cuidador sube (o reemplaza) su foto de perfil. A diferencia de `SubirDocumento`, no pasa por revisión: se
// muestra de inmediato a las familias. La clave es fija por cuidador (`fotos/{id}.ext`): si vuelve a subir en el
// mismo formato, pisa el archivo anterior y la URL pública no cambia; si cambia de formato (JPEG↔PNG), la URL sí
// cambia y el archivo anterior queda sin referencia (sin tope de archivos: solo hay uno vigente a la vez).
export class SubirFoto extends MiPerfil {
  constructor(
    cuidadores: RepositorioCuidadores,
    private readonly documentos: RepositorioDocumentos,
    private readonly almacen: AlmacenDeArchivos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    reloj: Reloj,
    zonaHorariaNegocio: string,
  ) {
    super(cuidadores, reloj, zonaHorariaNegocio);
  }

  async ejecutar(
    usuario: UsuarioAutenticado,
    foto: FotoSubida,
  ): Promise<VistaDeMiPerfil> {
    const cuidador = await this.cuidadorDe(usuario);
    if (cuidador.estado === 'suspendido') {
      throw new ConflictoDeEstado(
        'Un cuidador suspendido no puede cambiar su foto',
        'cuidador.suspendido',
      );
    }
    if (!this.almacen.disponible) {
      throw new ServicioNoDisponible(
        'La carga de la foto no está disponible por ahora',
        'archivos.no_disponible',
      );
    }
    const tipoMime = tipoMimeDeContenido(foto.contenido);
    if (tipoMime === null || tipoMime === 'application/pdf') {
      throw new ErrorDeValidacion(
        'La foto debe ser una imagen JPEG o PNG',
        'foto.formato_invalido',
      );
    }
    const clave = `fotos/${cuidador.id}.${EXTENSION_DE_TIPO_MIME[tipoMime]}`;
    const fotoUrl = this.almacen.urlPublica(clave);

    const actualizado = await this.unidadDeTrabajo.ejecutar(async () => {
      const actual = await this.cuidadores.buscarPorIdParaActualizar(
        cuidador.id,
      );
      if (actual === null) {
        throw new RecursoNoEncontrado(
          'Todavía no tienes un perfil de cuidador',
          'cuidador.sin_perfil',
        );
      }
      actual.cambiarFoto(fotoUrl, this.reloj.ahora());
      await this.cuidadores.actualizar(actual);
      // Al final, para que un fallo del archivo revierta también la fila.
      await this.almacen.guardar(clave, foto.contenido, tipoMime);
      return actual;
    });
    await this.auditoria.registrar({
      actorId: usuario.id,
      accion: 'directorio.subir_foto',
      recursoTipo: 'cuidador',
      recursoId: actualizado.id,
      resultado: 'permitido',
    });
    return vistaDeMiPerfil(
      actualizado,
      await this.documentos.listarDeCuidador(actualizado.id),
      this.hoy(),
    );
  }
}

// El cuidador termina su perfil y pide la revisión de sus tres controles. Hace falta haber subido la cédula y los
// documentos de los tres controles (y que ninguno esté rechazado). Solo desde el borrador.
export class SolicitarRevision extends MiPerfil {
  constructor(
    cuidadores: RepositorioCuidadores,
    private readonly documentos: RepositorioDocumentos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    reloj: Reloj,
    private readonly ids: GeneradorDeIds,
    zonaHorariaNegocio: string,
  ) {
    super(cuidadores, reloj, zonaHorariaNegocio);
  }

  async ejecutar(usuario: UsuarioAutenticado): Promise<VistaDeMiPerfil> {
    const propio = await this.cuidadorDe(usuario);
    const cuidador = await this.unidadDeTrabajo.ejecutar(async () => {
      const actual = await this.cuidadores.buscarPorIdParaActualizar(propio.id);
      if (actual === null) {
        throw new RecursoNoEncontrado(
          'Todavía no tienes un perfil de cuidador',
          'cuidador.sin_perfil',
        );
      }
      if (actual.estado !== 'borrador') {
        throw new ConflictoDeEstado(
          'Tu perfil ya fue enviado a revisión',
          'cuidador.no_enviable_a_revision',
        );
      }
      const faltan: TipoDeDocumento[] = [];
      for (const tipo of DOCUMENTOS_PARA_REVISION) {
        const ultimo = await this.documentos.ultimoDeTipo(actual.id, tipo);
        if (ultimo === null || ultimo.estado === 'rechazado') faltan.push(tipo);
      }
      if (faltan.length > 0) {
        throw new ReglaDeNegocioIncumplida(
          `Faltan documentos: ${faltan.join(', ')}`,
          'revision.faltan_documentos',
        );
      }
      const ahora = this.reloj.ahora();
      for (const control of CONTROLES_DE_VERIFICACION) {
        await this.cuidadores.guardarVerificacion(
          Verificacion.solicitar({
            id: this.ids.nuevo<'Verificacion'>(),
            cuidadorId: actual.id,
            control,
            ahora,
          }),
        );
      }
      actual.enviarARevision(ahora);
      await this.cuidadores.actualizar(actual);
      return (await this.cuidadores.buscarPorId(actual.id)) ?? actual;
    });
    await this.auditoria.registrar({
      actorId: usuario.id,
      accion: 'directorio.solicitar_revision',
      recursoTipo: 'cuidador',
      recursoId: cuidador.id,
      resultado: 'permitido',
    });
    return vistaDeMiPerfil(
      cuidador,
      await this.documentos.listarDeCuidador(cuidador.id),
      this.hoy(),
    );
  }
}

// Un control que se rechazó, o que se venció, se vuelve a pedir. Hay que haber subido DESPUÉS un documento nuevo de ese
// control: renovar con el mismo archivo que ya se revisó no tiene sentido. La verificación vencida queda de historial.
export class RenovarVerificacion extends MiPerfil {
  constructor(
    cuidadores: RepositorioCuidadores,
    private readonly documentos: RepositorioDocumentos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    reloj: Reloj,
    private readonly ids: GeneradorDeIds,
    zonaHorariaNegocio: string,
  ) {
    super(cuidadores, reloj, zonaHorariaNegocio);
  }

  async ejecutar(
    usuario: UsuarioAutenticado,
    control: ControlDeVerificacion,
  ): Promise<VistaDeMiPerfil> {
    const propio = await this.cuidadorDe(usuario);
    const hoy = this.hoy();
    const cuidador = await this.unidadDeTrabajo.ejecutar(async () => {
      const actual = await this.cuidadores.buscarPorIdParaActualizar(propio.id);
      if (actual === null) {
        throw new RecursoNoEncontrado(
          'Todavía no tienes un perfil de cuidador',
          'cuidador.sin_perfil',
        );
      }
      const anterior = actual.verificaciones.find((v) => v.control === control);
      if (anterior === undefined) {
        throw new ConflictoDeEstado(
          'Ese control todavía no se ha pedido: envía tu perfil a revisión',
          'verificacion.sin_solicitar',
        );
      }
      if (anterior.estado === 'pendiente') {
        throw new ConflictoDeEstado(
          'Ese control ya está en revisión',
          'verificacion.en_revision',
        );
      }
      if (anterior.estado === 'aprobada' && anterior.estaVigente(hoy)) {
        throw new ConflictoDeEstado(
          'Ese control sigue vigente: no hace falta renovarlo',
          'verificacion.vigente',
        );
      }
      const documento = await this.documentos.ultimoDeTipo(
        actual.id,
        DOCUMENTO_DE_CADA_CONTROL[control],
      );
      const desde = anterior.revisadoEn ?? anterior.creadoEn;
      if (
        documento === null ||
        documento.estado !== 'pendiente' ||
        documento.subidoEn.getTime() <= desde.getTime()
      ) {
        throw new ReglaDeNegocioIncumplida(
          'Sube un documento nuevo de este control antes de pedir la renovación',
          'verificacion.falta_documento_nuevo',
        );
      }
      const ahora = this.reloj.ahora();
      if (anterior.estado === 'aprobada') {
        anterior.marcarVencida(hoy);
        await this.cuidadores.guardarVerificacion(anterior);
      }
      const nueva = Verificacion.solicitar({
        id: this.ids.nuevo<'Verificacion'>(),
        cuidadorId: actual.id,
        control,
        ahora,
      });
      await this.cuidadores.guardarVerificacion(nueva);
      return (await this.cuidadores.buscarPorId(actual.id)) ?? actual;
    });
    await this.auditoria.registrar({
      actorId: usuario.id,
      accion: 'directorio.renovar_verificacion',
      recursoTipo: 'cuidador',
      recursoId: cuidador.id,
      resultado: 'permitido',
      metadatos: { control },
    });
    return vistaDeMiPerfil(
      cuidador,
      await this.documentos.listarDeCuidador(cuidador.id),
      hoy,
    );
  }
}
