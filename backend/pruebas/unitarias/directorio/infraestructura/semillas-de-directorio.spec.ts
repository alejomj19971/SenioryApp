import { FechaCivil } from '../../../../src/compartido/dominio/fecha-civil.js';
import { Cuidador } from '../../../../src/directorio/dominio/cuidador.js';
import { CONTROLES_DE_VERIFICACION } from '../../../../src/directorio/dominio/valores-cerrados.js';
import {
  ErrorDeArchivo,
  type CasoImportarCuidador,
} from '../../../../src/directorio/infraestructura/entrada/consola/comando-importar-cuidadores.js';
import {
  muestrasDeCuidadores,
  REVISOR_DE_LAS_SEMILLAS,
  sembrarDirectorio,
} from '../../../../src/directorio/infraestructura/entrada/consola/semillas-de-directorio.js';
import { idDePrueba } from '../../../soporte/identidad.js';

const HOY = FechaCivil.desdeTexto('2026-10-21');

describe('semillas de Directorio', () => {
  const muestras = muestrasDeCuidadores(HOY);

  it('hay nueve cuidadores con correos y teléfonos inconfundiblemente falsos', () => {
    expect(muestras).toHaveLength(9);
    for (const muestra of muestras) {
      expect(muestra.correo).toMatch(/@prueba\.seniory\.invalid$/);
      expect(muestra.telefono).toMatch(/^\+5730000000\d\d$/);
    }
  });

  it('los correos y teléfonos no se repiten', () => {
    expect(new Set(muestras.map((m) => m.correo)).size).toBe(muestras.length);
    expect(new Set(muestras.map((m) => m.telefono)).size).toBe(muestras.length);
  });

  it('todas pasan las reglas del dominio (si una regla cambia, las semillas se enteran)', () => {
    for (const muestra of muestras) {
      expect(() =>
        Cuidador.registrar({
          id: idDePrueba<'Cuidador'>(),
          usuarioId: null,
          ...muestra,
          ahora: new Date('2026-10-21T15:00:00Z'),
        }),
      ).not.toThrow();
    }
  });

  it('traen los tres controles, con vigencia de dos años o sin vencimiento', () => {
    for (const muestra of muestras) {
      expect(muestra.controles.map((c) => c.control).sort()).toEqual(
        [...CONTROLES_DE_VERIFICACION].sort(),
      );
      for (const { vigenteHasta } of muestra.controles) {
        if (vigenteHasta === null) continue;
        expect(
          FechaCivil.desdeTexto(vigenteHasta).esAnteriorA(HOY.sumarDias(700)),
        ).toBe(false);
      }
    }
  });

  it('cubre todas las especialidades y jornadas, para poder probar los filtros', () => {
    expect(new Set(muestras.map((m) => m.especialidad)).size).toBe(4);
    expect(new Set(muestras.flatMap((m) => m.disponibilidad)).size).toBe(3);
  });

  it('se niega a correr en producción', async () => {
    const caso: CasoImportarCuidador = {
      ejecutar: () => Promise.reject(new Error('no debía llamarse')),
    };

    await expect(
      sembrarDirectorio({ NODE_ENV: 'production' }, caso, HOY),
    ).rejects.toThrow(
      new ErrorDeArchivo(
        'Las semillas son datos de ejemplo y no se pueden correr en producción.',
      ),
    );
  });

  it('importa cada muestra con el revisor de las semillas', async () => {
    const revisores: string[] = [];
    const caso: CasoImportarCuidador = {
      ejecutar: (_entrada, revisadoPor) => {
        revisores.push(revisadoPor);
        return Promise.resolve({ cuidadorId: 'c', usuarioId: 'u' });
      },
    };

    const mensajes = await sembrarDirectorio(
      { NODE_ENV: 'development' },
      caso,
      HOY,
    );

    expect(mensajes).toHaveLength(9);
    expect(new Set(revisores)).toEqual(new Set([REVISOR_DE_LAS_SEMILLAS]));
  });

  it('si alguna falla, el comando falla y dice cuál', async () => {
    const caso: CasoImportarCuidador = {
      ejecutar: (entrada) =>
        entrada.nombre.startsWith('Marta')
          ? Promise.reject(new Error('algo salió mal'))
          : Promise.resolve({ cuidadorId: 'c', usuarioId: 'u' }),
    };

    await expect(
      sembrarDirectorio({ NODE_ENV: 'development' }, caso, HOY),
    ).rejects.toThrow(
      /No se pudieron sembrar 1 cuidador.*NO importado: Marta/s,
    );
  });
});
