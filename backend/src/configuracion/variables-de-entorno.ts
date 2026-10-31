// Los decoradores de class-validator y class-transformer leen metadatos: se carga aquí de forma
// explícita para que este archivo funcione también fuera de Nest (por ejemplo, en pruebas unitarias).
import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
  type ValidationError,
} from 'class-validator';

export const ENTORNOS = [
  'development',
  'test',
  'staging',
  'production',
] as const;
export type Entorno = (typeof ENTORNOS)[number];

export const NIVELES_DE_LOG = [
  'error',
  'warn',
  'info',
  'debug',
  'trace',
] as const;
export type NivelDeLog = (typeof NIVELES_DE_LOG)[number];

export const CANALES_DE_RECUPERACION = ['consola', 'deshabilitado'] as const;
export type CanalDeRecuperacion = (typeof CANALES_DE_RECUPERACION)[number];

const LARGO_MINIMO_SECRETO_BFF = 32;
// 256 bits: el mínimo para firmar con HS256.
const LARGO_MINIMO_SECRETO_JWT = 32;

export class VariablesDeEntorno {
  @IsIn(ENTORNOS, {
    message: `NODE_ENV debe ser uno de: ${ENTORNOS.join(', ')}`,
  })
  NODE_ENV!: Entorno;

  @Type(() => Number)
  @IsInt({ message: 'PUERTO debe ser un número entero' })
  @Min(1, { message: 'PUERTO debe estar entre 1 y 65535' })
  @Max(65535, { message: 'PUERTO debe estar entre 1 y 65535' })
  PUERTO: number = 3001;

  @Matches(/^postgres(ql)?:\/\/\S+$/, {
    message:
      'URL_BASE_DE_DATOS es obligatoria y debe empezar por postgres:// o postgresql://',
  })
  URL_BASE_DE_DATOS!: string;

  @IsString({
    message:
      'ORIGENES_PERMITIDOS es obligatoria (lista de orígenes separados por comas)',
  })
  ORIGENES_PERMITIDOS!: string;

  @IsIn(NIVELES_DE_LOG, {
    message: `NIVEL_DE_LOG debe ser uno de: ${NIVELES_DE_LOG.join(', ')}`,
  })
  NIVEL_DE_LOG: NivelDeLog = 'info';

  @IsString()
  ZONA_HORARIA_NEGOCIO: string = 'America/Bogota';

  // Cada cuánto busca el despachador eventos pendientes en el outbox. 0 lo apaga (solo en pruebas:
  // en producción un evento que no se entregó al instante quedaría sin entregar).
  @Type(() => Number)
  @IsInt({ message: 'INTERVALO_SONDEO_OUTBOX_MS debe ser un número entero' })
  @Min(0, {
    message: 'INTERVALO_SONDEO_OUTBOX_MS debe estar entre 0 y 60000',
  })
  @Max(60_000, {
    message: 'INTERVALO_SONDEO_OUTBOX_MS debe estar entre 0 y 60000',
  })
  INTERVALO_SONDEO_OUTBOX_MS: number = 1_000;

  // Con qué se firman los tokens de acceso. Obligatorio en todos los entornos: un valor por defecto
  // en el código sería una llave pública.
  @IsString({ message: 'SECRETO_JWT_ACCESO es obligatorio' })
  SECRETO_JWT_ACCESO!: string;

  // Identifica la clave de firma (`kid`) para poder rotarla sin cerrar las sesiones abiertas.
  @Matches(/^[A-Za-z0-9._-]{1,32}$/, {
    message:
      'ID_CLAVE_JWT debe tener entre 1 y 32 letras, números, puntos, guiones o guiones bajos',
  })
  ID_CLAVE_JWT: string = 'k1';

  @Type(() => Number)
  @IsInt({ message: 'DURACION_ACCESO_MIN debe ser un número entero' })
  @Min(1, { message: 'DURACION_ACCESO_MIN debe estar entre 1 y 60' })
  @Max(60, { message: 'DURACION_ACCESO_MIN debe estar entre 1 y 60' })
  DURACION_ACCESO_MIN: number = 15;

  @Type(() => Number)
  @IsInt({ message: 'DURACION_REFRESCO_DIAS debe ser un número entero' })
  @Min(1, { message: 'DURACION_REFRESCO_DIAS debe estar entre 1 y 90' })
  @Max(90, { message: 'DURACION_REFRESCO_DIAS debe estar entre 1 y 90' })
  DURACION_REFRESCO_DIAS: number = 30;

  // Las cookies de sesión llevan `Secure` salvo en local (http://localhost no tiene https).
  @IsIn(['true', 'false'], {
    message: 'COOKIES_SEGURAS debe ser true o false',
  })
  COOKIES_SEGURAS: string = 'true';

