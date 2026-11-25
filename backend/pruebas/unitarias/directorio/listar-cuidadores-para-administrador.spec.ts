import { describe, expect, it, vi } from 'vitest';
import { ErrorDeValidacion } from '../../../src/compartido/dominio/errores.js';
import { ListarCuidadoresParaAdministrador } from '../../../src/directorio/aplicacion/casos-de-uso/listar-cuidadores-para-administrador.js';
import type {
  FilaDeCuidadorParaAdministrador,
  RepositorioCuidadores,
} from '../../../src/directorio/aplicacion/puertos/salida/repositorio-cuidadores.js';
import type { CuidadorId } from '../../../src/directorio/dominio/ids.js';

function fila(n: number): FilaDeCuidadorParaAdministrador {
  return {
    id: `0198aaaa-0000-7000-8000-${String(n).padStart(12, '0')}` as CuidadorId,
    nombre: `Cuidador ${n}`,
    fotoUrl: null,
    especialidad: 'auxiliar',
    zona: 'Manrique',
    estado: 'activo',
    visible: true,
    calificacion: null,
    cantidadResenas: 0,
    serviciosCompletados: 0,
  };
}

function conFilas(filas: FilaDeCuidadorParaAdministrador[]) {
  const listarParaAdministracion = vi.fn().mockResolvedValue(filas);
  const repositorio = {
    listarParaAdministracion,
  } as unknown as RepositorioCuidadores;
  return {
    caso: new ListarCuidadoresParaAdministrador(repositorio),
    listarParaAdministracion,
  };
}

describe('ListarCuidadoresParaAdministrador', () => {
  it('normaliza la búsqueda (sin tildes ni mayúsculas) y no filtra si viene vacía', async () => {
    const { caso, listarParaAdministracion } = conFilas([]);

    await caso.ejecutar({ busqueda: '  MÚNERA  ' });
    await caso.ejecutar({ busqueda: '   ' });

    expect(listarParaAdministracion).toHaveBeenNthCalledWith(
      1,
      { busqueda: 'munera' },
      101,
    );
    expect(listarParaAdministracion).toHaveBeenNthCalledWith(2, {}, 101);
  });

  it('filtra por estado y rechaza uno que no existe', async () => {
    const { caso, listarParaAdministracion } = conFilas([]);

    await caso.ejecutar({ estado: 'en_revision' });
    expect(listarParaAdministracion).toHaveBeenCalledWith(
      { estado: 'en_revision' },
      101,
    );
    await expect(caso.ejecutar({ estado: 'otro' })).rejects.toBeInstanceOf(
      ErrorDeValidacion,
    );
  });

  it('pide uno de más para saber si hay más y entrega solo el límite', async () => {
    const { caso } = conFilas([fila(1), fila(2), fila(3)]);

    const listado = await caso.ejecutar({ limite: 2 });

    expect(listado.cuidadores).toHaveLength(2);
    expect(listado.hayMas).toBe(true);
  });

  it('sin sobrante, no hay más', async () => {
    const { caso } = conFilas([fila(1), fila(2)]);

    const listado = await caso.ejecutar({ limite: 2 });

    expect(listado.cuidadores).toHaveLength(2);
    expect(listado.hayMas).toBe(false);
  });

  it('acota el límite entre 1 y 200', async () => {
    const { caso, listarParaAdministracion } = conFilas([]);

    await caso.ejecutar({ limite: 5000 });
    await caso.ejecutar({ limite: 0 });

    expect(listarParaAdministracion).toHaveBeenNthCalledWith(1, {}, 201);
    expect(listarParaAdministracion).toHaveBeenNthCalledWith(2, {}, 2);
  });
});
