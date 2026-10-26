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

const LARGO_MINIMO_SECRETO_BFF = 32;

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
  sentryDsn: string | null;
  secretoBff: string | null;
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
    sentryDsn: variables.SENTRY_DSN ?? null,
    secretoBff: variables.SECRETO_BFF ?? null,
  };
}
