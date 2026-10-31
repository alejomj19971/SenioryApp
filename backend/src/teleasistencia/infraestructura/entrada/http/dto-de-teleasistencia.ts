import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ORIGENES_PEDIDOS_POR_PERSONAS } from '../../../dominio/alerta.js';
import { HORARIOS_MAXIMOS } from '../../../dominio/medicamento.js';
import { FUENTES_DE_LECTURA } from '../../../dominio/signos.js';

// Como en los demás DTO, solo se verifica la FORMA: las reglas (rangos plausibles, la presión completa, el día de
// la toma) las aplica el dominio. Ninguno trae quién registra algo ni el estado final: salen del token y del
// dominio, y el ValidationPipe global rechaza cualquier campo no declarado.

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export class MedicamentoDto {
  @IsString({ message: 'El nombre es obligatorio' })
  @Length(1, 400, { message: 'El nombre no es válido' })
  nombre!: string;

  @IsString({ message: 'La dosis es obligatoria' })
  @Length(1, 400, { message: 'La dosis no es válida' })
  dosis!: string;

  @IsOptional()
  @IsString({ message: 'Las indicaciones no son válidas' })
  @Length(0, 2000, { message: 'Las indicaciones son demasiado largas' })
  indicaciones?: string;

  @IsArray({ message: 'Los horarios deben ser una lista' })
  @ArrayMinSize(1, { message: 'Indica al menos un horario' })
  @ArrayMaxSize(HORARIOS_MAXIMOS, {
    message: `Máximo ${HORARIOS_MAXIMOS} horarios`,
  })
  @ArrayUnique({ message: 'Hay horarios repetidos' })
  @Matches(HORA, {
    each: true,
    message: 'Cada horario debe tener el formato HH:mm',
  })
  horarios!: string[];

  @IsOptional()
  @IsArray({ message: 'Los días deben ser una lista' })
  @ArrayMinSize(1, { message: 'Indica al menos un día' })
  @ArrayMaxSize(7, { message: 'Los días van de 1 a 7' })
  @IsInt({ each: true, message: 'Los días van de 1 (lunes) a 7 (domingo)' })
  @Min(1, { each: true, message: 'Los días van de 1 (lunes) a 7 (domingo)' })
  @Max(7, { each: true, message: 'Los días van de 1 (lunes) a 7 (domingo)' })
  diasDeLaSemana?: number[];

  @IsOptional()
  @Matches(FECHA, {
    message: 'La fecha de inicio debe tener el formato AAAA-MM-DD',
  })
  vigenteDesde?: string;

  @IsOptional()
  @Matches(FECHA, {
    message: 'La fecha final debe tener el formato AAAA-MM-DD',
  })
  vigenteHasta?: string;
}

export class ConsultaDeMedicamentosDto {
  @IsOptional()
  @Matches(FECHA, { message: 'La fecha debe tener el formato AAAA-MM-DD' })
  fecha?: string;
}

export class CambioDeTomaDto {
  @IsIn(['tomada', 'pendiente'], {
    message: 'El estado debe ser «tomada» o «pendiente»',
  })
  estado!: 'tomada' | 'pendiente';
}

export class LecturaDto {
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'La fecha de la lectura no es válida' },
  )
  tomadaEn?: string;

  @IsOptional()
  @IsInt({ message: 'La presión sistólica debe ser un número entero' })
  presionSistolica?: number;

  @IsOptional()
  @IsInt({ message: 'La presión diastólica debe ser un número entero' })
  presionDiastolica?: number;

  @IsOptional()
  @IsInt({ message: 'La frecuencia cardiaca debe ser un número entero' })
  frecuenciaCardiaca?: number;

  @IsOptional()
  @IsInt({ message: 'La glucosa debe ser un número entero' })
  glucosa?: number;

  @IsOptional()
  @IsIn(FUENTES_DE_LECTURA, {
    message: `La fuente debe ser una de: ${FUENTES_DE_LECTURA.join(', ')}`,
  })
  fuente?: 'manual' | 'dispositivo';
}

export class ConsultaDeSignosDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Los días deben ser un número entero' })
  dias?: number;
}

export class RangosDto {
  @IsOptional()
  @IsInt({ message: 'El límite no es válido' })
  sistolicaMin?: number;
  @IsOptional()
  @IsInt({ message: 'El límite no es válido' })
  sistolicaMax?: number;
  @IsOptional()
  @IsInt({ message: 'El límite no es válido' })
  diastolicaMin?: number;
  @IsOptional()
  @IsInt({ message: 'El límite no es válido' })
  diastolicaMax?: number;
  @IsOptional()
  @IsInt({ message: 'El límite no es válido' })
  frecuenciaMin?: number;
  @IsOptional()
  @IsInt({ message: 'El límite no es válido' })
  frecuenciaMax?: number;
  @IsOptional()
  @IsInt({ message: 'El límite no es válido' })
  glucosaMin?: number;
  @IsOptional()
  @IsInt({ message: 'El límite no es válido' })
  glucosaMax?: number;
}

export class AlertaDto {
  @IsIn(ORIGENES_PEDIDOS_POR_PERSONAS, {
    message: `El origen debe ser uno de: ${ORIGENES_PEDIDOS_POR_PERSONAS.join(', ')}`,
  })
  origen!: string;
}

export class AtencionDeAlertaDto {
  @IsOptional()
  @IsString({ message: 'La nota no es válida' })
  @Length(0, 1200, { message: 'La nota es demasiado larga' })
  nota?: string;
}
