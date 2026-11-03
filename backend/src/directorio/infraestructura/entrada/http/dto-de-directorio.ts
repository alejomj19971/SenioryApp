import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { LIMITE_MAXIMO } from '../../../dominio/filtros-de-cuidadores.js';

// Como en los demás DTO, solo se verifica la FORMA (que sea texto o número): las reglas (qué zona existe, qué
// especialidad es válida, cuánto es una tarifa razonable) las aplica el dominio. Los parámetros que no se
// declaran aquí se rechazan (lista blanca del ValidationPipe).

export class BusquedaDeCuidadoresDto {
  @IsOptional()
  @IsString({ message: 'La búsqueda no es válida' })
  @Length(0, 200, { message: 'La búsqueda es demasiado larga' })
  busqueda?: string;

  @IsOptional()
  @IsString({ message: 'La especialidad no es válida' })
  @Length(0, 50, { message: 'La especialidad no es válida' })
  especialidad?: string;

  @IsOptional()
  @IsString({ message: 'La zona no es válida' })
  @Length(0, 200, { message: 'La zona es demasiado larga' })
  zona?: string;

  @IsOptional()
  @IsString({ message: 'La jornada no es válida' })
  @Length(0, 20, { message: 'La jornada no es válida' })
  jornada?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La tarifa máxima debe ser un número entero' })
  @Min(1, { message: 'La tarifa máxima debe ser mayor que cero' })
  tarifaMaxima?: number;

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

export class ArchivoFirmadoDto {
  @IsString({ message: 'Falta el archivo' })
  @Length(1, 200, { message: 'El archivo no es válido' })
  clave!: string;

  @Type(() => Number)
  @IsInt({ message: 'La fecha de vencimiento no es válida' })
  expira!: number;

  @IsString({ message: 'Falta la firma' })
  @Length(1, 200, { message: 'La firma no es válida' })
  firma!: string;
}

export class ClaveDeFotoDto {
  @IsString({ message: 'Falta el archivo' })
  @Length(1, 200, { message: 'El archivo no es válido' })
  clave!: string;
}
