import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  ANIOS_MAXIMOS_DE_EXPERIENCIA,
  LARGO_MAXIMO_DE_BIO,
  LARGO_MAXIMO_DE_TITULO,
  LARGO_MAXIMO_DE_ZONA,
} from '../../../dominio/cuidador.js';
import {
  LATITUD_MAXIMA,
  LATITUD_MINIMA,
  LONGITUD_MAXIMA,
  LONGITUD_MINIMA,
} from '../../../dominio/ubicacion.js';
import {
  ESPECIALIDADES,
  ESTADOS_DE_VERIFICACION,
  type Especialidad,
  type EstadoDeVerificacion,
} from '../../../dominio/valores-cerrados.js';

const MAXIMO_DE_RANGOS_LIBRES = 50;

// Un bloque de horario libre: solo la FORMA (día ISO 1–7, horas en minutos). Que no se solape con otro del
// mismo día y que las horas sean múltiplos de 30 lo valida el dominio (`Cuidador.actualizarPerfil`).
export class RangoLibreDto {
  @IsInt({ message: 'El día debe ser un número entero de 1 (lunes) a 7 (domingo)' })
  @Min(1, { message: 'El día debe ser un número entero de 1 (lunes) a 7 (domingo)' })
  @Max(7, { message: 'El día debe ser un número entero de 1 (lunes) a 7 (domingo)' })
  diaSemana!: number;

  @IsInt({ message: 'La hora de inicio no es válida' })
  @Min(0)
  @Max(1410)
  horaInicio!: number;

  @IsInt({ message: 'La hora de fin no es válida' })
  @Min(30)
  @Max(1440)
  horaFin!: number;
}

// Solo la FORMA. Las reglas del perfil (largos, teléfono, tarifa) las valida el dominio. El ValidationPipe rechaza
// cualquier campo no declarado: ni el nombre (sale de la cuenta), ni el estado, ni la visibilidad, ni el usuario se
// pueden enviar.
export class PerfilDeCuidadorDto {
  @IsIn(ESPECIALIDADES, { message: 'La especialidad no es válida' })
  especialidad!: Especialidad;

  @IsString({ message: 'El título debe ser un texto' })
  @MaxLength(LARGO_MAXIMO_DE_TITULO * 2)
  titulo!: string;

  @Type(() => Number)
  @IsInt({ message: 'Los años de experiencia deben ser un número entero' })
  @Min(0)
  @Max(ANIOS_MAXIMOS_DE_EXPERIENCIA)
  aniosExperiencia!: number;

  @Type(() => Number)
  @IsInt({ message: 'La tarifa debe ser un número entero de pesos' })
  @Min(1)
  @Max(10_000_000)
  tarifaHora!: number;

  @IsString({ message: 'El teléfono debe ser un texto' })
  @MaxLength(30)
  telefono!: string;

  @IsString({ message: 'La zona debe ser un texto' })
  @MaxLength(LARGO_MAXIMO_DE_ZONA * 2)
  zona!: string;

  @ValidateNested({ each: true })
  @Type(() => RangoLibreDto)
  @ArrayMinSize(1, { message: 'Agrega al menos un rango de horario libre' })
  @ArrayMaxSize(MAXIMO_DE_RANGOS_LIBRES)
  horariosLibres!: RangoLibreDto[];

  @IsString({ message: 'La presentación debe ser un texto' })
  @MaxLength(LARGO_MAXIMO_DE_BIO * 2)
  bio!: string;
}

// Todo opcional: lo que no viene se queda como está.
export class CambiosDePerfilDto {
  @IsOptional()
  @IsIn(ESPECIALIDADES, { message: 'La especialidad no es válida' })
  especialidad?: Especialidad;

  @IsOptional()
  @IsString()
  @MaxLength(LARGO_MAXIMO_DE_TITULO * 2)
  titulo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(ANIOS_MAXIMOS_DE_EXPERIENCIA)
  aniosExperiencia?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  tarifaHora?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LARGO_MAXIMO_DE_ZONA * 2)
  zona?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RangoLibreDto)
  @ArrayMinSize(1, { message: 'Agrega al menos un rango de horario libre' })
  @ArrayMaxSize(MAXIMO_DE_RANGOS_LIBRES)
  horariosLibres?: RangoLibreDto[];

  @IsOptional()
  @IsString()
  @MaxLength(LARGO_MAXIMO_DE_BIO * 2)
  bio?: string;

  // Solo el propio cuidador la activa.
  @IsOptional()
  @IsBoolean({ message: 'La aceptación automática debe ser verdadero o falso' })
  aceptacionAutomatica?: boolean;

  // El pin que el cuidador fija en el mapa (nunca se geocodifica un texto de dirección). Las dos juntas o
  // ninguna: el dominio rechaza una sola.
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'La latitud no es válida' })
  @Min(LATITUD_MINIMA, { message: 'La latitud no es válida' })
  @Max(LATITUD_MAXIMA, { message: 'La latitud no es válida' })
  latitud?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'La longitud no es válida' })
  @Min(LONGITUD_MINIMA, { message: 'La longitud no es válida' })
  @Max(LONGITUD_MAXIMA, { message: 'La longitud no es válida' })
  longitud?: number;
}

export class ListadoDeVerificacionesDto {
  @IsOptional()
  @IsIn(ESTADOS_DE_VERIFICACION, { message: 'El estado no es válido' })
  estado?: EstadoDeVerificacion;
}

export class RevisionDeVerificacionDto {
  @IsIn(['aprobar', 'rechazar'], {
    message: 'La decisión debe ser «aprobar» o «rechazar»',
  })
  decision!: 'aprobar' | 'rechazar';

  // "AAAA-MM-DD"; null si el control no vence. Solo al aprobar.
  @ValidateIf((_o, valor) => valor !== undefined && valor !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La vigencia debe ser AAAA-MM-DD',
  })
  vigenteHasta?: string | null;

  // Solo al rechazar.
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Explica por qué se rechaza' })
  @MaxLength(1000)
  motivo?: string;
}

export class RevisionDeDocumentoDto {
  @IsIn(['aprobar', 'rechazar'], {
    message: 'La decisión debe ser «aprobar» o «rechazar»',
  })
  decision!: 'aprobar' | 'rechazar';
}

export class IdDeDocumentoDto {
  @IsUUID()
  id!: string;
}
