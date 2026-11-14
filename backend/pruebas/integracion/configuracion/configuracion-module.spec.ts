import { Test } from '@nestjs/testing';
import {
  CONFIGURACION,
  ConfiguracionModule,
} from '../../../src/configuracion/configuracion.module.js';
import {
  configuracionDesdeVariables,
  validarVariables,
} from '../../../src/configuracion/variables-de-entorno.js';
import { SECRETO_JWT_DE_PRUEBA } from '../../soporte/secretos.js';

// TODAS las variables, incluidas las opcionales: esta prueba existe porque ConfiguracionModule arma la
// configuración variable por variable a mano (lee cada una con ConfigService), en una lista separada de la
// clase VariablesDeEntorno. Dos veces se agregó un campo opcional nuevo (CLOUDINARY_*, luego MERCADOPAGO_*) a
// variables-de-entorno.ts sin copiarlo aquí: pasaba la validación de arranque, pero la configuración real
// quedaba con esos campos en null pese a estar definidos en el entorno. El resto de las pruebas del repo no lo
// detecta porque sobrescriben CONFIGURACION con `configuracionDesdeVariables` directamente, sin pasar por este
// módulo. Esta prueba SÍ arranca el módulo real, sin overrides.
const ENTORNO_COMPLETO: Record<string, string> = {
  NODE_ENV: 'staging',
  PUERTO: '3001',
  URL_BASE_DE_DATOS: 'postgres://usuario:clave@host:5432/base',
  ORIGENES_PERMITIDOS: 'https://seniory-frontend.onrender.com',
  NIVEL_DE_LOG: 'info',
  ZONA_HORARIA_NEGOCIO: 'America/Bogota',
  INTERVALO_SONDEO_OUTBOX_MS: '1000',
  INTERVALO_EXPIRACION_SERVICIOS_MS: '60000',
  INTERVALO_ENTREGA_NOTIFICACIONES_MS: '2000',
  CANALES_DE_NOTIFICACION_SIMULADOS: 'false',
  TOLERANCIA_DE_TOMA_MINUTOS: '60',
  INTERVALO_OMISION_TOMAS_MS: '60000',
  PASARELA_DE_PAGOS: 'mercadopago',
  SECRETO_DE_PASARELA: 'a'.repeat(32),
  MERCADOPAGO_ACCESS_TOKEN: 'token-de-prueba',
  MERCADOPAGO_SECRETO_DE_FIRMA: 'firma-de-prueba',
  DISPERSOR_DE_PAGOS: 'deshabilitado',
  REQUIERE_PAGO_APROBADO: 'true',
  MINUTOS_PARA_PAGAR: '120',
  INTERVALO_EXPIRACION_PAGOS_MS: '60000',
  INTERVALO_LIQUIDACION_MS: '60000',
  SENTRY_DSN: 'https://sentry.ejemplo/123',
  SECRETO_BFF: 'b'.repeat(32),
  SECRETO_JWT_ACCESO: SECRETO_JWT_DE_PRUEBA,
  ID_CLAVE_JWT: 'k1',
  DURACION_ACCESO_MIN: '15',
  DURACION_REFRESCO_DIAS: '30',
  COOKIES_SEGURAS: 'true',
  VERSION_POLITICA_VIGENTE: 'v1',
  ALMACEN_DE_ARCHIVOS: 'cloudinary',
  DIRECTORIO_DE_ARCHIVOS: './archivos-locales',
  SECRETO_DE_ARCHIVOS: 'c'.repeat(32),
  CLOUDINARY_CLOUD_NAME: 'nube-de-prueba',
  CLOUDINARY_API_KEY: 'llave-de-prueba',
  CLOUDINARY_API_SECRET: 'secreto-de-prueba',
  SECRETO_DE_OPERACION: 'd'.repeat(32),
  URL_PUBLICA_DE_LA_API: 'https://api.seniory.test/api/v1',
  CANAL_DE_RECUPERACION: 'resend',
  RESEND_API_KEY: 're_prueba',
  RESEND_CORREO_DESDE: 'Seniory <onboarding@resend.dev>',
  VERSION_CONSENTIMIENTO_SALUD_VIGENTE: 'v1',
};

describe('ConfiguracionModule', () => {
  it('arma la Configuracion real con TODAS las variables (también las opcionales)', async () => {
    const entornoPrevio = { ...process.env };
    try {
      for (const [clave, valor] of Object.entries(ENTORNO_COMPLETO)) {
        process.env[clave] = valor;
      }

      const modulo = await Test.createTestingModule({
        imports: [ConfiguracionModule],
      }).compile();
      const app = modulo.createNestApplication();
      await app.init();
      try {
        expect(app.get(CONFIGURACION)).toEqual(
          configuracionDesdeVariables(validarVariables(ENTORNO_COMPLETO)),
        );
      } finally {
        await app.close();
      }
    } finally {
      process.env = entornoPrevio;
    }
  });
});
