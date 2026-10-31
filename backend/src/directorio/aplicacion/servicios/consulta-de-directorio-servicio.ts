import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import type { CuidadorId } from '../../dominio/ids.js';
import type {
  ConsultaDeDirectorio,
  ContactoDeCuidador,
  CuidadorParaContratar,
} from '../puertos/entrada/consulta-de-directorio.js';
import type { RepositorioCuidadores } from '../puertos/salida/repositorio-cuidadores.js';

// Implementa lo que Directorio ofrece a los demás módulos. Los IDs llegan como texto porque el llamador
// no conoce los tipos de este módulo.
export class ConsultaDeDirectorioServicio implements ConsultaDeDirectorio {
  constructor(
    private readonly cuidadores: RepositorioCuidadores,
    private readonly reloj: Reloj,
    private readonly zonaHorariaNegocio: string,
  ) {}

  async obtenerCuidadorParaContratar(
    cuidadorId: string,
  ): Promise<CuidadorParaContratar | null> {
    const cuidador = await this.cuidadores.buscarPorId(
      cuidadorId as CuidadorId,
    );
    const hoy = FechaCivil.hoy(this.reloj, this.zonaHorariaNegocio);
    if (cuidador === null || !cuidador.visible || !cuidador.esVisible(hoy)) {
      return null;
    }
    return {
      id: cuidador.id,
      nombre: cuidador.nombre,
      tarifaHora: cuidador.tarifaHora.valor,
      zona: cuidador.zona,
      disponibilidad: [...cuidador.disponibilidad],
      aceptacionAutomatica: cuidador.aceptacionAutomatica,
    };
  }

  async obtenerCuidadorPorUsuario(
    usuarioId: string,
  ): Promise<{ cuidadorId: string } | null> {
    const cuidador = await this.cuidadores.buscarPorUsuarioId(usuarioId);
    return cuidador === null ? null : { cuidadorId: cuidador.id };
  }

  async obtenerContactoDeCuidador(
    cuidadorId: string,
  ): Promise<ContactoDeCuidador | null> {
    const cuidador = await this.cuidadores.buscarPorId(
      cuidadorId as CuidadorId,
    );
    if (cuidador === null) return null;
    return {
      cuidadorId: cuidador.id,
      usuarioId: cuidador.usuarioId,
      nombre: cuidador.nombre,
      telefono: cuidador.telefono,
      fotoUrl: cuidador.fotoUrl,
      especialidad: cuidador.especialidad,
    };
  }
}
