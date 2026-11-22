import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LIMITE_MAXIMO } from '../../../dominio/cursor-de-mensajes.js';

// Solo la FORMA. El largo y el contenido exactos del texto los valida el dominio (1 a 1000 caracteres, texto plano);
// aquí solo se corta lo absurdo antes de llegar a él. El ValidationPipe rechaza cualquier campo no declarado.
//
// Quién manda cuál: la familia manda `cuidadorId` (con quién quiere hablar); el cuidador manda `familiarId`. El
// controlador lee el que le toca según el rol de quien hace la petición.
export class AperturaDeConversacionDto {
  @IsOptional()
  @IsUUID(undefined, { message: 'El cuidador no es válido' })
  cuidadorId?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'La familia no es válida' })
  familiarId?: string;
}

export class EnvioDeMensajeDto {
  @IsString({ message: 'El mensaje debe ser un texto' })
  @MaxLength(10_000, { message: 'El mensaje es demasiado largo' })
  texto!: string;

  // Lo genera la interfaz para cada mensaje: reenviarlo (mala conexión) no lo duplica.
  @IsUUID(undefined, { message: 'El identificador del mensaje no es válido' })
  idDeCliente!: string;
}

export class ListadoDeMensajesDto {
  @IsOptional()
  @IsString({ message: 'El cursor no es válido' })
  @Matches(/^[A-Za-z0-9_-]{1,200}$/, { message: 'El cursor no es válido' })
  antes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: `El límite debe estar entre 1 y ${LIMITE_MAXIMO}` })
  @Max(LIMITE_MAXIMO, {
    message: `El límite debe estar entre 1 y ${LIMITE_MAXIMO}`,
  })
  limite?: number;
}
