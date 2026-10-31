import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import {
  RecursoNoEncontrado,
  ServicioNoDisponible,
} from '../../../compartido/dominio/errores.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import type { CuidadorId } from '../../dominio/ids.js';
import type { AlmacenDeArchivos } from '../puertos/salida/almacen-de-archivos.js';
import type { RepositorioCuidadores } from '../puertos/salida/repositorio-cuidadores.js';
import type { RepositorioDocumentos } from '../puertos/salida/repositorio-documentos.js';

// Cuánto dura la dirección del archivo: lo justo para abrirlo. Una copiada y pegada después ya no sirve.
export const VIGENCIA_DE_LA_HOJA_DE_VIDA_SEGUNDOS = 300;

// La hoja de vida pública de un cuidador, como una dirección temporal firmada. Solo existe para
// cuidadores que se muestran, y solo entrega ESE archivo: los documentos de verificación (cédula,
// antecedentes…) no tienen salida por aquí (hallazgo H10).
export class ObtenerHojaDeVida {
  constructor(
    private readonly cuidadores: RepositorioCuidadores,
    private readonly documentos: RepositorioDocumentos,
    private readonly almacen: AlmacenDeArchivos,
    private readonly reloj: Reloj,
    private readonly zonaHorariaNegocio: string,
  ) {}

  async ejecutar(id: string): Promise<{ url: string }> {
    const cuidador = await this.cuidadores.buscarPorId(id as CuidadorId);
    const hoy = FechaCivil.hoy(this.reloj, this.zonaHorariaNegocio);
    const documento =
      cuidador !== null && cuidador.visible && cuidador.esVisible(hoy)
        ? await this.documentos.buscarHojaDeVidaPublica(cuidador.id)
        : null;
    if (documento === null) {
      throw new RecursoNoEncontrado(
        'Este cuidador no tiene hoja de vida disponible',
        'hoja_de_vida.no_encontrada',
      );
    }
    if (!this.almacen.disponible) {
      throw new ServicioNoDisponible(
        'La hoja de vida no está disponible por ahora',
        'archivos.no_disponible',
      );
    }
    return {
      url: this.almacen.urlFirmada(
        documento.claveDeAlmacenamiento,
        VIGENCIA_DE_LA_HOJA_DE_VIDA_SEGUNDOS,
      ),
    };
  }
}
