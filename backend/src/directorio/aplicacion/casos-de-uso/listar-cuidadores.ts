import {
  codificarCursor,
  crearFiltros,
  decodificarCursor,
  limiteDe,
  type EntradaDeFiltros,
} from '../../dominio/filtros-de-cuidadores.js';
import type { RepositorioCuidadores } from '../puertos/salida/repositorio-cuidadores.js';
import { vistaDeCuidador, type VistaDeCuidador } from '../vistas.js';

export interface EntradaDeListado extends EntradaDeFiltros {
  limite?: number;
  // El «siguiente» de la página anterior.
  cursor?: string;
}

export interface PaginaDeVistas {
  cuidadores: VistaDeCuidador[];
  // Se pasa tal cual como `cursor` para pedir la página siguiente; null si no hay más.
  siguiente: string | null;
}

// La búsqueda de cuidadores. Solo devuelve a los que se muestran (con sus tres controles vigentes): el
// repositorio ni siquiera los consulta de otro modo. Ordena por mejor calificación y menor tarifa.
export class ListarCuidadores {
  constructor(private readonly cuidadores: RepositorioCuidadores) {}

  async ejecutar(entrada: EntradaDeListado): Promise<PaginaDeVistas> {
    const filtros = crearFiltros(entrada);
    const limite = limiteDe(entrada.limite);
    const cursor =
      entrada.cursor === undefined || entrada.cursor === ''
        ? null
        : decodificarCursor(entrada.cursor);
    const pagina = await this.cuidadores.listarVisibles(
      filtros,
      limite,
      cursor,
    );
    return {
      cuidadores: pagina.cuidadores.map(vistaDeCuidador),
      siguiente:
        pagina.siguiente === null ? null : codificarCursor(pagina.siguiente),
    };
  }
}