  // Versión de la política de tratamiento de datos que se pide aceptar al registrarse.
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/, {
    message: 'VERSION_POLITICA_VIGENTE no es una versión válida (ej. v1)',
  })
  VERSION_POLITICA_VIGENTE: string = 'v1';

  // Por dónde llega el enlace para recuperar la contraseña. «consola» lo escribe en el log del servidor
  // (solo desarrollo y pruebas: en producción no se admite). «deshabilitado» deja la recuperación
  // respondiendo «no disponible» hasta que exista un canal real de correo (M5).
  @IsIn(CANALES_DE_RECUPERACION, {
    message: `CANAL_DE_RECUPERACION debe ser uno de: ${CANALES_DE_RECUPERACION.join(', ')}`,
  })
  CANAL_DE_RECUPERACION: CanalDeRecuperacion = 'deshabilitado';

  // Versión del texto del consentimiento para tratar datos de salud que se pide aceptar.
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/, {
    message:
      'VERSION_CONSENTIMIENTO_SALUD_VIGENTE no es una versión válida (ej. v1)',
  })
  VERSION_CONSENTIMIENTO_SALUD_VIGENTE: string = 'v1';

  @IsOptional()
  @IsString()
  SENTRY_DSN?: string;

  @IsOptional()
  @IsString()
  SECRETO_BFF?: string;
}

export interface Configuracion {
  entorno: Entorno;
  esProduccion: boolean;
  puerto: number;
  urlBaseDeDatos: string;
  origenesPermitidos: string[];
  nivelDeLog: NivelDeLog;
  zonaHorariaNegocio: string;
  intervaloSondeoOutboxMs: number;
  sentryDsn: string | null;
  secretoBff: string | null;
  secretoJwtAcceso: string;
  idClaveJwt: string;
  duracionAccesoMin: number;
  duracionRefrescoDias: number;
  cookiesSeguras: boolean;
  versionPoliticaVigente: string;
  versionConsentimientoSaludVigente: string;
  canalDeRecuperacion: CanalDeRecuperacion;
}

export class ErrorDeConfiguracion extends Error {
  constructor(readonly problemas: string[]) {
    super(
      `Configuración inválida. La aplicación no puede iniciar:\n${problemas.map((p) => `  - ${p}`).join('\n')}`,
    );
    this.name = 'ErrorDeConfiguracion';
  }
}

function mensajesDe(errores: ValidationError[]): string[] {
  return errores.flatMap((error) => Object.values(error.constraints ?? {}));
}

function listaDeOrigenes(valor: string): string[] {
  return valor
    .split(',')
    .map((origen) => origen.trim())
    .filter((origen) => origen !== '');
}

function esZonaHorariaValida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat('es-CO', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

function esOrigenValido(origen: string): boolean {
  try {
    const url = new URL(origen);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === origen
    );
  } catch {
    return false;
  }
}

