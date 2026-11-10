import {
  ErrorDeConfiguracion,
  configuracionDesdeVariables,
  validarVariables,
} from '../../../src/configuracion/variables-de-entorno.js';

const SECRETO_VALIDO = 'a'.repeat(32);
const SECRETO_JWT_VALIDO = 'b'.repeat(32);

function entornoBase(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    NODE_ENV: 'development',
    URL_BASE_DE_DATOS: 'postgres://seniory:seniory@localhost:5434/seniory',
    ORIGENES_PERMITIDOS: 'http://localhost:3000',
    SECRETO_JWT_ACCESO: SECRETO_JWT_VALIDO,
    COOKIES_SEGURAS: 'false',
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
    COOKIES_SEGURAS: 'true',
    REQUIERE_PAGO_APROBADO: 'true',
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
        intervaloExpiracionServiciosMs: 60000,
        intervaloEntregaNotificacionesMs: 2000,
        canalesDeNotificacionSimulados: false,
        toleranciaDeTomaMinutos: 60,
        intervaloOmisionTomasMs: 60000,
        pasarelaDePagos: 'deshabilitada',
        secretoDePasarela: null,
        dispersorDePagos: 'deshabilitado',
        requierePagoAprobado: false,
        minutosParaPagar: 120,
        intervaloExpiracionPagosMs: 60000,
        intervaloLiquidacionMs: 60000,
        sentryDsn: null,
        secretoBff: null,
        secretoJwtAcceso: SECRETO_JWT_VALIDO,
        idClaveJwt: 'k1',
        duracionAccesoMin: 15,
        duracionRefrescoDias: 30,
        cookiesSeguras: false,
        versionPoliticaVigente: 'v1',
        versionConsentimientoSaludVigente: 'v1',
        canalDeRecuperacion: 'deshabilitado',
        almacenDeArchivos: 'deshabilitado',
        directorioDeArchivos: './archivos-locales',
        secretoDeArchivos: null,
        cloudinaryCloudName: null,
        cloudinaryApiKey: null,
        cloudinaryApiSecret: null,
        secretoDeOperacion: null,
        urlPublicaDeLaApi: 'http://localhost:3001/api/v1',
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

    it('en producción no permite apagar la expiración de solicitudes', () => {
      expect(
        problemasDe(
          entornoDeProduccion({ INTERVALO_EXPIRACION_SERVICIOS_MS: '0' }),
        ),
      ).toEqual([
        'En producción, INTERVALO_EXPIRACION_SERVICIOS_MS no puede ser 0 (las solicitudes sin respuesta nunca expirarían)',
      ]);
    });

    it.each(['-1', '3600001', '1.5', 'cada-rato'])(
      'rechaza el intervalo de expiración %s',
      (intervalo) => {
        expect(
          problemasDe(
            entornoBase({ INTERVALO_EXPIRACION_SERVICIOS_MS: intervalo }),
          ).join(),
        ).toContain('INTERVALO_EXPIRACION_SERVICIOS_MS');
      },
    );

    it('exige el pago aprobado en staging y producción', () => {
      for (const entorno of ['staging', 'production']) {
        expect(
          problemasDe(
            entornoDeProduccion({
              NODE_ENV: entorno,
              REQUIERE_PAGO_APROBADO: 'false',
            }),
          ),
        ).toEqual([
          `REQUIERE_PAGO_APROBADO debe ser true en ${entorno} (un servicio no puede iniciar sin pago)`,
        ]);
      }
    });

    it('en producción no admite la pasarela ni el dispersor simulados', () => {
      expect(
        problemasDe(
          entornoDeProduccion({
            PASARELA_DE_PAGOS: 'simulada',
            SECRETO_DE_PASARELA: SECRETO_VALIDO,
            DISPERSOR_DE_PAGOS: 'simulado',
          }),
        ),
      ).toEqual([
        'En producción, PASARELA_DE_PAGOS no puede ser simulada (un pago de mentira se daría por cobrado)',
        'En producción, DISPERSOR_DE_PAGOS no puede ser simulado (un pago al cuidador de mentira se daría por hecho)',
      ]);
    });

    it('en staging admite la pasarela y el dispersor simulados', () => {
      expect(
        problemasDe(
          entornoDeProduccion({
            NODE_ENV: 'staging',
            PASARELA_DE_PAGOS: 'simulada',
            SECRETO_DE_PASARELA: SECRETO_VALIDO,
            DISPERSOR_DE_PAGOS: 'simulado',
          }),
        ),
      ).toEqual([]);
    });

    it('la pasarela simulada exige un secreto de 32 caracteres o más', () => {
      expect(
        problemasDe(entornoBase({ PASARELA_DE_PAGOS: 'simulada' })),
      ).toEqual([
        'SECRETO_DE_PASARELA es obligatorio con la pasarela simulada',
      ]);
      expect(
        problemasDe(
          entornoBase({
            PASARELA_DE_PAGOS: 'simulada',
            SECRETO_DE_PASARELA: 'corto',
          }),
        ),
      ).toEqual(['SECRETO_DE_PASARELA debe tener al menos 32 caracteres']);
    });

    it.each([
      ['INTERVALO_EXPIRACION_PAGOS_MS', 'los pagos sin pagar nunca vencerían'],
      ['INTERVALO_LIQUIDACION_MS', 'las liquidaciones nunca se enviarían'],
    ])('en producción no permite apagar %s', (variable, consecuencia) => {
      expect(problemasDe(entornoDeProduccion({ [variable]: '0' }))).toEqual([
        `En producción, ${variable} no puede ser 0 (${consecuencia})`,
      ]);
    });

    it.each([
      ['PASARELA_DE_PAGOS', 'wompi'],
      ['DISPERSOR_DE_PAGOS', 'banco'],
      ['REQUIERE_PAGO_APROBADO', 'quizas'],
      ['MINUTOS_PARA_PAGAR', '0'],
      ['MINUTOS_PARA_PAGAR', '1441'],
      ['INTERVALO_EXPIRACION_PAGOS_MS', '-1'],
      ['INTERVALO_LIQUIDACION_MS', '3600001'],
    ])('rechaza %s = %s', (variable, valor) => {
      expect(problemasDe(entornoBase({ [variable]: valor })).join()).toContain(
        variable,
      );
    });

    it('en producción no permite apagar el envío de avisos', () => {
      expect(
        problemasDe(
          entornoDeProduccion({ INTERVALO_ENTREGA_NOTIFICACIONES_MS: '0' }),
        ),
      ).toEqual([
        'En producción, INTERVALO_ENTREGA_NOTIFICACIONES_MS no puede ser 0 (los avisos nunca se enviarían)',
      ]);
    });

    it('en producción no admite los canales simulados', () => {
      expect(
        problemasDe(
          entornoDeProduccion({ CANALES_DE_NOTIFICACION_SIMULADOS: 'true' }),
        ),
      ).toEqual([
        'En producción, CANALES_DE_NOTIFICACION_SIMULADOS no puede ser true (un aviso que no sale se daría por enviado)',
      ]);
    });

    it('los canales simulados están apagados por defecto y se pueden encender fuera de producción', () => {
      expect(
        configuracionDesdeVariables(validarVariables(entornoBase()))
          .canalesDeNotificacionSimulados,
      ).toBe(false);
      expect(
        configuracionDesdeVariables(
          validarVariables(
            entornoBase({ CANALES_DE_NOTIFICACION_SIMULADOS: 'true' }),
          ),
        ).canalesDeNotificacionSimulados,
      ).toBe(true);
    });

    it.each(['-1', '60001', '1.5', 'rapido'])(
      'rechaza el intervalo de envío de avisos %s',
      (intervalo) => {
        expect(
          problemasDe(
            entornoBase({ INTERVALO_ENTREGA_NOTIFICACIONES_MS: intervalo }),
          ).join(),
        ).toContain('INTERVALO_ENTREGA_NOTIFICACIONES_MS');
      },
    );

    it('rechaza un valor de canales simulados que no sea true o false', () => {
      expect(
        problemasDe(
          entornoBase({ CANALES_DE_NOTIFICACION_SIMULADOS: 'quizas' }),
        ).join(),
      ).toContain('CANALES_DE_NOTIFICACION_SIMULADOS');
    });

    it('en producción no permite apagar la revisión de tomas vencidas', () => {
      expect(
        problemasDe(entornoDeProduccion({ INTERVALO_OMISION_TOMAS_MS: '0' })),
      ).toEqual([
        'En producción, INTERVALO_OMISION_TOMAS_MS no puede ser 0 (las tomas vencidas nunca se marcarían como omitidas)',
      ]);
    });

    it.each(['0', '721', '1.5', 'un-rato'])(
      'rechaza la tolerancia de toma %s',
      (valor) => {
        expect(
          problemasDe(
            entornoBase({ TOLERANCIA_DE_TOMA_MINUTOS: valor }),
          ).join(),
        ).toContain('TOLERANCIA_DE_TOMA_MINUTOS');
      },
    );

    it.each(['-1', '3600001', 'seguido'])(
      'rechaza el intervalo de omisión %s',
      (valor) => {
        expect(
          problemasDe(
            entornoBase({ INTERVALO_OMISION_TOMAS_MS: valor }),
          ).join(),
        ).toContain('INTERVALO_OMISION_TOMAS_MS');
      },
    );

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

  describe('sesión y tokens', () => {
    it('exige el secreto de firma en todos los entornos', () => {
      const entorno = entornoBase();
      delete entorno.SECRETO_JWT_ACCESO;

      expect(problemasDe(entorno).join()).toContain(
        'SECRETO_JWT_ACCESO es obligatorio',
      );
    });

    it('rechaza un secreto de firma de menos de 256 bits', () => {
      expect(
        problemasDe(entornoBase({ SECRETO_JWT_ACCESO: 'corto' })).join(),
      ).toContain('SECRETO_JWT_ACCESO debe tener al menos 32 caracteres');
    });

    it('rechaza usar el mismo secreto para la firma y para el BFF', () => {
      expect(
        problemasDe(
          entornoBase({
            SECRETO_BFF: SECRETO_JWT_VALIDO,
          }),
        ).join(),
      ).toContain('deben ser distintos');
    });

    it.each(['0', '61', 'x'])('rechaza una duración de acceso de %s', (min) => {
      expect(
        problemasDe(entornoBase({ DURACION_ACCESO_MIN: min })).join(),
      ).toContain('DURACION_ACCESO_MIN');
    });

    it.each(['0', '91', 'x'])('rechaza un refresco de %s días', (dias) => {
      expect(
        problemasDe(entornoBase({ DURACION_REFRESCO_DIAS: dias })).join(),
      ).toContain('DURACION_REFRESCO_DIAS');
    });

    it('rechaza un identificador de clave con caracteres raros', () => {
      expect(
        problemasDe(entornoBase({ ID_CLAVE_JWT: 'k 1' })).join(),
      ).toContain('ID_CLAVE_JWT');
    });

    it('COOKIES_SEGURAS solo admite true o false y por defecto es true', () => {
      expect(
        problemasDe(entornoBase({ COOKIES_SEGURAS: 'quizás' })).join(),
      ).toContain('COOKIES_SEGURAS');
      const entorno = entornoBase();
      delete entorno.COOKIES_SEGURAS;
      expect(
        configuracionDesdeVariables(validarVariables(entorno)).cookiesSeguras,
      ).toBe(true);
    });

    it.each(['staging', 'production'])(
      'en %s rechaza las cookies sin Secure',
      (entorno) => {
        expect(
          problemasDe(
            entornoDeProduccion({
              NODE_ENV: entorno,
              COOKIES_SEGURAS: 'false',
            }),
          ).join(),
        ).toContain('COOKIES_SEGURAS debe ser true');
      },
    );

    it('el canal de recuperación es «deshabilitado» por defecto: no se finge un envío que no existe', () => {
      expect(
        configuracionDesdeVariables(validarVariables(entornoBase()))
          .canalDeRecuperacion,
      ).toBe('deshabilitado');
    });

    it('el almacén de archivos es «deshabilitado» por defecto: no se finge que se guarda algo', () => {
      expect(
        configuracionDesdeVariables(validarVariables(entornoBase()))
          .almacenDeArchivos,
      ).toBe('deshabilitado');
    });

    it('el almacén local exige el secreto de firma de 32 caracteres o más', () => {
      expect(
        problemasDe(entornoBase({ ALMACEN_DE_ARCHIVOS: 'local' })).join(),
      ).toContain('SECRETO_DE_ARCHIVOS es obligatorio');
      expect(
        problemasDe(
          entornoBase({
            ALMACEN_DE_ARCHIVOS: 'local',
            SECRETO_DE_ARCHIVOS: 'corto',
          }),
        ).join(),
      ).toContain('al menos 32');
      expect(
        problemasDe(
          entornoBase({
            ALMACEN_DE_ARCHIVOS: 'local',
            SECRETO_DE_ARCHIVOS: 'a'.repeat(32),
          }),
        ),
      ).toEqual([]);
    });

    it('en producción rechaza el almacén local: el disco del servidor pierde los archivos', () => {
      expect(
        problemasDe(
          entornoDeProduccion({
            ALMACEN_DE_ARCHIVOS: 'local',
            SECRETO_DE_ARCHIVOS: 'a'.repeat(32),
          }),
        ).join(),
      ).toContain('ALMACEN_DE_ARCHIVOS no puede ser local');
    });

    it('el almacén cloudinary exige sus tres credenciales', () => {
      expect(
        problemasDe(entornoBase({ ALMACEN_DE_ARCHIVOS: 'cloudinary' })).join(),
      ).toContain('CLOUDINARY_CLOUD_NAME es obligatorio');
      expect(
        problemasDe(
          entornoBase({
            ALMACEN_DE_ARCHIVOS: 'cloudinary',
            CLOUDINARY_CLOUD_NAME: 'nube',
            CLOUDINARY_API_KEY: '123',
            CLOUDINARY_API_SECRET: 'secreto',
          }),
        ),
      ).toEqual([]);
    });

    it('en producción sí admite el almacén cloudinary (persiste entre despliegues)', () => {
      expect(
        problemasDe(
          entornoDeProduccion({
            ALMACEN_DE_ARCHIVOS: 'cloudinary',
            CLOUDINARY_CLOUD_NAME: 'nube',
            CLOUDINARY_API_KEY: '123',
            CLOUDINARY_API_SECRET: 'secreto',
          }),
        ),
      ).toEqual([]);
    });

    it('rechaza un almacén desconocido y una dirección pública inválida', () => {
      expect(
        problemasDe(entornoBase({ ALMACEN_DE_ARCHIVOS: 'nube' })).join(),
      ).toContain('ALMACEN_DE_ARCHIVOS');
      expect(
        problemasDe(
          entornoBase({ URL_PUBLICA_DE_LA_API: 'no es una url' }),
        ).join(),
      ).toContain('URL_PUBLICA_DE_LA_API');
    });

    it('la dirección pública por defecto sigue el puerto, y se le quita la barra final', () => {
      expect(
        configuracionDesdeVariables(
          validarVariables(entornoBase({ PUERTO: '4000' })),
        ).urlPublicaDeLaApi,
      ).toBe('http://localhost:4000/api/v1');
      expect(
        configuracionDesdeVariables(
          validarVariables(
            entornoBase({
              URL_PUBLICA_DE_LA_API: 'https://api.seniory.co/api/v1/',
            }),
          ),
        ).urlPublicaDeLaApi,
      ).toBe('https://api.seniory.co/api/v1');
    });

    it('rechaza un canal de recuperación desconocido', () => {
      expect(
        problemasDe(entornoBase({ CANAL_DE_RECUPERACION: 'paloma' })).join(),
      ).toContain('CANAL_DE_RECUPERACION');
    });

    it('en producción rechaza el canal «consola»: el enlace quedaría escrito en el log', () => {
      expect(
        problemasDe(
          entornoDeProduccion({ CANAL_DE_RECUPERACION: 'consola' }),
        ).join(),
      ).toContain('CANAL_DE_RECUPERACION no puede ser consola');
    });

    it.each(['development', 'test', 'staging'])(
      'en %s admite el canal «consola»',
      (entorno) => {
        expect(
          problemasDe(
            entornoDeProduccion({
              NODE_ENV: entorno,
              CANAL_DE_RECUPERACION: 'consola',
            }),
          ),
        ).toEqual([]);
      },
    );

    it('rechaza una versión del consentimiento de salud con formato inválido', () => {
      expect(
        problemasDe(
          entornoBase({ VERSION_CONSENTIMIENTO_SALUD_VIGENTE: 'v 1!' }),
        ).join(),
      ).toContain('VERSION_CONSENTIMIENTO_SALUD_VIGENTE');
    });

    it('rechaza una versión de política con formato inválido', () => {
      expect(
        problemasDe(entornoBase({ VERSION_POLITICA_VIGENTE: 'v 1!' })).join(),
      ).toContain('VERSION_POLITICA_VIGENTE');
    });
  });

  it('no incluye la contraseña de la base de datos en los mensajes de error', () => {
    const problemas = problemasDe(
      entornoBase({ URL_BASE_DE_DATOS: 'mysql://usuario:claveSecreta@host/x' }),
    );

    expect(problemas.join()).not.toContain('claveSecreta');
  });
});
