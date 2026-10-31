import { createHash } from 'node:crypto';
import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import {
  ErrorDeValidacion,
  ServicioNoDisponible,
} from '../../../compartido/dominio/errores.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import type { Jornada } from '../../../compartido/dominio/jornada.js';
import type { CuentasDeCuidadores } from '../../../identidad/aplicacion/puertos/entrada/cuentas-de-cuidadores.js';
import { Cuidador } from '../../dominio/cuidador.js';
import type { CuidadorId } from '../../dominio/ids.js';
import {
  CONTROLES_DE_VERIFICACION,
  type ControlDeVerificacion,
  type Especialidad,
} from '../../dominio/valores-cerrados.js';
import { Verificacion } from '../../dominio/verificacion.js';
import type { AlmacenDeArchivos } from '../puertos/salida/almacen-de-archivos.js';
import type { RepositorioCuidadores } from '../puertos/salida/repositorio-cuidadores.js';
import type { RepositorioDocumentos } from '../puertos/salida/repositorio-documentos.js';
import type { EventosDeDirectorio } from '../servicios/eventos-de-directorio.js';

export const TAMANO_MAXIMO_DE_HOJA_DE_VIDA = 5 * 1024 * 1024;
const FIRMA_DE_PDF = '%PDF-';

export interface ControlRevisado {
  control: ControlDeVerificacion;
  // "AAAA-MM-DD"; null si el control no vence.
  vigenteHasta: string | null;
}

export interface HojaDeVidaParaImportar {
  nombreOriginal: string;
  contenido: Uint8Array;
}

// Un cuidador real cuyos tres controles ya fueron revisados por el equipo, fuera del sistema.
export interface EntradaDeCuidadorImportado {
  nombre: string;
  correo: string;
  telefono: string;
  especialidad: Especialidad;
  titulo: string;
  aniosExperiencia: number;
  tarifaHora: number;
  zona: string;
  disponibilidad: readonly Jornada[];
  bio: string;
  fotoUrl?: string | null;
  controles: readonly ControlRevisado[];
  hojaDeVida?: HojaDeVidaParaImportar;
}

export interface ResultadoDeImportacion {
  cuidadorId: string;
  usuarioId: string;
}

// La carga inicial de cuidadores (los datos reales llegan por aquí, no por semillas): crea su cuenta, su
// perfil ACTIVO y VISIBLE, los tres controles como aprobados por quien los revisó, y, si hay, su hoja de
// vida. Es TODO O NADA por cuidador. Corre desde la consola del servidor (`npm run cuidadores:importar`);
// nadie puede darse de alta así por internet.
export class ImportarCuidador {
  constructor(
    private readonly cuentas: CuentasDeCuidadores,
    private readonly cuidadores: RepositorioCuidadores,
    private readonly documentos: RepositorioDocumentos,
    private readonly almacen: AlmacenDeArchivos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeDirectorio,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
    private readonly zonaHorariaNegocio: string,
  ) {}

  async ejecutar(
    entrada: EntradaDeCuidadorImportado,
    revisadoPor: string,
  ): Promise<ResultadoDeImportacion> {
    // Lo que no depende de la base se valida antes de abrir la transacción.
    const hoy = FechaCivil.hoy(this.reloj, this.zonaHorariaNegocio);
    const vigencias = this.vigenciasDe(entrada.controles, hoy);
    if (entrada.hojaDeVida !== undefined) {
      this.exigirHojaDeVidaValida(entrada.hojaDeVida);
    }

    return await this.unidadDeTrabajo.ejecutar(async () => {
      const ahora = this.reloj.ahora();
      const { usuarioId } = await this.cuentas.crearCuentaDeCuidador({
        nombre: entrada.nombre,
        correo: entrada.correo,
        telefono: entrada.telefono,
      });

      const cuidador = Cuidador.registrar({
        id: this.ids.nuevo<'Cuidador'>(),
        usuarioId,
        nombre: entrada.nombre,
        fotoUrl: entrada.fotoUrl ?? null,
        especialidad: entrada.especialidad,
        titulo: entrada.titulo,
        aniosExperiencia: entrada.aniosExperiencia,
        tarifaHora: entrada.tarifaHora,
        telefono: entrada.telefono,
        zona: entrada.zona,
        disponibilidad: entrada.disponibilidad,
        bio: entrada.bio,
        ahora,
      });
      for (const control of CONTROLES_DE_VERIFICACION) {
        cuidador.conVerificacion(
          Verificacion.aprobadaFueraDeLinea({
            id: this.ids.nuevo<'Verificacion'>(),
            cuidadorId: cuidador.id,
            control,
            revisadoPor,
            ahora,
            vigenteHasta: vigencias.get(control) ?? null,
          }),
        );
      }
      cuidador.activar(ahora);
      cuidador.recalcularVisibilidad(hoy, ahora);

      // Lanza ConflictoDeEstado si la cuenta ya tenía perfil; la transacción se revierte entera.
      await this.cuidadores.guardar(cuidador);
      await this.eventos.publicar(
        'directorio.cuidador_visible',
        { cuidadorId: cuidador.id },
        ahora,
      );
      if (entrada.hojaDeVida !== undefined) {
        await this.guardarHojaDeVida(cuidador.id, entrada.hojaDeVida, ahora);
      }
      await this.auditoria.registrar({
        actorId: revisadoPor,
        accion: 'directorio.importar_cuidador',
        recursoTipo: 'cuidador',
        recursoId: cuidador.id,
        resultado: 'permitido',
      });
      return { cuidadorId: cuidador.id, usuarioId };
    });
  }