// Reglas que van más allá de la forma de cada variable: coherencia entre ellas y arranque seguro.
function reglasAdicionales(variables: VariablesDeEntorno): string[] {
  const problemas: string[] = [];
  const origenes = listaDeOrigenes(variables.ORIGENES_PERMITIDOS ?? '');

  if (variables.ORIGENES_PERMITIDOS !== undefined) {
    if (origenes.length === 0) {
      problemas.push('ORIGENES_PERMITIDOS no puede estar vacía');
    }
    for (const origen of origenes) {
      if (origen.includes('*')) {
        problemas.push(`ORIGENES_PERMITIDOS no admite comodines (${origen})`);
      } else if (!esOrigenValido(origen)) {
        problemas.push(
          `ORIGENES_PERMITIDOS contiene un origen inválido: "${origen}" (use el formato https://dominio.com, sin ruta ni barra final)`,
        );
      }
    }
  }

  if (!esZonaHorariaValida(variables.ZONA_HORARIA_NEGOCIO)) {
    problemas.push(
      `ZONA_HORARIA_NEGOCIO no es una zona horaria válida: "${variables.ZONA_HORARIA_NEGOCIO}"`,
    );
  }

  if (variables.SECRETO_JWT_ACCESO !== undefined) {
    if (variables.SECRETO_JWT_ACCESO.length < LARGO_MINIMO_SECRETO_JWT) {
      problemas.push(
        `SECRETO_JWT_ACCESO debe tener al menos ${LARGO_MINIMO_SECRETO_JWT} caracteres`,
      );
    } else if (variables.SECRETO_JWT_ACCESO === variables.SECRETO_BFF) {
      problemas.push('SECRETO_JWT_ACCESO y SECRETO_BFF deben ser distintos');
    }
  }

  const exigeSecreto =
    variables.NODE_ENV === 'staging' || variables.NODE_ENV === 'production';
  if (exigeSecreto) {
    if (variables.SECRETO_BFF === undefined) {
      problemas.push(`SECRETO_BFF es obligatorio en ${variables.NODE_ENV}`);
    } else if (variables.SECRETO_BFF.length < LARGO_MINIMO_SECRETO_BFF) {
      problemas.push(
        `SECRETO_BFF debe tener al menos ${LARGO_MINIMO_SECRETO_BFF} caracteres`,
      );
    }
  }

  if (exigeSecreto && variables.COOKIES_SEGURAS !== 'true') {
    problemas.push(`COOKIES_SEGURAS debe ser true en ${variables.NODE_ENV}`);
  }

  if (variables.NODE_ENV === 'production') {
    for (const origen of origenes) {
      if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origen)) {
        problemas.push(
          `En producción, ORIGENES_PERMITIDOS no puede incluir localhost (${origen})`,
        );
      } else if (origen.startsWith('http://')) {
        problemas.push(
          `En producción, ORIGENES_PERMITIDOS solo admite https (${origen})`,
        );
      }
    }
    if (
      variables.NIVEL_DE_LOG === 'debug' ||
      variables.NIVEL_DE_LOG === 'trace'
    ) {
      problemas.push(
        'En producción, NIVEL_DE_LOG no puede ser debug ni trace (podrían registrarse datos personales)',
      );
    }
    if (variables.CANAL_DE_RECUPERACION === 'consola') {
      problemas.push(
        'En producción, CANAL_DE_RECUPERACION no puede ser consola (el enlace de recuperación quedaría escrito en el log)',
      );
    }
    if (variables.INTERVALO_SONDEO_OUTBOX_MS === 0) {
      problemas.push(
        'En producción, INTERVALO_SONDEO_OUTBOX_MS no puede ser 0 (los eventos pendientes nunca se entregarían)',
      );
    }
  }

  return problemas;
}

// Valida las variables de entorno y devuelve la instancia tipada.
// Lanza ErrorDeConfiguracion con TODOS los problemas, para corregirlos de una vez.
export function validarVariables(
  entorno: Record<string, unknown>,
): VariablesDeEntorno {
  // Una variable vacía (VARIABLE=) cuenta como ausente: así .env.ejemplo puede traer claves
  // sin valor y se aplican los valores por defecto.
  const conValor = Object.fromEntries(
    Object.entries(entorno).filter(
      ([, valor]) => !(typeof valor === 'string' && valor.trim() === ''),
    ),
  );

  const variables = plainToInstance(VariablesDeEntorno, conValor, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const problemas = mensajesDe(
    validateSync(variables, { skipMissingProperties: false }),
  );
  if (problemas.length > 0) {
    throw new ErrorDeConfiguracion(problemas);
  }

  const adicionales = reglasAdicionales(variables);
  if (adicionales.length > 0) {
    throw new ErrorDeConfiguracion(adicionales);
  }

  return variables;
}

export function configuracionDesdeVariables(
  variables: VariablesDeEntorno,
): Configuracion {
  return {
    entorno: variables.NODE_ENV,
    esProduccion: variables.NODE_ENV === 'production',
    puerto: variables.PUERTO,
    urlBaseDeDatos: variables.URL_BASE_DE_DATOS,
    origenesPermitidos: listaDeOrigenes(variables.ORIGENES_PERMITIDOS),
    nivelDeLog: variables.NIVEL_DE_LOG,
    zonaHorariaNegocio: variables.ZONA_HORARIA_NEGOCIO,
    intervaloSondeoOutboxMs: variables.INTERVALO_SONDEO_OUTBOX_MS,
    sentryDsn: variables.SENTRY_DSN ?? null,
    secretoBff: variables.SECRETO_BFF ?? null,
    secretoJwtAcceso: variables.SECRETO_JWT_ACCESO,
    idClaveJwt: variables.ID_CLAVE_JWT,
    duracionAccesoMin: variables.DURACION_ACCESO_MIN,
    duracionRefrescoDias: variables.DURACION_REFRESCO_DIAS,
    cookiesSeguras: variables.COOKIES_SEGURAS === 'true',
    versionPoliticaVigente: variables.VERSION_POLITICA_VIGENTE,
    versionConsentimientoSaludVigente:
      variables.VERSION_CONSENTIMIENTO_SALUD_VIGENTE,
    canalDeRecuperacion: variables.CANAL_DE_RECUPERACION,
  };
}
