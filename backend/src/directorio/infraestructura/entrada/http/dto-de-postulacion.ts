import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  JORNADAS,
  type Jornada,
} from '../../../../compartido/dominio/jornada.js';
import {
  ANIOS_MAXIMOS_DE_EXPERIENCIA,
  LARGO_MAXIMO_DE_BIO,
  LARGO_MAXIMO_DE_TITULO,
  LARGO_MAXIMO_DE_ZONA,
} from '../../../dominio/cuidador.js';
import {
  ESPECIALIDADES,
  ESTADOS_DE_VERIFICACION,
  type Especialidad,
  type EstadoDeVerificacion,
} from '../../../dominio/valores-cerrados.js';

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

  @IsIn(JORNADAS, {
    each: true,
    message: 'Las jornadas válidas son mañana, tarde y noche',
  })
  @ArrayMinSize(1, { message: 'Elige al menos una jornada' })
  @ArrayMaxSize(JORNADAS.length)
  @ArrayUnique()
  disponibilidad!: Jornada[];

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
  @IsIn(JORNADAS, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(JORNADAS.length)
  @ArrayUnique()
  disponibilidad?: Jornada[];

  @IsOptional()
  @IsString()
  @MaxLength(LARGO_MAXIMO_DE_BIO * 2)
  bio?: string;

  // Solo el propio cuidador la activa.
  @IsOptional()
  @IsBoolean({ message: 'La aceptación automática debe ser verdadero o falso' })
  aceptacionAutomatica?: boolean;
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
