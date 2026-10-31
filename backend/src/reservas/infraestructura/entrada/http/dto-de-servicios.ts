import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { JORNADAS } from '../../../../compartido/dominio/jornada.js';
import { LIMITE_MAXIMO } from '../../../dominio/cursor-de-servicios.js';
import {
  ESTADOS_DE_SERVICIO,
  MEDIOS_DE_PAGO,
} from '../../../dominio/valores-cerrados.js';
import { LARGO_MAXIMO_DEL_COMENTARIO } from '../../../dominio/calificacion.js';
import { HORAS_MAXIMAS, HORAS_MINIMAS } from '../../../dominio/servicio.js';

// Como en los demás DTO, solo se verifica la FORMA: las reglas (fecha pasada, franja ocupada, consentimiento)
// las aplica el dominio. Ninguno trae montos, tarifas ni el rol: el servidor los calcula, y el ValidationPipe
// global rechaza cualquier campo no declarado.

export class SolicitudDeServicioDto {
  @IsUUID(undefined, { message: 'La persona mayor no es válida' })
  adultoMayorId!: string;

  @IsUUID(undefined, { message: 'El cuidador no es válido' })
  cuidadorId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener el formato AAAA-MM-DD',
  })
  fecha!: string;

  @IsIn(JORNADAS, {
    message: `La jornada debe ser una de: ${JORNADAS.join(', ')}`,
  })
  jornada!: string;

  @IsInt({ message: 'Las horas deben ser un número entero' })
  @Min(HORAS_MINIMAS, {
    message: `Las horas deben estar entre ${HORAS_MINIMAS} y ${HORAS_MAXIMAS}`,
  })
  @Max(HORAS_MAXIMAS, {
    message: `Las horas deben estar entre ${HORAS_MINIMAS} y ${HORAS_MAXIMAS}`,
  })
  horas!: number;

  @IsIn(MEDIOS_DE_PAGO, {
    message: `El medio de pago debe ser uno de: ${MEDIOS_DE_PAGO.join(', ')}`,
  })
  medioDePago!: string;
}

export class CalificacionDto {
  @IsInt({ message: 'La calificación debe ser un número entero' })
  @Min(1, { message: 'La calificación debe estar entre 1 y 5' })
  @Max(5, { message: 'La calificación debe estar entre 1 y 5' })
  calificacion!: number;

  @IsOptional()
  @IsString({ message: 'El comentario no es válido' })
  @Length(0, LARGO_MAXIMO_DEL_COMENTARIO * 4, {
    message: 'El comentario es demasiado largo',
  })
  comentario?: string;
}

export class ListadoDeServiciosDto {
  @IsOptional()
  @IsIn(ESTADOS_DE_SERVICIO, {
    message: `El estado debe ser uno de: ${ESTADOS_DE_SERVICIO.join(', ')}`,
  })
  estado?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: `El límite debe estar entre 1 y ${LIMITE_MAXIMO}` })
  @Max(LIMITE_MAXIMO, {
    message: `El límite debe estar entre 1 y ${LIMITE_MAXIMO}`,
  })
  limite?: number;

  @IsOptional()
  @IsString({ message: 'El cursor no es válido' })
  @Length(0, 500, { message: 'El cursor no es válido' })
  cursor?: string;
}