  // Los tres controles, ni uno menos ni repetidos, y ninguno ya vencido: así el cuidador sale visible.
  private vigenciasDe(
    controles: readonly ControlRevisado[],
    hoy: FechaCivil,
  ): Map<ControlDeVerificacion, FechaCivil | null> {
    const vigencias = new Map<ControlDeVerificacion, FechaCivil | null>();
    for (const { control, vigenteHasta } of controles) {
      if (vigencias.has(control)) {
        throw new ErrorDeValidacion(
          `El control ${control} viene repetido`,
          'importacion.control_repetido',
        );
      }
      const fecha =
        vigenteHasta === null ? null : FechaCivil.desdeTexto(vigenteHasta);
      if (fecha !== null && fecha.esAnteriorA(hoy)) {
        throw new ErrorDeValidacion(
          `El control ${control} ya está vencido (${fecha.aTexto()})`,
          'importacion.control_vencido',
        );
      }
      vigencias.set(control, fecha);
    }
    const faltan = CONTROLES_DE_VERIFICACION.filter(
      (control) => !vigencias.has(control),
    );
    if (faltan.length > 0) {
      throw new ErrorDeValidacion(
        `Faltan los controles: ${faltan.join(', ')}. Un cuidador solo se carga con los tres aprobados`,
        'importacion.faltan_controles',
      );
    }
    return vigencias;
  }

  private exigirHojaDeVidaValida(hoja: HojaDeVidaParaImportar): void {
    const cabecera = Buffer.from(hoja.contenido.subarray(0, 5)).toString(
      'latin1',
    );
    if (cabecera !== FIRMA_DE_PDF) {
      throw new ErrorDeValidacion(
        'La hoja de vida debe ser un archivo PDF',
        'importacion.hoja_de_vida_no_es_pdf',
      );
    }
    if (hoja.contenido.byteLength > TAMANO_MAXIMO_DE_HOJA_DE_VIDA) {
      throw new ErrorDeValidacion(
        'La hoja de vida no puede pasar de 5 MB',
        'importacion.hoja_de_vida_muy_grande',
      );
    }
  }

  private async guardarHojaDeVida(
    cuidadorId: CuidadorId,
    hoja: HojaDeVidaParaImportar,
    ahora: Date,
  ): Promise<void> {
    if (!this.almacen.disponible) {
      throw new ServicioNoDisponible(
        'No hay un almacén de archivos configurado; no se puede cargar la hoja de vida',
        'archivos.no_disponible',
      );
    }
    const id = this.ids.nuevo<'Documento'>();
    const clave = `hojas-de-vida/${id}.pdf`;
    await this.documentos.guardarHojaDeVidaAprobada({
      id,
      cuidadorId,
      claveDeAlmacenamiento: clave,
      nombreOriginal: hoja.nombreOriginal,
      tipoMime: 'application/pdf',
      tamanoBytes: hoja.contenido.byteLength,
      sha256: createHash('sha256').update(hoja.contenido).digest(),
      subidoEn: ahora,
    });
    // Al final, para que un fallo del archivo revierta también las filas.
    await this.almacen.guardar(clave, hoja.contenido, 'application/pdf');
  }
}
