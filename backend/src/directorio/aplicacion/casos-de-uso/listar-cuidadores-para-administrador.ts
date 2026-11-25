import { ErrorDeValidacion } from '../../../compartido/dominio/errores.js';
import { normalizarParaBuscar } from '../../dominio/texto-de-busqueda.js';
import {
  ESTADOS_DE_CUIDADOR,
  type EstadoDeCuidador,
} from '../../dominio/valores-cerrados.js';
import type {
  FilaDeCuidadorParaAdministrador,
  RepositorioCuidadores,
} from '../puertos/salida/repositorio-cuidadores.js';

const LIMITE_POR_OMISION = 100;
const LIMITE_MAXIMO = 200;

export interface EntradaDeListadoParaAdministrador {
  busqueda?: string;
  estado?: string;
  limite?: number;
}

export interface ListadoParaAdministrador {
  cuidadores: FilaDeCuidadorParaAdministrador[];
  // Hay más cuidadores que los mostrados: conviene afinar la búsqueda.
  hayMas: boolean;
}

// El listado de TODOS los cuidadores (también los que aún no se ven en el directorio) para el panel del administrador,
// con su estado y su calificación. Quién puede pedirlo lo decide el controlador (`@Roles('administrador')`); no incluye
// teléfono ni documentos, así que no deja huella en la auditoría.
export class ListarCuidadoresParaAdministrador {
  constructor(private readonly cuidadores: RepositorioCuidadores) {}

  async ejecutar(
    entrada: EntradaDeListadoParaAdministrador,
  ): Promise<ListadoParaAdministrador> {
    const limite = Math.min(
      Math.max(entrada.limite ?? LIMITE_POR_OMISION, 1),
      LIMITE_MAXIMO,
    );
    const busqueda = normalizarParaBuscar(entrada.busqueda ?? '');
    const estado = estadoOpcional(entrada.estado);
    const filas = await this.cuidadores.listarParaAdministracion(
      {
        ...(busqueda === '' ? {} : { busqueda }),
        ...(estado === undefined ? {} : { estado }),
      },
      limite + 1,
    );
    return {
      cuidadores: filas.slice(0, limite),
      hayMas: filas.length > limite,
    };
  }
}

function estadoOpcional(
  texto: string | undefined,
): EstadoDeCuidador | undefined {
  if (texto === undefined || texto === '') return undefined;
  const estado = ESTADOS_DE_CUIDADOR.find((e) => e === texto);
  if (estado === undefined) {
    throw new ErrorDeValidacion(
      'El estado no es válido',
      'cuidador.estado_invalido',
    );
  }
  return estado;
}
