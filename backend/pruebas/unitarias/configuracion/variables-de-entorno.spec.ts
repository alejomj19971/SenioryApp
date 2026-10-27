import {
  ErrorDeConfiguracion,
  configuracionDesdeVariables,
  validarVariables,
} from '../../../src/configuracion/variables-de-entorno.js';

const SECRETO_VALIDO = 'a'.repeat(32);

function entornoBase(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    NODE_ENV: 'development',
    URL_BASE_DE_DATOS: 'postgres://seniory:seniory@localhost:5434/seniory',
    ORIGENES_PERMITIDOS: 'http://localhost:3000',
    ...extra,
  };
}

function entornoDeProduccion(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return entornoBase({
    NODE_ENV: 'production',
    ORIGENES_PERMITIDOS: 'https://app.seniory.co',
    SECRETO_BFF: SECRETO_VALIDO,
    ...extra,
  });
}

function problemasDe(entorno: Record<string, unknown>): string[] {
  try {
    validarVariables(entorno);
  } catch (error) {
    if (error instanceof ErrorDeConfiguracion) return error.problemas;
    throw error;
  }
  return [];
}

describe('validarVariables', () => {
  describe('en desarrollo', () => {
    it('acepta la configuración mínima y aplica los valores por defecto', () => {
      const configuracion = configuracionDesdeVariables(
        validarVariables(entornoBase()),
      );

      expect(configuracion).toEqual({
        entorno: 'development',
        esProduccion: false,
        puerto: 3001,
        urlBaseDeDatos: 'postgres://seniory:seniory@localhost:5434/seniory',
        origenesPermitidos: ['http://localhost:3000'],
        nivelDeLog: 'info',
        zonaHorariaNegocio: 'America/Bogota',
        intervaloSondeoOutboxMs: 1000,
        sentryDsn: null,
        secretoBff: null,
      });
    });

    it('convierte el puerto de texto a número', () => {
      expect(validarVariables(entornoBase({ PUERTO: '4000' })).PUERTO).toBe(
        4000,
      );
    });

    it('trata una variable vacía como ausente (usa el valor por defecto)', () => {
      const variables = validarVariables(
        entornoBase({ PUERTO: '', NIVEL_DE_LOG: '', SECRETO_BFF: '' }),
      );

      expect(variables.PUERTO).toBe(3001);
      expect(variables.NIVEL_DE_LOG).toBe('info');
      expect(variables.SECRETO_BFF).toBeUndefined();
    });

    it('separa varios orígenes por comas y recorta espacios', () => {
      const variables = validarVariables(
        entornoBase({
          ORIGENES_PERMITIDOS:
            'http://localhost:3000, https://staging.seniory.co',
        }),
      );

      expect(configuracionDesdeVariables(variables).origenesPermitidos).toEqual(
        ['http://localhost:3000', 'https://staging.seniory.co'],
      );
    });
  });

  describe('variables obligatorias e inválidas', () => {
    it('informa TODOS los problemas a la vez, indicando cada variable', () => {
      const problemas = problemasDe({ NODE_ENV: 'otro', PUERTO: 'abc' });

      expect(problemas).toEqual(
        expect.arrayContaining([
          expect.stringContaining('NODE_ENV'),
          expect.stringContaining('PUERTO'),
          expect.stringContaining('URL_BASE_DE_DATOS'),
          expect.stringContaining('ORIGENES_PERMITIDOS'),
        ]),
      );
    });

    it('el mensaje del error nombra la variable que falta', () => {
      const entorno = entornoBase();
      delete entorno.URL_BASE_DE_DATOS;

      expect(() => validarVariables(entorno)).toThrow(
        /URL_BASE_DE_DATOS es obligatoria/,
      );
    });

    it.each(['0', '65536', '-1', '30.5'])('rechaza el puerto %s', (puerto) => {
      expect(problemasDe(entornoBase({ PUERTO: puerto })).join()).toContain(
        'PUERTO',
      );
    });

    it('rechaza una URL de base de datos que no es de Postgres', () => {
      expect(
        problemasDe(entornoBase({ URL_BASE_DE_DATOS: 'mysql://localhost/x' })),
      ).toHaveLength(1);
    });

    it('rechaza un nivel de log desconocido', () => {
      expect(
        problemasDe(entornoBase({ NIVEL_DE_LOG: 'ruidoso' })).join(),
      ).toContain('NIVEL_DE_LOG');
    });

    it.each(['-1', '60001', '1.5', 'rapido'])(
      'rechaza el intervalo de sondeo %s',
      (intervalo) => {
        expect(
          problemasDe(
            entornoBase({ INTERVALO_SONDEO_OUTBOX_MS: intervalo }),
          ).join(),
        ).toContain('INTERVALO_SONDEO_OUTBOX_MS');
      },
    );

    it('admite apagar el sondeo fuera de producción', () => {
      expect(
        validarVariables(entornoBase({ INTERVALO_SONDEO_OUTBOX_MS: '0' }))
          .INTERVALO_SONDEO_OUTBOX_MS,
      ).toBe(0);
    });

    it('rechaza una zona horaria inexistente', () => {
      expect(
        problemasDe(
          entornoBase({ ZONA_HORARIA_NEGOCIO: 'Marte/Olimpo' }),
        ).join(),
      ).toContain('ZONA_HORARIA_NEGOCIO');
    });

    it.each(['*', 'https://*.seniory.co'])(
      'rechaza el comodín en los orígenes (%s)',
      (origen) => {
        expect(
          problemasDe(entornoBase({ ORIGENES_PERMITIDOS: origen })).join(),
        ).toContain('comodines');
      },
    );

    it.each([
      'seniory.co',
      'https://seniory.co/',
      'https://seniory.co/ruta',
      'ftp://seniory.co',
    ])('rechaza el origen mal formado "%s"', (origen) => {
      expect(
        problemasDe(entornoBase({ ORIGENES_PERMITIDOS: origen })).join(),
      ).toContain('origen inválido');
    });
  });

  describe('arranque seguro en staging y producción', () => {
    it('acepta una configuración de producción correcta', () => {
      expect(problemasDe(entornoDeProduccion())).toEqual([]);
    });

    it.each(['staging', 'production'])('exige SECRETO_BFF en %s', (entorno) => {
      const variables = entornoDeProduccion({ NODE_ENV: entorno });
      delete variables.SECRETO_BFF;

      expect(problemasDe(variables)).toEqual([
        `SECRETO_BFF es obligatorio en ${entorno}`,
      ]);
    });

    it('en producción no permite apagar el sondeo del outbox', () => {
      expect(
        problemasDe(entornoDeProduccion({ INTERVALO_SONDEO_OUTBOX_MS: '0' })),
      ).toEqual([
        'En producción, INTERVALO_SONDEO_OUTBOX_MS no puede ser 0 (los eventos pendientes nunca se entregarían)',
      ]);
    });

    it('rechaza un SECRETO_BFF corto', () => {
      expect(
        problemasDe(entornoDeProduccion({ SECRETO_BFF: 'corto' })),
      ).toEqual(['SECRETO_BFF debe tener al menos 32 caracteres']);
    });

    it('en staging no exige https ni prohíbe localhost (solo producción)', () => {
      const variables = entornoDeProduccion({
        NODE_ENV: 'staging',
        ORIGENES_PERMITIDOS: 'http://localhost:3000',
      });

      expect(problemasDe(variables)).toEqual([]);
    });

    it.each([
      'http://localhost:3000',
      'https://localhost',
      'http://127.0.0.1:3000',
    ])('en producción rechaza el origen local %s', (origen) => {
      expect(
        problemasDe(
          entornoDeProduccion({ ORIGENES_PERMITIDOS: origen }),
        ).join(),
      ).toContain('localhost');
    });

    it('en producción rechaza orígenes sin https', () => {
      expect(
        problemasDe(
          entornoDeProduccion({ ORIGENES_PERMITIDOS: 'http://app.seniory.co' }),
        ).join(),
      ).toContain('solo admite https');
    });

    it.each(['debug', 'trace'])(
      'en producción rechaza el nivel de log %s',
      (nivel) => {
        expect(
          problemasDe(entornoDeProduccion({ NIVEL_DE_LOG: nivel })).join(),
        ).toContain('NIVEL_DE_LOG');
      },
    );

    it('marca esProduccion solo en producción', () => {
      expect(
        configuracionDesdeVariables(validarVariables(entornoDeProduccion()))
          .esProduccion,
      ).toBe(true);
      expect(
        configuracionDesdeVariables(validarVariables(entornoBase()))
          .esProduccion,
      ).toBe(false);
    });
  });

  it('no incluye la contraseña de la base de datos en los mensajes de error', () => {
    const problemas = problemasDe(
      entornoBase({ URL_BASE_DE_DATOS: 'mysql://usuario:claveSecreta@host/x' }),
    );

    expect(problemas.join()).not.toContain('claveSecreta');
  });
});
