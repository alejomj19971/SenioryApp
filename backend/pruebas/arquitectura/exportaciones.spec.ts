import { Module } from '@nestjs/common';
import { VERIFICADOR_DE_TOKENS } from '../../src/compartido/aplicacion/puertos/verificador-de-tokens.js';
import { REPOSITORIO_USUARIOS } from '../../src/identidad/aplicacion/puertos/salida/repositorio-usuarios.js';
import { IdentidadModule } from '../../src/identidad/identidad.module.js';

// Regla `exports-solo-puertos-de-entrada` (M0 §4.9): lo que un módulo de negocio exporta en Nest es
// su frontera. Solo pueden salir los puertos de entrada (lo que otros módulos pueden usar) y los
// puertos de compartido que implementa para el guard global. Repositorios, hash y emisor de tokens
// son privados: si otro módulo intenta inyectarlos, Nest falla al arrancar.
//
// dependency-cruiser no puede verlo (la lista de `exports` es un valor, no un import), por eso se
// comprueba con los metadatos del módulo.

function exportaciones(modulo: object): unknown[] {
  return (
    (Reflect.getMetadata('exports', modulo) as unknown[] | undefined) ?? []
  );
}

// Lo que el módulo exporta y no figura entre lo permitido.
function noPermitidas(
  modulo: object,
  permitidas: readonly symbol[],
): unknown[] {
  return exportaciones(modulo).filter(
    (exportada) => !permitidas.includes(exportada as symbol),
  );
}

const PERMITIDAS_POR_MODULO = [
  {
    nombre: 'IdentidadModule',
    modulo: IdentidadModule,
    // CONSULTA_DE_IDENTIDAD se agrega aquí cuando exista (M1, PR 4).
    permitidas: [VERIFICADOR_DE_TOKENS],
  },
] as const;

describe('exports de los módulos de negocio', () => {
  it.each(PERMITIDAS_POR_MODULO)(
    '$nombre exporta solo puertos de entrada',
    ({ modulo, permitidas }) => {
      expect(noPermitidas(modulo, permitidas)).toEqual([]);
    },
  );

  it.each(PERMITIDAS_POR_MODULO)(
    '$nombre exporta símbolos, nunca clases',
    ({ modulo }) => {
      for (const exportada of exportaciones(modulo)) {
        expect(typeof exportada).toBe('symbol');
      }
    },
  );

  it('la regla detecta un módulo que exporta un repositorio', () => {
    @Module({ exports: [VERIFICADOR_DE_TOKENS, REPOSITORIO_USUARIOS] })
    class ModuloQueRompeLaFrontera {}

    expect(
      noPermitidas(ModuloQueRompeLaFrontera, [VERIFICADOR_DE_TOKENS]),
    ).toEqual([REPOSITORIO_USUARIOS]);
  });
});
