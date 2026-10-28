import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// Las reglas de arquitectura (M0 §4.9) se comprueban dos veces:
// 1. Sobre src/: no debe haber ninguna violación (lo mismo que `npm run arquitectura` en la CI).
// 2. Sobre los ejemplos: cada regla debe detectar SU archivo. Si alguien debilita una regla (por
//    ejemplo, un patrón que ya no coincide), deja de detectar su ejemplo y esta prueba falla.

interface Violacion {
  from: string;
  to: string;
  rule: { name: string };
}

const require = createRequire(import.meta.url);
// El paquete no expone su binario en `exports`: se toma de node_modules (las pruebas corren en backend/).
const DEPCRUISE = join(
  process.cwd(),
  'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs',
);
const EJEMPLOS = 'pruebas/arquitectura/ejemplos';

function violacionesEn(carpeta: string): Violacion[] {
  let salida: string;
  try {
    salida = execFileSync(
      process.execPath,
      [
        DEPCRUISE,
        carpeta,
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'json',
      ],
      { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 },
    );
  } catch (error) {
    // Con violaciones, depcruise sale con código distinto de 0 pero igual escribe el JSON.
    salida = (error as { stdout: string }).stdout;
  }
  const resultado = JSON.parse(salida) as {
    summary: { violations: Violacion[] };
  };
  return resultado.summary.violations;
}

const corto = (ruta: string) => ruta.replace(`${EJEMPLOS}/`, '');

describe('reglas de arquitectura', () => {
  it('src/ cumple todas las reglas', () => {
    expect(violacionesEn('src')).toEqual([]);
  });

  describe('cada regla detecta su ejemplo', () => {
    const violaciones = violacionesEn(EJEMPLOS).map((v) => ({
      regla: v.rule.name,
      desde: corto(v.from),
      hacia: corto(v.to),
    }));

    it.each([
      ['sin-ciclos', 'ciclo/a.ts'],
      ['dominio-puro', 'reservas/dominio/usa-infraestructura.ts'],
      ['dominio-puro', 'reservas/dominio/usa-libreria.ts'],
      [
        'aplicacion-sin-infraestructura',
        'reservas/aplicacion/usa-infraestructura.ts',
      ],
      ['frontera-de-modulo', 'reservas/aplicacion/usa-caso-de-uso-ajeno.ts'],
      ['esquemas-privados', 'reservas/infraestructura/usa-esquema-ajeno.ts'],
      [
        'eventos-por-contrato',
        'reservas/aplicacion/manejador-de-evento-ajeno.ts',
      ],
      ['compartido-no-depende-de-modulos', 'compartido/usa-modulo.ts'],
    ])('%s detecta %s', (regla, desde) => {
      expect(violaciones).toContainEqual(
        expect.objectContaining({ regla, desde }),
      );
    });

    it('usar el puerto de entrada de otro módulo está permitido', () => {
      expect(
        violaciones.filter(
          (v) => v.desde === 'reservas/aplicacion/usa-puerto-ajeno.ts',
        ),
      ).toEqual([]);
    });

    it('cada regla configurada tiene al menos un ejemplo', () => {
      const configuracion = require('../../.dependency-cruiser.cjs') as {
        forbidden: { name: string }[];
      };
      const detectadas = new Set(violaciones.map((v) => v.regla));
      expect(
        configuracion.forbidden
          .map((r) => r.name)
          .filter((r) => !detectadas.has(r)),
      ).toEqual([]);
    });
  });
});
