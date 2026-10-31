import { JORNADAS } from '../../../compartido/dominio/jornada.js';
import { ESPECIALIDADES } from '../../dominio/valores-cerrados.js';
import type {
  FiltrosDisponibles,
  RepositorioCuidadores,
} from '../puertos/salida/repositorio-cuidadores.js';

export interface VistaDeFiltrosDisponibles extends FiltrosDisponibles {
  especialidades: readonly string[];
  jornadas: readonly string[];
}

// Lo que el formulario de búsqueda ofrece: las zonas y la tarifa máxima salen de los cuidadores que hoy se
// muestran (no se ofrecen zonas sin nadie), y las especialidades y jornadas son las opciones cerradas.
export class ObtenerFiltrosDisponibles {
  constructor(private readonly cuidadores: RepositorioCuidadores) {}

  async ejecutar(): Promise<VistaDeFiltrosDisponibles> {
    const disponibles = await this.cuidadores.obtenerFiltrosDisponibles();
    return {
      ...disponibles,
      especialidades: ESPECIALIDADES,
      jornadas: JORNADAS,
    };
  }
}
